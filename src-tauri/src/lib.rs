mod imports;
mod migrations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:controle-de-gastos.db", migrations::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![imports::confirm_statement_import])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
