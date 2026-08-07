//! GitHub-releases based updater.
//!
//! Two shapes of this app ship: a **portable** zip and an **installed** build
//! placed by `installer.nsi`. Only the installed build can update itself — the
//! update is applied by re-running the NSIS installer with `/S`, which
//! overwrites `$INSTDIR` in place. A portable copy has no `$INSTDIR` to
//! overwrite, so it is offered the release page in a browser instead.
//!
//! Flow (driven from the frontend so the "check for updates" setting is
//! honoured without duplicating the settings store in Rust):
//!
//! 1. [`check_for_update`] hits the GitHub releases API and compares semver.
//! 2. [`download_update`] fetches the `*setup.exe` asset to the temp dir,
//!    streaming `update://download-progress` as it goes. Downloading is
//!    automatic; installing is not.
//! 3. [`install_update`] runs that installer with `/S` and exits — the
//!    installer kills the running process and relaunches it when finished.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tracing::{debug, info, warn};

/// `owner/repo` the releases are published under.
const GITHUB_REPO: &str = "Drew-Chase/sievemc";

/// Version of the running binary, from Cargo.
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub rejects API requests without one.
const USER_AGENT: &str = concat!("sievemc/", env!("CARGO_PKG_VERSION"));

// --- GitHub API shapes (only the fields we consume) --------------------------

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GhAsset>,
}

// --- Payloads sent to the frontend -------------------------------------------

/// A published release, as the UI needs it (changelog page + install button).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    /// Tag with any leading `v` stripped, e.g. `0.2.2`.
    version: String,
    /// Release title, falling back to the tag when GitHub has none.
    name: String,
    /// Raw markdown release notes.
    notes: String,
    /// ISO-8601 publish timestamp.
    published_at: Option<String>,
    /// Web page for the release — what portable builds open.
    html_url: String,
    /// Download URL of the NSIS installer asset, when the release has one.
    installer_url: Option<String>,
    installer_size: Option<u64>,
}

/// Result of an update check.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// True when running from a location the NSIS installer owns.
    installed: bool,
    current_version: String,
    /// `Some` only when the latest release is strictly newer than the running
    /// build; `None` means "up to date".
    release: Option<ReleaseInfo>,
}

/// Progress of the installer download (channel: `update://download-progress`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    downloaded: u64,
    /// `0` when the server sent no `Content-Length`.
    total: u64,
}

// --- Install-mode detection ---------------------------------------------------

/// True when the running executable sits in the directory the installer
/// recorded in `HKCU\Software\SieveMC\InstallPath`.
///
/// Comparing against the registry (rather than looking for a marker file next
/// to the exe) means a *copy* of an installed directory is correctly treated as
/// portable — otherwise the silent installer would happily update the original
/// install while the user kept running the copy.
#[cfg(windows)]
fn is_installed() -> bool {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let Some(exe_dir) = current_exe_dir() else {
        return false;
    };

    let recorded = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\SieveMC")
        .and_then(|key| key.get_value::<String, _>("InstallPath"));

    match recorded {
        Ok(path) => {
            let same = normalize(Path::new(&path)) == normalize(&exe_dir);
            debug!(
                "Install check: exe dir {} vs registry {path} -> {}",
                exe_dir.display(),
                if same { "installed" } else { "portable" }
            );
            same
        }
        Err(e) => {
            debug!("No InstallPath in registry ({e}); treating as portable");
            false
        }
    }
}

/// Non-Windows builds have no NSIS installer, so they are always portable.
#[cfg(not(windows))]
fn is_installed() -> bool {
    false
}

fn current_exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf))
}

/// Canonicalize for comparison, tolerating paths that no longer resolve.
fn normalize(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    resolved
        .to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .to_lowercase()
}

// --- Commands -----------------------------------------------------------------

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Could not build HTTP client: {e}"))
}

/// Ask GitHub for the latest release and compare it against the running build.
///
/// Returns the install mode unconditionally so the UI knows which action to
/// offer (silent install vs. open the release page), and a `release` only when
/// an actual upgrade is available.
#[tauri::command]
pub async fn check_for_update() -> Result<UpdateStatus, String> {
    let installed = is_installed();
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    debug!("Checking for updates: {url}");

    let response = client()?
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Update check failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Update check failed: GitHub returned {}",
            response.status()
        ));
    }

    let release: GhRelease = response
        .json()
        .await
        .map_err(|e| format!("Could not parse the GitHub release: {e}"))?;

    let latest_version = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    if !is_newer(&latest_version, CURRENT_VERSION) {
        info!("Up to date (running {CURRENT_VERSION}, latest {latest_version})");
        return Ok(UpdateStatus {
            installed,
            current_version: CURRENT_VERSION.to_string(),
            release: None,
        });
    }

    // The NSIS output is published as `sievemc-setup.exe` (see the `dist-os`
    // recipe); match on the suffix so a renamed/versioned asset still resolves.
    let installer = release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with("setup.exe"));

    info!("Update available: {CURRENT_VERSION} -> {latest_version}");
    Ok(UpdateStatus {
        installed,
        current_version: CURRENT_VERSION.to_string(),
        release: Some(ReleaseInfo {
            name: release.name.unwrap_or_else(|| release.tag_name.clone()),
            version: latest_version,
            notes: release.body.unwrap_or_default(),
            published_at: release.published_at,
            html_url: release.html_url,
            installer_url: installer.map(|a| a.browser_download_url.clone()),
            installer_size: installer.map(|a| a.size),
        }),
    })
}

/// Strict semver "greater than", falling back to string inequality for tags
/// that aren't valid semver (in which case any difference counts as newer).
fn is_newer(latest: &str, current: &str) -> bool {
    match (semver::Version::parse(latest), semver::Version::parse(current)) {
        (Ok(latest), Ok(current)) => latest > current,
        _ => {
            warn!("Non-semver version tag ({latest} vs {current}); comparing as strings");
            latest != current
        }
    }
}

/// Download the installer for `version` to the temp directory and return its path.
///
/// Streams `update://download-progress` while running. An already-complete
/// download of the same version is reused rather than re-fetched.
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    version: String,
    expected_size: Option<u64>,
) -> Result<String, String> {
    // An absolute temp path, not a relative one: when the app is autostarted
    // from the HKCU Run key the process CWD is C:\Windows\System32, which a
    // standard user cannot write to.
    let target = std::env::temp_dir().join(format!("sievemc-setup-{version}.exe"));

    if let (Some(expected), Ok(meta)) = (expected_size, std::fs::metadata(&target))
        && meta.len() == expected
    {
        info!("Reusing already-downloaded installer at {}", target.display());
        return Ok(target.to_string_lossy().into_owned());
    }

    info!("Downloading {url} -> {}", target.display());
    let response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: server returned {}", response.status()));
    }

    let total = response.content_length().or(expected_size).unwrap_or(0);

    // Download to a sibling temp file and rename on success, so an interrupted
    // download can never be mistaken for a complete one on the next launch.
    let partial = target.with_extension("part");
    let mut file =
        std::fs::File::create(&partial).map_err(|e| format!("Could not create {}: {e}", partial.display()))?;

    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download interrupted: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Could not write the installer: {e}"))?;
        downloaded += chunk.len() as u64;

        // Throttle to ~1 event per 256 KiB; a per-chunk emit floods the webview.
        if downloaded - last_emit >= 256 * 1024 || downloaded == total {
            last_emit = downloaded;
            let _ = app.emit("update://download-progress", DownloadProgress { downloaded, total });
        }
    }

    file.flush().map_err(|e| format!("Could not flush the installer: {e}"))?;
    drop(file);

    // Windows won't rename over an existing file.
    let _ = std::fs::remove_file(&target);
    std::fs::rename(&partial, &target)
        .map_err(|e| format!("Could not finalize the download: {e}"))?;

    let _ = app.emit(
        "update://download-progress",
        DownloadProgress {
            downloaded,
            total: total.max(downloaded),
        },
    );
    info!("Installer ready at {}", target.display());
    Ok(target.to_string_lossy().into_owned())
}

/// Run the downloaded installer silently and exit so it can replace our binary.
///
/// The installer's `/S` path kills `sievemc.exe`, overwrites `$INSTDIR`, and
/// relaunches the app via `.onInstSuccess`, so this never returns on success.
#[tauri::command]
pub async fn install_update(app: AppHandle, installer_path: String) -> Result<(), String> {
    if !is_installed() {
        return Err("This is a portable build; open the release page instead.".into());
    }

    let path = PathBuf::from(&installer_path);
    if !path.is_file() {
        return Err(format!("Installer not found at {installer_path}"));
    }

    info!("Launching silent installer: {}", path.display());
    std::process::Command::new(&path)
        .arg("/S")
        .spawn()
        .map_err(|e| format!("Could not start the installer: {e}"))?;

    app.exit(0);
    Ok(())
}
