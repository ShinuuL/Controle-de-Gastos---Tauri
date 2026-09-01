//! Ponte para o instalador do sistema (fase 21).
//!
//! O arquivo ja chega aqui verificado: `update.rs` confere a assinatura Ed25519
//! do manifesto e o sha256 do binario antes de qualquer coisa virar caminho em
//! disco. Este modulo so entrega esse caminho a quem sabe instalar.
//!
//! **Nao existe instalacao silenciosa.** No Android quem confirma e o
//! PackageInstaller, numa tela do sistema, e antes disso o usuario precisa ter
//! liberado "instalar apps desconhecidos" para o Contr0l. No Windows o
//! instalador NSIS abre e o usuario conduz. Nos dois casos o app leva ate a
//! porta e nao passa por ela.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErroInstalador {
    pub codigo: String,
    pub mensagem: String,
}

impl ErroInstalador {
    fn novo(codigo: &str, mensagem: &str) -> Self {
        Self { codigo: codigo.into(), mensagem: mensagem.into() }
    }
}

/// Estado da permissao de instalar do aparelho.
#[derive(Debug, Serialize)]
pub struct PermissaoInstalacao {
    /// O sistema deixa este app abrir um instalador?
    pub permitido: bool,
    /// Existe uma tela de sistema para conceder isso? Falso no desktop, onde a
    /// pergunta nao faz sentido -- a UI usa isto para nao oferecer um botao que
    /// nao levaria a lugar nenhum.
    pub pedivel: bool,
}

#[cfg(target_os = "android")]
mod android {
    use serde::{Deserialize, Serialize};
    use tauri::plugin::PluginHandle;

    /// Nome do pacote onde a classe Kotlin vive, e o nome da classe. Precisam
    /// bater com `gen/android/.../InstaladorPlugin.kt`; errar aqui so aparece em
    /// tempo de execucao, no aparelho.
    pub const PACOTE: &str = "com.controle_gastos.app";
    pub const CLASSE: &str = "InstaladorPlugin";

    pub struct Instalador<R: tauri::Runtime>(pub PluginHandle<R>);

    #[derive(Serialize)]
    pub struct SemArgumento {}

    #[derive(Serialize)]
    pub struct CaminhoArg<'a> {
        pub caminho: &'a str,
    }

    #[derive(Deserialize)]
    pub struct RespostaPermissao {
        pub permitido: bool,
    }
}

#[cfg(target_os = "android")]
use android::{CaminhoArg, Instalador, RespostaPermissao, SemArgumento};

/// Registra o plugin Android. No desktop nao ha o que registrar, e o `Builder`
/// vazio mantem o `lib.rs` com um caminho unico em vez de dois `cfg`.
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("instalador")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin(android::PACOTE, android::CLASSE)?;
                _app.manage(Instalador(handle));
            }
            Ok(())
        })
        .build()
}

/// O aparelho ja permite que o app abra um instalador?
#[tauri::command]
pub fn instalador_permissao(_app: tauri::AppHandle) -> PermissaoInstalacao {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        if let Some(instalador) = _app.try_state::<Instalador<tauri::Wry>>() {
            if let Ok(r) = instalador
                .0
                .run_mobile_plugin::<RespostaPermissao>("podeInstalar", SemArgumento {})
            {
                return PermissaoInstalacao { permitido: r.permitido, pedivel: true };
            }
        }
        return PermissaoInstalacao { permitido: false, pedivel: true };
    }
    // Desktop: o instalador abre como qualquer programa, e nao ha permissao a
    // pedir.
    #[cfg(not(target_os = "android"))]
    PermissaoInstalacao { permitido: true, pedivel: false }
}

/// Abre a tela do sistema onde a permissao de instalar e concedida.
#[tauri::command]
pub fn instalador_pedir_permissao(_app: tauri::AppHandle) -> Result<(), ErroInstalador> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let instalador = _app
            .try_state::<Instalador<tauri::Wry>>()
            .ok_or_else(|| ErroInstalador::novo("sem_instalador", "O instalador nao esta disponivel neste aparelho."))?;
        instalador
            .0
            .run_mobile_plugin::<()>("pedirPermissao", SemArgumento {})
            .map_err(|_| ErroInstalador::novo("permissao_indisponivel", "Nao foi possivel abrir a tela de permissao do sistema."))?;
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    Err(ErroInstalador::novo("nao_se_aplica", "Este aparelho nao pede essa permissao."))
}

/// Entrega o arquivo baixado ao instalador do sistema.
///
/// O caminho tem de ser o que `atualizacao_baixar` devolveu: e ele que ja passou
/// pelo sha256 do manifesto assinado. Aceitar um caminho qualquer vindo da tela
/// transformaria este comando no contorno de toda a verificacao.
#[tauri::command]
pub fn instalador_abrir(_app: tauri::AppHandle, _caminho: String) -> Result<(), ErroInstalador> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let instalador = _app
            .try_state::<Instalador<tauri::Wry>>()
            .ok_or_else(|| ErroInstalador::novo("sem_instalador", "O instalador nao esta disponivel neste aparelho."))?;
        instalador
            .0
            .run_mobile_plugin::<()>("instalar", CaminhoArg { caminho: &_caminho })
            .map_err(|_| ErroInstalador::novo("instalador_recusou", "O sistema recusou abrir o instalador."))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        // O NSIS pede elevacao sozinho; abrir pelo shell e o mesmo que o usuario
        // dar dois cliques no arquivo baixado.
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &_caminho])
            .spawn()
            .map_err(|_| ErroInstalador::novo("instalador_recusou", "Nao foi possivel abrir o instalador baixado."))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "android", target_os = "windows")))]
    Err(ErroInstalador::novo("nao_suportado", "Atualizacao pelo app nao existe nesta plataforma."))
}
