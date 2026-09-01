mod cloud;
mod session_store;
// O envelope do backup (seal/open) ja esta pronto e testado, mas so passa a ser
// chamado no passo do backup; ate la o dead_code seria ruido, nao aviso.
#[allow(dead_code)]
mod crypto;
mod imports;
mod migrations;
mod recovery;
mod instalador;
mod update;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:controle-de-gastos.db", migrations::migrations())
                .build(),
        )
        .plugin(instalador::init())
        .manage(cloud::CloudState::default())
        // Antes da webview e antes de qualquer conexao SQLite: e a unica janela
        // em que trocar o arquivo do banco e seguro.
        .setup(|app| {
            cloud::aplicar_restauracao_pendente(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cloud::cloud_signup,
            cloud::cloud_login,
            cloud::cloud_logout,
            cloud::cloud_sessao,
            cloud::cloud_entitlement,
            cloud::cloud_backup_push,
            cloud::cloud_backup_pull,
            cloud::cloud_backup_auto,
            cloud::cloud_apagar_conta,
            imports::confirm_statement_import,
            recovery::diagnose_database,
            update::atualizacao_verificar,
            update::atualizacao_dispensar,
            update::atualizacao_baixar,
            instalador::instalador_permissao,
            instalador::instalador_pedir_permissao,
            instalador::instalador_abrir,
            recovery::repair_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
