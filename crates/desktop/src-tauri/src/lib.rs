use tracing::info;

mod app_info_commands;
mod sieve_commands;
mod updater;
mod util;
use app_info_commands::get_versions;
use sieve_commands::{export, open_path, scan};
use updater::{check_for_update, download_update, install_update};
use util::logging::log;

pub static DEBUG: bool = cfg!(debug_assertions);

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
            open_path,
            check_for_update,
            download_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
