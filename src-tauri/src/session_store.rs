//! Sessao guardada entre aberturas do app.
//!
//! # Por que o token e a DEK ficam aqui, e nao num keystore do SO
//!
//! Decidido em 2026-08-30, com o trade-off aceito de forma explicita.
//!
//! O Tauri nao tem plugin oficial de keystore que cubra Android: o
//! `stronghold` exige uma senha propria (o mesmo problema de novo, uma camada
//! acima) e o `keyring` so cobre desktop. O que sobra e a pasta privada do app.
//!
//! E ela e **a mesma pasta onde o `controle-de-gastos.db` ja vive em texto
//! puro**. Guardar a DEK ao lado dele nao piora a protecao desses dados de
//! forma relevante: quem consegue ler este arquivo ja consegue ler todos os
//! lancamentos direto do banco, sem precisar de chave nenhuma.
//!
//! O que continua valendo -- e e o ponto do desenho inteiro -- e que **o
//! servidor segue sem conseguir ler qualquer coisa**. A criptografia ponta a
//! ponta protege contra o servidor e contra quem vazar o servidor, nao contra
//! quem tem o aparelho na mao.
//!
//! O que isto NAO e: `localStorage`. Aquilo seria pior por dois motivos -- fica
//! acessivel a qualquer script na webview, e nao passa pelo Rust, onde o
//! AGENTS.md manda a nuvem morar.
//!
//! Endurecer isto depois (Keystore no Android, DPAPI no Windows) troca so este
//! arquivo: o resto do codigo fala com `carregar`, `salvar` e `limpar`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const ARQUIVO: &str = "sessao-nuvem.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessaoPersistida {
    pub token: String,
    pub account_id: String,
    pub email: String,
    pub expires_at: String,
    /// DEK em base64 URL-safe sem padding. Ver a nota do modulo.
    pub dek: String,
}

fn caminho(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join(ARQUIVO))
}

/// Grava a sessao. Falha em silencio de proposito: nao conseguir persistir e
/// um problema de conveniencia (vai pedir login de novo), nunca motivo para
/// derrubar um login que acabou de dar certo.
pub fn salvar(app: &AppHandle, sessao: &SessaoPersistida) {
    let Some(caminho) = caminho(app) else { return };
    if let Some(pai) = caminho.parent() {
        let _ = std::fs::create_dir_all(pai);
    }
    let Ok(json) = serde_json::to_string(sessao) else { return };
    if std::fs::write(&caminho, json).is_ok() {
        restringir_permissoes(&caminho);
    }
}

/// Le a sessao guardada. Arquivo ausente, ilegivel ou corrompido devolvem
/// `None` -- o app volta a pedir login, que e o pior caso aceitavel.
pub fn carregar(app: &AppHandle) -> Option<SessaoPersistida> {
    let caminho = caminho(app)?;
    let conteudo = std::fs::read_to_string(caminho).ok()?;
    let sessao: SessaoPersistida = serde_json::from_str(&conteudo).ok()?;

    // Sessao vencida nao volta: o servidor recusaria o token de qualquer forma,
    // e devolver uma sessao morta faria a UI mostrar "conectado" para quem nao
    // esta.
    if venceu(&sessao.expires_at) {
        return None;
    }
    Some(sessao)
}

pub fn limpar(app: &AppHandle) {
    if let Some(caminho) = caminho(app) {
        let _ = std::fs::remove_file(caminho);
    }
}

/// `true` quando a data ja passou. Data ilegivel conta como vencida: melhor
/// pedir login do que confiar num carimbo que ninguem consegue ler.
pub fn venceu(expires_at: &str) -> bool {
    let Some(fim) = epoch_de_iso(expires_at) else {
        return true;
    };
    let agora = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    fim <= agora
}

/// Converte `YYYY-MM-DDTHH:MM:SS...Z` em segundos desde a epoca.
///
/// Escrito na mao para nao puxar a `chrono` inteira por causa de um campo. So
/// aceita UTC com `Z`, que e o unico formato que o gateway emite (`toISOString`).
fn epoch_de_iso(iso: &str) -> Option<i64> {
    let bytes = iso.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }
    let n = |ini: usize, fim: usize| iso.get(ini..fim)?.parse::<i64>().ok();

    let (ano, mes, dia) = (n(0, 4)?, n(5, 7)?, n(8, 10)?);
    let (hora, min, seg) = (n(11, 13)?, n(14, 16)?, n(17, 19)?);
    if !(1..=12).contains(&mes) || !(1..=31).contains(&dia) {
        return None;
    }

    // Dias desde a epoca pelo algoritmo de Howard Hinnant (days_from_civil):
    // sem tabela de meses e sem caso especial de ano bissexto.
    let a = if mes <= 2 { ano - 1 } else { ano };
    let era = if a >= 0 { a } else { a - 399 } / 400;
    let ano_da_era = a - era * 400;
    let dia_do_ano = (153 * (mes + if mes > 2 { -3 } else { 9 }) + 2) / 5 + dia - 1;
    let dia_da_era = ano_da_era * 365 + ano_da_era / 4 - ano_da_era / 100 + dia_do_ano;
    let dias = era * 146097 + dia_da_era - 719468;

    Some(dias * 86400 + hora * 3600 + min * 60 + seg)
}

#[cfg(unix)]
fn restringir_permissoes(caminho: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(caminho, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restringir_permissoes(_caminho: &std::path::Path) {
    // No Windows o arquivo herda a ACL da pasta do app, que ja e do usuario.
    // Nao ha equivalente simples de chmod, e o `.db` ao lado esta na mesma
    // situacao -- endurecer um sem o outro seria teatro.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converte_iso_do_gateway() {
        // O formato que `new Date().toISOString()` produz.
        assert_eq!(epoch_de_iso("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(epoch_de_iso("2026-08-30T00:00:00.000Z"), Some(1788048000));
        // Sem milissegundos tambem precisa passar.
        assert_eq!(epoch_de_iso("2026-08-30T00:00:00Z"), Some(1788048000));
    }

    #[test]
    fn conta_bissexto_sem_tabela() {
        // 29/02/2024 existe; se o algoritmo estivesse errado, cairia em 01/03.
        let fev29 = epoch_de_iso("2024-02-29T00:00:00.000Z").unwrap();
        let mar01 = epoch_de_iso("2024-03-01T00:00:00.000Z").unwrap();
        assert_eq!(mar01 - fev29, 86400);
    }

    #[test]
    fn horas_minutos_e_segundos_entram_na_conta() {
        let meia_noite = epoch_de_iso("2026-08-30T00:00:00Z").unwrap();
        let depois = epoch_de_iso("2026-08-30T13:45:30Z").unwrap();
        assert_eq!(depois - meia_noite, 13 * 3600 + 45 * 60 + 30);
    }

    #[test]
    fn iso_invalido_nao_e_lido() {
        for ruim in ["", "ontem", "2026/08/30", "26-08-30T00:00:00Z", "2026-13-01T00:00:00Z"] {
            assert_eq!(epoch_de_iso(ruim), None, "{ruim} deveria ser rejeitado");
        }
    }

    #[test]
    fn data_ilegivel_conta_como_vencida() {
        // Melhor pedir login do que confiar num carimbo que ninguem le.
        assert!(venceu("qualquer coisa"));
        assert!(venceu(""));
    }

    #[test]
    fn passado_venceu_e_futuro_nao() {
        assert!(venceu("2020-01-01T00:00:00.000Z"));
        assert!(!venceu("2099-01-01T00:00:00.000Z"));
    }

    #[test]
    fn a_sessao_persistida_faz_round_trip() {
        let sessao = SessaoPersistida {
            token: "tok".into(),
            account_id: "conta".into(),
            email: "pessoa@exemplo.com.br".into(),
            expires_at: "2099-01-01T00:00:00.000Z".into(),
            dek: "ZGVr".into(),
        };
        let json = serde_json::to_string(&sessao).unwrap();
        let de_volta: SessaoPersistida = serde_json::from_str(&json).unwrap();

        assert_eq!(de_volta.token, sessao.token);
        assert_eq!(de_volta.dek, sessao.dek);
    }

    #[test]
    fn json_de_versao_antiga_nao_derruba_o_app() {
        // Um arquivo de um build anterior, sem o campo `dek`, precisa virar
        // None -- e nao panico no boot.
        let antigo = r#"{"token":"t","account_id":"c","email":"e","expires_at":"2099-01-01T00:00:00Z"}"#;
        assert!(serde_json::from_str::<SessaoPersistida>(antigo).is_err());
    }
}
