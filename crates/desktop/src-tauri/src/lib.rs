use tracing::{debug, error, info, trace, warn};

mod app_info_commands;
mod sieve_commands;
mod util;
use app_info_commands::get_versions;
use sieve_commands::{export, open_path, scan};

pub static DEBUG: bool = cfg!(debug_assertions);

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

/// SQLite schema for the persisted per-mod side overrides.
///
/// Keyed by the mod's stable manifest id so a user's choice ("this is a
/// client-only mod") is remembered across scans, versions, and app restarts,
/// independent of the (version-varying) jar filename.
fn override_migrations() -> Vec<tauri_plugin_sql::Migration> {
    use tauri_plugin_sql::{Migration, MigrationKind};
    vec![Migration {
        version: 1,
        description: "create overrides table",
        sql: "CREATE TABLE IF NOT EXISTS overrides (\
                mod_id TEXT PRIMARY KEY, \
                side TEXT NOT NULL, \
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))\
              );",
        kind: MigrationKind::Up,
    }]
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sieve.db", override_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_versions,
            log,
            scan,
            export,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
