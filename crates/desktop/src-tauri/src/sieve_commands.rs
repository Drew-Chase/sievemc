//! Tauri commands bridging the desktop UI to the `sievemc` core library.
//!
//! - [`scan`] walks a mods directory, classifies each jar via
//!   [`sievemc::detect_mod`], and streams `sieve://scan-progress` events so the
//!   UI can render a live tally + log while the scan runs.
//! - [`export`] copies/zips the reviewed set through [`sievemc::export_mods`].
//! - [`open_path`] reveals an output folder in the OS file manager.

use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tracing::{info, warn};

use sievemc::{ExportItem, ExportReceipt, ExportSide, ModDetection, OutputType, Side};

/// Emitted once per jar as a scan progresses (channel: `sieve://scan-progress`).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    /// 1-based index of the jar just processed.
    index: usize,
    total: usize,
    filename: String,
    side: Option<Side>,
    evidence: String,
    // Running tallies for the four buckets shown on the scan screen.
    client: usize,
    server: usize,
    both: usize,
    unsure: usize,
}

/// Scan `directory` for `*.jar` mods, classifying each one.
///
/// Emits a [`ScanProgress`] event after every jar and returns the full list of
/// detections (including "unsure" ones with `side: null`) when finished.
#[tauri::command]
pub async fn scan(app: AppHandle, directory: String) -> Result<Vec<ModDetection>, String> {
    let dir = PathBuf::from(&directory);
    info!("Scan requested for {}", dir.display());

    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| format!("Could not read directory: {e}"))?
        .filter_map(|f| f.ok().map(|e| e.path()))
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("jar"))
                    .unwrap_or(false)
        })
        .collect();
    files.sort();

    let total = files.len();
    let mut results: Vec<ModDetection> = Vec::with_capacity(total);
    let (mut client, mut server, mut both, mut unsure) = (0usize, 0usize, 0usize, 0usize);

    for (i, file) in files.iter().enumerate() {
        let detection = sievemc::detect_mod(file);
        match detection.side {
            Some(Side::ClientOnly) => client += 1,
            Some(Side::ServerOnly) => server += 1,
            Some(Side::ClientAndServer) => both += 1,
            None => unsure += 1,
        }

        if let Err(e) = app.emit(
            "sieve://scan-progress",
            ScanProgress {
                index: i + 1,
                total,
                filename: detection.filename.clone(),
                side: detection.side.clone(),
                evidence: detection.evidence.clone(),
                client,
                server,
                both,
                unsure,
            },
        ) {
            warn!("Failed to emit scan-progress: {e}");
        }

        results.push(detection);
    }

    info!(
        "Scan complete: {total} jars ({client} client, {server} server, {both} both, {unsure} unsure)"
    );
    Ok(results)
}

/// A single mod with its effective (possibly user-overridden) side.
#[derive(serde::Deserialize)]
struct ExportItemDto {
    path: String,
    side: Side,
}

/// Payload for [`export`], sent from the Export page.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    items: Vec<ExportItemDto>,
    side: ExportSide,
    output_type: OutputType,
    dest_client: Option<String>,
    dest_server: Option<String>,
}

/// Export the reviewed mod set to disk, returning a receipt for the Done screen.
#[tauri::command]
pub async fn export(app: AppHandle, request: ExportRequest) -> Result<ExportReceipt, String> {
    let _ = app.emit("sieve://export-start", ());

    let items: Vec<ExportItem> = request
        .items
        .into_iter()
        .map(|i| ExportItem {
            path: PathBuf::from(i.path),
            side: i.side,
        })
        .collect();

    let receipt = sievemc::export_mods(
        &items,
        request.side,
        request.output_type,
        request.dest_client.map(PathBuf::from),
        request.dest_server.map(PathBuf::from),
    )
    .map_err(|e| e.to_string())?;

    let _ = app.emit("sieve://export-done", &receipt);
    Ok(receipt)
}

/// Reveal a path (usually an export folder) in the OS file manager.
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}
