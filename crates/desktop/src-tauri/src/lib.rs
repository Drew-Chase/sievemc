use tracing::{debug, error, info, trace, warn};

mod util;

pub static DEBUG: bool = cfg!(debug_assertions);

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Bridge for webview-side logging.
///
/// The frontend logger (see `src/util/logger.ts`) invokes this command so that
/// `console.*` / `log.*` calls in React are re-emitted as `tracing` events
/// under the `frontend` target and land in the same rolling log files as the
/// Rust-side logs.
#[tauri::command]
fn log(level: String, message: String, location: Option<String>) {
    match level.as_str() {
        "trace" => trace!(target: "frontend", location = ?location, "{message}"),
        "debug" => debug!(target: "frontend", location = ?location, "{message}"),
        "info" => info!(target: "frontend", location = ?location, "{message}"),
        "warn" => warn!(target: "frontend", location = ?location, "{message}"),
        "error" => error!(target: "frontend", location = ?location, "{message}"),
        _ => info!(target: "frontend", location = ?location, "{message}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = util::logging::setup_logging() {
        eprintln!("failed to initialise logging: {e}");
    }
    if let Err(e) = color_eyre::install() {
        eprintln!("failed to install color-eyre: {e}");
    }

    info!(
        "Starting {} build of the application...",
        if DEBUG { "development" } else { "production" }
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet, log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
