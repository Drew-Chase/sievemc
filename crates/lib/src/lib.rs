use rayon::prelude::*;
use serde::de::Error as _;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::str::from_utf8;
use tracing::{debug, info, trace, warn};

#[derive(thiserror::Error, Debug)]
pub enum SieveError {
    #[error(transparent)]
    IOError(#[from] std::io::Error),
    #[error("Missing schema property: {0}")]
    MissingSchemaProperty(String),
    #[error("{0} missing schema property: {1}")]
    FileMissingSchemaProperty(PathBuf, String),
    #[error("{0} missing schema property: {1}")]
    FileMissingEntry(PathBuf, String),
    #[error(transparent)]
    DeserializationError(#[from] serde_json::Error),
    #[error(transparent)]
    ZipError(#[from] zip::result::ZipError),
    #[error(transparent)]
    Utf8Error(#[from] std::str::Utf8Error),
    #[error(transparent)]
    TomlError(#[from] toml::de::Error),
}

#[derive(Debug, Eq, PartialEq, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Side {
    ClientOnly,
    ServerOnly,
    ClientAndServer,
}

const DEFAULT_MULTITHREAD_THRESHOLD: u8 = 10;
pub(crate) fn multithread_threashold() -> u8 {
    option_env!("SIEVEMC_MULTITHREAD_THREASHOLD")
        .map(|s| s.parse().unwrap_or(DEFAULT_MULTITHREAD_THRESHOLD))
        .unwrap_or(DEFAULT_MULTITHREAD_THRESHOLD)
}

pub fn get_many_mod_file_sides(
    directory: impl AsRef<Path>,
) -> Result<HashMap<PathBuf, Side>, SieveError> {
    let directory = directory.as_ref();
    info!("Scanning directory: {}", directory.display());

    let files: Vec<PathBuf> = std::fs::read_dir(directory)?
        .filter_map(|f| {
            if let Ok(f) = f {
                Some(f.path())
            } else {
                warn!("Failed to read directory entry, skipping");
                None
            }
        })
        .collect();

    debug!("Found {} files in directory", files.len());

    let threshold = multithread_threashold() as usize;
    let use_multithread = files.len() > threshold;
    trace!(
        "Multithread threshold: {}, use_multithread: {}",
        threshold,
        use_multithread
    );

    let sides = if use_multithread {
        info!("Using parallel processing for {} files", files.len());
        files
            .into_par_iter()
            .filter_map(|file| {
                trace!("Processing file (parallel): {}", file.display());
                match get_mod_file_side(&file) {
                    Ok(side) => {
                        debug!("Detected side {:?} for {}", side, file.display());
                        Some((file, side))
                    }
                    Err(e) => {
                        warn!("Skipping {}: {}", file.display(), e);
                        None
                    }
                }
            })
            .collect::<HashMap<_, _>>()
    } else {
        let mut sides: HashMap<PathBuf, Side> = HashMap::new();
        for file in files {
            trace!("Processing file: {}", file.display());
            let side = get_mod_file_side(&file).map_err(|e| match e {
                SieveError::MissingSchemaProperty(property) => {
                    SieveError::FileMissingSchemaProperty(file.clone(), property)
                }
                _ => e,
            })?;
            debug!("Detected side {:?} for {}", side, file.display());
            sides.insert(file, side);
        }
        sides
    };

    info!("Successfully processed {} mod files", sides.len());
    Ok(sides)
}

pub fn get_mod_file_side(file: impl AsRef<Path>) -> Result<Side, SieveError> {
    let file = file.as_ref();
    debug!("Inspecting mod file: {}", file.display());

    let mut archive = zip::ZipArchive::new(File::open(file)?)?;

    if let Ok(entry) = archive.by_name("fabric.mod.json") {
        trace!("Found fabric.mod.json in {}", file.display());
        let contents: serde_json::Value = serde_json::from_reader(entry)?;
        let side = get_json_schema_side(contents)?;
        info!("Fabric mod {}: {:?}", file.display(), side);
        Ok(side)
    } else if let Some(buf) = read_archive_entry(&mut archive, "META-INF/neoforge.mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "neoforge.mods.toml"))
    {
        trace!("Found neoforge.mods.toml in {}", file.display());
        let value: toml::Value = toml::from_str(from_utf8(&buf)?)?;
        let side = get_loader_toml_side(value, "neoforge")?;
        info!("NeoForge mod {}: {:?}", file.display(), side);
        Ok(side)
    } else if let Some(buf) = read_archive_entry(&mut archive, "META-INF/mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "mods.toml"))
    {
        trace!("Found mods.toml in {}", file.display());
        let value: toml::Value = toml::from_str(from_utf8(&buf)?)?;
        let side = get_loader_toml_side(value, "forge")?;
        info!("Forge mod {}: {:?}", file.display(), side);
        Ok(side)
    } else {
        warn!(
            "No recognized mod manifest found in {}",
            file.display()
        );
        Err(SieveError::FileMissingEntry(
            file.to_path_buf(),
            "fabric.mod.json, neoforge.mods.toml, or mods.toml".to_string(),
        ))
    }
}

/// Rich, non-fatal detection result for a single mod jar.
///
/// Unlike [`get_mod_file_side`], detection never fails here: a jar whose side
/// can't be determined is returned with `side == None` and a human-readable
/// `evidence` string, so the desktop UI can surface it as "Unsure" for review.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModDetection {
    /// Absolute (or as-given) path to the jar.
    pub path: PathBuf,
    /// Just the file name, e.g. `sodium-fabric-0.6.13.jar`.
    pub filename: String,
    /// Detected side, or `None` when it couldn't be determined ("unsure").
    pub side: Option<Side>,
    /// Human-readable reason, e.g. `fabric.mod.json → client`.
    pub evidence: String,
    /// Which loader manifest was found, if any: `fabric` / `forge` / `neoforge`.
    pub loader: Option<String>,
}

fn side_label(side: &Side) -> &'static str {
    match side {
        Side::ClientOnly => "client",
        Side::ServerOnly => "server",
        Side::ClientAndServer => "both",
    }
}

/// Inspect a single jar and report its side, never erroring.
///
/// This mirrors the manifest-detection branches in [`get_mod_file_side`] but
/// additionally captures the evidence string and originating loader, and maps
/// any failure to an "unsure" result (`side: None`) instead of an `Err`.
pub fn detect_mod(path: impl AsRef<Path>) -> ModDetection {
    let path = path.as_ref();
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let (side, evidence, loader) = inspect_mod(path);
    debug!(
        "Detected {} for {}: {}",
        side.as_ref().map(side_label).unwrap_or("unsure"),
        path.display(),
        evidence
    );
    ModDetection {
        path: path.to_path_buf(),
        filename,
        side,
        evidence,
        loader,
    }
}

fn inspect_mod(path: &Path) -> (Option<Side>, String, Option<String>) {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => return (None, format!("could not open jar: {e}"), None),
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => return (None, format!("not a valid jar: {e}"), None),
    };

    if let Ok(entry) = archive.by_name("fabric.mod.json") {
        let parsed = serde_json::from_reader(entry)
            .map_err(SieveError::from)
            .and_then(get_json_schema_side);
        return match parsed {
            Ok(side) => {
                let evidence = format!("fabric.mod.json → {}", side_label(&side));
                (Some(side), evidence, Some("fabric".to_string()))
            }
            Err(_) => (
                None,
                "fabric.mod.json → no side metadata found".to_string(),
                Some("fabric".to_string()),
            ),
        };
    }

    if let Some(buf) = read_archive_entry(&mut archive, "META-INF/neoforge.mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "neoforge.mods.toml"))
    {
        return toml_detection(&buf, "neoforge", "neoforge.mods.toml");
    }

    if let Some(buf) = read_archive_entry(&mut archive, "META-INF/mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "mods.toml"))
    {
        return toml_detection(&buf, "forge", "mods.toml");
    }

    (None, "no side metadata found".to_string(), None)
}

fn toml_detection(buf: &[u8], loader: &str, manifest: &str) -> (Option<Side>, String, Option<String>) {
    let text = match from_utf8(buf) {
        Ok(t) => t,
        Err(_) => {
            return (
                None,
                format!("{manifest} → not valid UTF-8"),
                Some(loader.to_string()),
            );
        }
    };
    let value: toml::Value = match toml::from_str(text) {
        Ok(v) => v,
        Err(e) => return (None, format!("{manifest} → parse error: {e}"), Some(loader.to_string())),
    };
    match get_loader_toml_side(value, loader) {
        Ok(side) => {
            let evidence = format!("{manifest} → {}", side_label(&side));
            (Some(side), evidence, Some(loader.to_string()))
        }
        Err(_) => (
            None,
            format!("{manifest} → no side metadata found"),
            Some(loader.to_string()),
        ),
    }
}

/// Detect the side of every `*.jar` in `directory` (non-recursive), returning a
/// stable, alphabetically-sorted list. Unlike [`get_many_mod_file_sides`], jars
/// that can't be classified are retained with `side: None`.
pub fn detect_mods(directory: impl AsRef<Path>) -> Result<Vec<ModDetection>, SieveError> {
    let directory = directory.as_ref();
    info!("Detecting mods in directory: {}", directory.display());

    let mut files: Vec<PathBuf> = std::fs::read_dir(directory)?
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

    Ok(files.iter().map(detect_mod).collect())
}

/// Which side(s) an export cares about. `Both` produces two output sets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportSide {
    Client,
    Server,
    Both,
}

/// How the export is materialized on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OutputType {
    /// Copy jars into a folder.
    Directory,
    /// Bundle jars into a `.zip`.
    Archive,
    /// Copy nothing — only report the filename lists.
    List,
}

/// A mod plus its *effective* side (after any user override in the UI).
#[derive(Debug, Clone)]
pub struct ExportItem {
    pub path: PathBuf,
    pub side: Side,
}

/// Summary of what an export produced, suitable for the "Done" receipt screen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportReceipt {
    /// Filenames that went to the client set.
    pub client: Vec<String>,
    /// Filenames that went to the server set.
    pub server: Vec<String>,
    /// Paths actually written (folders or zips); empty for `List`.
    pub outputs: Vec<PathBuf>,
    pub duration_ms: u128,
}

fn filename_of(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn copy_into_dir(items: &[&ExportItem], dir: &Path) -> Result<(), SieveError> {
    std::fs::create_dir_all(dir)?;
    for item in items {
        let dest = dir.join(filename_of(&item.path));
        trace!(src = %item.path.display(), dest = %dest.display(), "Copying mod");
        std::fs::copy(&item.path, dest)?;
    }
    Ok(())
}

fn write_archive(items: &[&ExportItem], zip_path: &Path) -> Result<(), SieveError> {
    if let Some(parent) = zip_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut writer = zip::ZipWriter::new(File::create(zip_path)?);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);
    for item in items {
        writer.start_file(filename_of(&item.path), options)?;
        let mut reader = File::open(&item.path)?;
        std::io::copy(&mut reader, &mut writer)?;
    }
    writer.finish()?;
    Ok(())
}

/// Export `items` (already carrying their effective side) according to `side`
/// and `output`. For a single-side export, pass the destination as
/// `dest_client` (client) or `dest_server` (server); for `Both`, provide both.
///
/// This is the shared, GUI-friendly counterpart to the copy/zip logic in the
/// CLI (`crates/cli/src/main.rs`).
pub fn export_mods(
    items: &[ExportItem],
    side: ExportSide,
    output: OutputType,
    dest_client: Option<PathBuf>,
    dest_server: Option<PathBuf>,
) -> Result<ExportReceipt, SieveError> {
    let start = std::time::Instant::now();
    let want_client = matches!(side, ExportSide::Client | ExportSide::Both);
    let want_server = matches!(side, ExportSide::Server | ExportSide::Both);

    let client_items: Vec<&ExportItem> = items
        .iter()
        .filter(|i| matches!(i.side, Side::ClientOnly | Side::ClientAndServer))
        .collect();
    let server_items: Vec<&ExportItem> = items
        .iter()
        .filter(|i| matches!(i.side, Side::ServerOnly | Side::ClientAndServer))
        .collect();

    let client_names: Vec<String> = client_items.iter().map(|i| filename_of(&i.path)).collect();
    let server_names: Vec<String> = server_items.iter().map(|i| filename_of(&i.path)).collect();

    let mut outputs = Vec::new();
    match output {
        OutputType::List => {}
        OutputType::Directory => {
            if want_client {
                if let Some(dir) = &dest_client {
                    copy_into_dir(&client_items, dir)?;
                    outputs.push(dir.clone());
                }
            }
            if want_server {
                if let Some(dir) = &dest_server {
                    copy_into_dir(&server_items, dir)?;
                    outputs.push(dir.clone());
                }
            }
        }
        OutputType::Archive => {
            if want_client {
                if let Some(zip) = &dest_client {
                    write_archive(&client_items, zip)?;
                    outputs.push(zip.clone());
                }
            }
            if want_server {
                if let Some(zip) = &dest_server {
                    write_archive(&server_items, zip)?;
                    outputs.push(zip.clone());
                }
            }
        }
    }

    let receipt = ExportReceipt {
        client: if want_client { client_names } else { Vec::new() },
        server: if want_server { server_names } else { Vec::new() },
        outputs,
        duration_ms: start.elapsed().as_millis(),
    };
    info!(
        "Export complete in {}ms: {} client, {} server",
        receipt.duration_ms,
        receipt.client.len(),
        receipt.server.len()
    );
    Ok(receipt)
}

fn read_archive_entry(archive: &mut zip::ZipArchive<File>, name: &str) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok().map(|_| buf)
}

fn get_loader_toml_side(contents: toml::Value, loader: &str) -> Result<Side, SieveError> {
    let mod_id = contents
        .get("mods")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|m| m.get("modId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| SieveError::MissingSchemaProperty("mods[0].modId".to_string()))?;

    trace!("Resolving side for mod_id={mod_id} loader={loader}");

    let side_str = contents
        .get("dependencies")
        .and_then(|v| v.get(mod_id))
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|dep| dep.get("modId").and_then(|v| v.as_str()) == Some(loader))
        })
        .and_then(|dep| dep.get("side"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            SieveError::MissingSchemaProperty(format!("dependencies.{mod_id}[{loader}].side"))
        })?;

    debug!("Side string for {mod_id}: \"{side_str}\"");

    match side_str.to_uppercase().as_str() {
        "BOTH" => Ok(Side::ClientAndServer),
        "CLIENT" => Ok(Side::ClientOnly),
        "SERVER" => Ok(Side::ServerOnly),
        _ => {
            warn!("Unknown side value \"{side_str}\" for {mod_id} ({loader})");
            Err(SieveError::MissingSchemaProperty(format!(
                "dependencies.{mod_id}[{loader}].side (unknown value: {side_str})"
            )))
        }
    }
}

fn get_json_schema_side(schema: serde_json::Value) -> Result<Side, SieveError> {
    let mut client = false;
    let mut server = false;

    if let Some(entrypoints) = schema.get("entrypoints") {
        let entrypoints: Vec<&str> = entrypoints
            .as_object()
            .ok_or_else(|| {
                SieveError::DeserializationError(serde_json::error::Error::custom(
                    "Failed to deserialize entrypoints as object",
                ))
            })?
            .keys()
            .map(String::as_str)
            .collect();

        trace!("Fabric entrypoints: {:?}", entrypoints);

        client = entrypoints.contains(&"client");
        server = entrypoints.contains(&"server");
        if entrypoints.contains(&"main") {
            debug!("Found \"main\" entrypoint — treating as client+server");
            client = true;
            server = true;
        }
    }

    if let Some(environment) = schema.get("environment").and_then(|v| v.as_str()) {
        debug!("Fabric environment field: \"{environment}\"");
        match environment {
            "*" => {
                client = true;
                server = true;
            }
            "client" => {
                client = true;
                server = false;
            }
            "server" => {
                client = false;
                server = true;
            }
            _ => {
                warn!("Unknown environment value: \"{environment}\"");
            }
        }
    }

    match (client, server) {
        (true, true) => Ok(Side::ClientAndServer),
        (true, false) => Ok(Side::ClientOnly),
        (false, true) => Ok(Side::ServerOnly),
        (false, false) => {
            warn!("Could not determine side: no entrypoints or environment field resolved");
            Err(SieveError::MissingSchemaProperty(
                "entrypoints or environment".to_string(),
            ))
        }
    }
}

#[cfg(test)]
mod detect_test {
    use super::*;

    #[test]
    fn detect_client_with_evidence() {
        let d = detect_mod("../../examples/fabric_clientonly.jar");
        assert_eq!(d.side, Some(Side::ClientOnly));
        assert_eq!(d.loader.as_deref(), Some("fabric"));
        assert!(d.evidence.contains("fabric.mod.json"));
        assert_eq!(d.filename, "fabric_clientonly.jar");
    }

    #[test]
    fn detect_unsure_on_bogus_jar() {
        // A file that isn't a valid zip/jar must be reported as unsure, not error.
        let path = std::env::temp_dir().join("sievemc_not_a_jar.jar");
        std::fs::write(&path, b"this is not a zip archive").unwrap();
        let d = detect_mod(&path);
        assert_eq!(d.side, None);
        assert!(d.loader.is_none());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn export_directory_splits_both_sides() {
        let out = std::env::temp_dir().join(format!("sievemc_export_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&out);
        let client_dir = out.join("client");
        let server_dir = out.join("server");

        let items = vec![
            ExportItem {
                path: PathBuf::from("../../examples/fabric_clientonly.jar"),
                side: Side::ClientOnly,
            },
            ExportItem {
                path: PathBuf::from("../../examples/fabric_serveronly.jar"),
                side: Side::ServerOnly,
            },
            ExportItem {
                path: PathBuf::from("../../examples/fabric_client_server.jar"),
                side: Side::ClientAndServer,
            },
        ];

        let receipt = export_mods(
            &items,
            ExportSide::Both,
            OutputType::Directory,
            Some(client_dir.clone()),
            Some(server_dir.clone()),
        )
        .unwrap();

        // both-sides mod lands in each set; each side also gets its exclusive one.
        assert_eq!(receipt.client.len(), 2);
        assert_eq!(receipt.server.len(), 2);
        assert!(client_dir.join("fabric_clientonly.jar").exists());
        assert!(client_dir.join("fabric_client_server.jar").exists());
        assert!(server_dir.join("fabric_serveronly.jar").exists());
        assert!(!client_dir.join("fabric_serveronly.jar").exists());

        let _ = std::fs::remove_dir_all(&out);
    }
}

mod test {
    #[test]
    fn client_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_clientonly.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ClientOnly);
    }
    #[test]
    fn server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_serveronly.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ServerOnly);
    }
    #[test]
    fn client_server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_client_server.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ClientAndServer);
    }
}

#[cfg(test)]
mod neoforge_test {
    use super::*;

    fn parse_side(toml_str: &str, loader: &str) -> Result<Side, SieveError> {
        let value: toml::Value = toml::from_str(toml_str)?;
        get_loader_toml_side(value, loader)
    }

    #[test]
    fn neoforge_both_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
    modId="advanced_ae"
[[dependencies.advanced_ae]]
modId="neoforge"
type="required"
side="BOTH"
[[dependencies.advanced_ae]]
modId="minecraft"
type="required"
side="BOTH"
"#;
        assert_eq!(parse_side(toml, "neoforge").unwrap(), Side::ClientAndServer);
    }

    #[test]
    fn neoforge_client_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
modId="appleskin"
[[dependencies.appleskin]]
    modId="neoforge"
    type="required"
    side="CLIENT"
"#;
        assert_eq!(parse_side(toml, "neoforge").unwrap(), Side::ClientOnly);
    }

    #[test]
    fn forge_both_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
modId="xaerominimap"
[[dependencies.xaerominimap]]
modId="forge"
mandatory=true
side="BOTH"
[[dependencies.xaerominimap]]
modId="minecraft"
mandatory=true
side="BOTH"
"#;
        assert_eq!(parse_side(toml, "forge").unwrap(), Side::ClientAndServer);
    }
}
