//! Diagnostico e reparo do estado de migracao do SQLite local.
//!
//! Contexto: a migracao v1 foi editada depois de ja aplicada em alguns
//! aparelhos. O sqlx guarda o SHA-384 do SQL de cada migracao aplicada e
//! aborta com VersionMismatch quando o SQL muda. Esses aparelhos param de
//! abrir o app.
//!
//! O reparo aqui e "stamping": corrige o checksum registrado quando o schema
//! comprova que a migracao ja foi de fato aplicada. Nao reescreve dados.

use std::path::PathBuf;

use serde::Serialize;
use sqlx::{migrate::MigrationType, Row, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::migrations::migrations;

const ERRO_GENERICO: &str = "Não foi possível diagnosticar o banco local.";

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DatabaseState {
    /// Banco ainda nao existe ou nunca migrou: instalacao nova, nada a fazer.
    SemHistorico,
    /// Todos os checksums batem.
    Ok,
    /// Ha divergencia, e o schema comprova que as migracoes ja foram aplicadas.
    Reparavel,
    /// Ha divergencia que o schema nao explica. Nao reparar automaticamente.
    Incerto,
}

#[derive(Debug, Serialize)]
pub struct Diagnosis {
    pub state: DatabaseState,
    /// Versoes cujo checksum registrado difere do codigo atual.
    pub divergentes: Vec<i64>,
    /// Versoes que o codigo tem mas o banco nunca registrou.
    pub ausentes: Vec<i64>,
    pub colunas_de_transacao_presentes: bool,
}

#[derive(Debug, Serialize)]
pub struct RepairOutcome {
    pub backup: String,
    pub corrigidas: Vec<i64>,
    pub carimbadas: Vec<i64>,
}

/// Checksums que o sqlx espera para as migracoes atuais. Usa o proprio
/// construtor do sqlx em vez de recalcular SHA-384 na mao, para nao divergir
/// caso a biblioteca mude o algoritmo.
fn checksums_esperados() -> Vec<(i64, Vec<u8>)> {
    migrations()
        .into_iter()
        .map(|m| {
            let sqlx_migration = sqlx::migrate::Migration::new(
                m.version as i64,
                m.description.into(),
                MigrationType::ReversibleUp,
                m.sql.into(),
                false,
            );
            (sqlx_migration.version, sqlx_migration.checksum.to_vec())
        })
        .collect()
}

async fn tabela_existe(pool: &SqlitePool, nome: &str) -> Result<bool, sqlx::Error> {
    let row = sqlx::query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $1")
        .bind(nome)
        .fetch_optional(pool)
        .await?;
    Ok(row.is_some())
}

async fn tem_coluna(pool: &SqlitePool, tabela: &str, coluna: &str) -> Result<bool, sqlx::Error> {
    if !tabela_existe(pool, tabela).await? {
        return Ok(false);
    }
    // PRAGMA nao aceita bind; o nome da tabela vem de constante do proprio codigo.
    let rows = sqlx::query(&format!("PRAGMA table_info({tabela})"))
        .fetch_all(pool)
        .await?;
    for row in rows {
        let nome: String = row.try_get("name")?;
        if nome == coluna {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn diagnosticar(pool: &SqlitePool) -> Result<Diagnosis, sqlx::Error> {
    if !tabela_existe(pool, "_sqlx_migrations").await? {
        return Ok(Diagnosis {
            state: DatabaseState::SemHistorico,
            divergentes: vec![],
            ausentes: vec![],
            colunas_de_transacao_presentes: false,
        });
    }

    let aplicadas: Vec<(i64, Vec<u8>)> =
        sqlx::query("SELECT version, checksum FROM _sqlx_migrations ORDER BY version")
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|row| {
                let v: i64 = row.get("version");
                let c: Vec<u8> = row.get("checksum");
                (v, c)
            })
            .collect();

    let mut divergentes = vec![];
    let mut ausentes = vec![];
    for (versao, esperado) in checksums_esperados() {
        match aplicadas.iter().find(|(v, _)| *v == versao) {
            Some((_, registrado)) if *registrado != esperado => divergentes.push(versao),
            Some(_) => {}
            None => ausentes.push(versao),
        }
    }

    // As colunas que a v1 editada criava por engano, e que a v3 cria oficialmente.
    let colunas = tem_coluna(pool, "expenses", "nature").await?
        && tem_coluna(pool, "expenses", "status").await?
        && tem_coluna(pool, "categories", "nature").await?;

    let state = if divergentes.is_empty() && ausentes.is_empty() {
        DatabaseState::Ok
    } else if colunas {
        // O schema comprova que o efeito das migracoes ja esta no banco:
        // carimbar o historico e seguro e preserva os dados.
        DatabaseState::Reparavel
    } else {
        DatabaseState::Incerto
    };

    Ok(Diagnosis {
        state,
        divergentes,
        ausentes,
        colunas_de_transacao_presentes: colunas,
    })
}

pub async fn reparar(pool: &SqlitePool, backup: String) -> Result<RepairOutcome, sqlx::Error> {
    let diagnostico = diagnosticar(pool).await?;
    let esperados = checksums_esperados();

    let mut corrigidas = vec![];
    for versao in &diagnostico.divergentes {
        if let Some((_, esperado)) = esperados.iter().find(|(v, _)| v == versao) {
            sqlx::query(
                "UPDATE _sqlx_migrations SET checksum = $1, success = true WHERE version = $2",
            )
            .bind(esperado.clone())
            .bind(versao)
            .execute(pool)
            .await?;
            corrigidas.push(*versao);
        }
    }

    let mut carimbadas = vec![];
    for versao in &diagnostico.ausentes {
        if let Some((_, esperado)) = esperados.iter().find(|(v, _)| v == versao) {
            let descricao = migrations()
                .into_iter()
                .find(|m| m.version as i64 == *versao)
                .map(|m| m.description.to_string())
                .unwrap_or_default();
            sqlx::query(
                "INSERT INTO _sqlx_migrations
                 (version, description, installed_on, success, checksum, execution_time)
                 VALUES ($1, $2, CURRENT_TIMESTAMP, true, $3, 0)",
            )
            .bind(versao)
            .bind(descricao)
            .bind(esperado.clone())
            .execute(pool)
            .await?;
            carimbadas.push(*versao);
        }
    }

    Ok(RepairOutcome {
        backup,
        corrigidas,
        carimbadas,
    })
}

fn caminho_do_banco(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("controle-de-gastos.db"))
        .map_err(|_| ERRO_GENERICO.to_string())
}

async fn abrir(app: &AppHandle) -> Result<SqlitePool, String> {
    let caminho = caminho_do_banco(app)?;
    let caminho = caminho.to_str().ok_or_else(|| ERRO_GENERICO.to_string())?;
    SqlitePool::connect(&format!("sqlite:{caminho}"))
        .await
        .map_err(|_| ERRO_GENERICO.to_string())
}

#[tauri::command]
pub async fn diagnose_database(app: AppHandle) -> Result<Diagnosis, String> {
    let pool = abrir(&app).await?;
    diagnosticar(&pool)
        .await
        .map_err(|_| ERRO_GENERICO.to_string())
}

#[tauri::command]
pub async fn repair_database(app: AppHandle) -> Result<RepairOutcome, String> {
    let origem = caminho_do_banco(&app)?;

    // Backup antes de tocar em qualquer coisa. Se a copia falhar, aborta.
    let destino = origem.with_extension("db.bak");
    std::fs::copy(&origem, &destino)
        .map_err(|_| "Não foi possível criar o backup antes do reparo.".to_string())?;

    let pool = abrir(&app).await?;
    let diagnostico = diagnosticar(&pool)
        .await
        .map_err(|_| ERRO_GENERICO.to_string())?;

    if diagnostico.state != DatabaseState::Reparavel {
        return Err(
            "O banco não está no estado que este reparo trata. Não foi alterado.".to_string(),
        );
    }

    reparar(&pool, destino.to_string_lossy().to_string())
        .await
        .map_err(|_| "Falha ao gravar o reparo. O backup foi preservado.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{sqlite::SqlitePoolOptions, Executor};

    /// Schema base equivalente ao efeito das migracoes v1 + v3.
    const SCHEMA_COM_COLUNAS: &str = r#"
        CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL, nature TEXT NOT NULL DEFAULT 'saida');
        CREATE TABLE expenses (
            id TEXT PRIMARY KEY NOT NULL,
            nature TEXT NOT NULL DEFAULT 'saida',
            status TEXT NOT NULL DEFAULT 'realizado'
        );
        CREATE TABLE _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );
    "#;

    async fn pool_vazio() -> SqlitePool {
        SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("pool em memoria")
    }

    async fn registrar(pool: &SqlitePool, versao: i64, checksum: Vec<u8>) {
        sqlx::query(
            "INSERT INTO _sqlx_migrations
             (version, description, installed_on, success, checksum, execution_time)
             VALUES ($1, 'x', CURRENT_TIMESTAMP, true, $2, 0)",
        )
        .bind(versao)
        .bind(checksum)
        .execute(pool)
        .await
        .expect("registrar migracao");
    }

    #[tokio::test]
    async fn banco_novo_nao_tem_historico() {
        let pool = pool_vazio().await;
        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.state, DatabaseState::SemHistorico);
    }

    #[tokio::test]
    async fn banco_integro_e_reportado_como_ok() {
        let pool = pool_vazio().await;
        pool.execute(SCHEMA_COM_COLUNAS).await.expect("schema");
        for (versao, checksum) in checksums_esperados() {
            registrar(&pool, versao, checksum).await;
        }

        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.state, DatabaseState::Ok);
        assert!(d.divergentes.is_empty());
        assert!(d.ausentes.is_empty());
    }

    /// Populacao B: instalou um build com a v1 editada. O checksum da v1 nao
    /// bate, a v3 nunca foi registrada, mas as colunas ja existem.
    #[tokio::test]
    async fn populacao_quebrada_e_reparavel_e_o_reparo_normaliza() {
        let pool = pool_vazio().await;
        pool.execute(SCHEMA_COM_COLUNAS).await.expect("schema");

        let esperados = checksums_esperados();
        registrar(&pool, 1, vec![0xAA; 48]).await; // checksum da v1 editada
        for (versao, checksum) in esperados.iter().filter(|(v, _)| *v == 2 || *v == 4) {
            registrar(&pool, *versao, checksum.clone()).await;
        }

        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.state, DatabaseState::Reparavel);
        assert_eq!(d.divergentes, vec![1]);
        assert_eq!(d.ausentes, vec![3]);
        assert!(d.colunas_de_transacao_presentes);

        let r = reparar(&pool, "backup.db".to_string())
            .await
            .expect("reparo");
        assert_eq!(r.corrigidas, vec![1]);
        assert_eq!(r.carimbadas, vec![3]);

        // Depois do reparo o banco fica indistinguivel de um migrado normalmente.
        let depois = diagnosticar(&pool).await.expect("diagnostico pos-reparo");
        assert_eq!(depois.state, DatabaseState::Ok);
    }

    /// Divergencia sem as colunas no schema: nao ha evidencia de que a
    /// migracao rodou, entao carimbar seria mentir sobre o estado do banco.
    #[tokio::test]
    async fn divergencia_sem_evidencia_no_schema_e_incerta() {
        let pool = pool_vazio().await;
        pool.execute(
            r#"
            CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL);
            CREATE TABLE expenses (id TEXT PRIMARY KEY NOT NULL);
            CREATE TABLE _sqlx_migrations (
                version BIGINT PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            );
        "#,
        )
        .await
        .expect("schema");
        registrar(&pool, 1, vec![0xAA; 48]).await;

        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.state, DatabaseState::Incerto);
        assert!(!d.colunas_de_transacao_presentes);
    }

    #[tokio::test]
    async fn checksum_esperado_acompanha_o_sql_da_migracao() {
        let esperados = checksums_esperados();
        assert_eq!(esperados.len(), 4);
        // SHA-384 tem 48 bytes; se o sqlx trocar de algoritmo, isto quebra e
        // avisa antes de o reparo carimbar checksum errado.
        for (_, checksum) in &esperados {
            assert_eq!(checksum.len(), 48);
        }
    }
}
