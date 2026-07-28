use tauri::command;

#[command]
pub const fn get_versions() -> &'static str {
    concat!(
        r#"{"version": ""#,
        env!("CARGO_PKG_VERSION"),
        r#"", "build": ""#,
        env!("BUILD"),
        r#""}"#
    )
}
