//! Diagnostico e reparo do estado de migracao do SQLite local.
//!
//! Contexto: a migracao v1 foi editada depois de ja aplicada em alguns
//! aparelhos. O sqlx guarda o SHA-384 do SQL de cada migracao aplicada e
//! aborta com VersionMismatch quando o SQL muda. Esses aparelhos param de
//! abrir o app.
//!
//! O reparo aqui e "stamping": corrige o checksum registrado quando o schema
//! comprova que a migracao ja foi de fato aplicada. Nao reescreve dados.
//!
//! Ha um segundo dano, causado pelo proprio reparo de uma versao anterior: ele
//! carimbava TODA migracao ausente com base numa unica evidencia (as colunas da
//! v3). Num aparelho onde a v4 ainda estava pendente, ela foi registrada como
//! aplicada sem o `ALTER TABLE` nunca ter rodado -- e o sqlx, vendo o carimbo,
//! nunca mais a aplica. O app abre normalmente e so quebra meses depois, ao
//! importar um extrato: "no such column: e.import_fingerprint".
//!
//! Para esse caso o reparo reaplica o SQL da migracao. E seguro justamente
//! porque so acontece quando o schema PROVA que o efeito esta ausente.

use std::path::PathBuf;

use serde::Serialize;
use sqlx::{migrate::MigrationType, Executor, Row, SqlitePool};
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
    /// Versoes registradas como aplicadas cujo efeito nao esta no schema.
    /// Carimbo mentiroso: o sqlx nunca mais vai aplica-las sozinho.
    pub sem_efeito: Vec<i64>,
    pub colunas_de_transacao_presentes: bool,
}

#[derive(Debug, Serialize)]
pub struct RepairOutcome {
    pub backup: String,
    pub corrigidas: Vec<i64>,
    pub carimbadas: Vec<i64>,
    /// Versoes cujo SQL foi rodado de novo por estarem carimbadas sem efeito.
    pub reaplicadas: Vec<i64>,
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

/// O efeito desta migracao ja esta no schema?
///
/// **Toda migracao nova precisa entrar aqui.** `None` quer dizer "esta versao
/// nao sabe se reconhecer no schema": vale para a v1 e a v2, que criam o schema
/// base, e para uma versao nova que esqueceram de declarar. Quem chama trata
/// `None` como ausencia de evidencia -- nao carimba e nao reaplica. Carimbar
/// sem evidencia registraria como aplicada uma migracao que nunca rodou, e a
/// coluna dela nunca mais seria criada; reaplicar sem evidencia rodaria de novo
/// um SQL que talvez ja tenha rodado.
async fn efeito_presente(pool: &SqlitePool, versao: i64) -> Result<Option<bool>, sqlx::Error> {
    Ok(match versao {
        3 => Some(
            tem_coluna(pool, "expenses", "nature").await?
                && tem_coluna(pool, "expenses", "status").await?
                && tem_coluna(pool, "categories", "nature").await?,
        ),
        4 => Some(tem_coluna(pool, "expenses", "import_fingerprint").await?),
        5 => Some(
            tabela_existe(pool, "cloud_entitlement").await?
                && tabela_existe(pool, "cloud_backup_state").await?,
        ),
        6 => Some(tabela_existe(pool, "app_meta").await?),
        _ => None,
    })
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
            sem_efeito: vec![],
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
    let mut sem_efeito = vec![];
    for (versao, esperado) in checksums_esperados() {
        let registro = aplicadas.iter().find(|(v, _)| *v == versao);
        let evidencia = efeito_presente(pool, versao).await?;
        match registro {
            Some((_, registrado)) if *registrado != esperado => divergentes.push(versao),
            // Registrada e com o efeito provadamente fora do schema: o carimbo
            // esta mentindo. Sem isto o app abre e so quebra na consulta que
            // usa a coluna que nunca foi criada.
            Some(_) if evidencia == Some(false) => sem_efeito.push(versao),
            Some(_) => {}
            // Faltar no historico so e problema se o efeito JA estiver no banco
            // -- ai o migrator tentaria aplicar de novo e falharia. Se o efeito
            // nao esta la, isto e simplesmente uma migracao pendente, e o
            // proprio sqlx aplica na proxima abertura. Nao e caso de reparo.
            None if evidencia == Some(true) => ausentes.push(versao),
            None => {}
        }
    }

    // As colunas que a v1 editada criava por engano, e que a v3 cria oficialmente.
    let colunas = tem_coluna(pool, "expenses", "nature").await?
        && tem_coluna(pool, "expenses", "status").await?
        && tem_coluna(pool, "categories", "nature").await?;

    // Carimbar exige a evidencia das colunas da v3; reaplicar nao, porque so
    // entra em `sem_efeito` o que o schema ja provou estar faltando.
    let carimbo_sem_evidencia = (!divergentes.is_empty() || !ausentes.is_empty()) && !colunas;

    let state = if divergentes.is_empty() && ausentes.is_empty() && sem_efeito.is_empty() {
        DatabaseState::Ok
    } else if carimbo_sem_evidencia {
        DatabaseState::Incerto
    } else {
        // O schema comprova o que aconteceu: carimbar o historico (ou reaplicar
        // a migracao ausente) e seguro e preserva os dados.
        DatabaseState::Reparavel
    };

    Ok(Diagnosis {
        state,
        divergentes,
        ausentes,
        sem_efeito,
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

    let reaplicadas = reaplicar(pool, &diagnostico.sem_efeito).await?;

    Ok(RepairOutcome {
        backup,
        corrigidas,
        carimbadas,
        reaplicadas,
    })
}

/// Roda de novo o SQL das migracoes carimbadas sem efeito.
///
/// Nao mexe no `_sqlx_migrations`: o carimbo ja esta la e o checksum confere --
/// o que faltava era o schema. Depois de rodar, confere a evidencia de novo;
/// se ainda faltar, aborta em vez de reportar sucesso, porque um reparo que
/// mente e pior do que o erro original.
async fn reaplicar(pool: &SqlitePool, versoes: &[i64]) -> Result<Vec<i64>, sqlx::Error> {
    let mut reaplicadas = vec![];
    for versao in versoes {
        let Some(migracao) = migrations()
            .into_iter()
            .find(|m| m.version as i64 == *versao)
        else {
            continue;
        };
        // O erro e ignorado de proposito: quem decide se deu certo e a
        // evidencia no schema, nao o retorno do banco.
        let _ = pool.execute(migracao.sql).await;

        // Migracao aplicada pela metade (uma das tres colunas da v3 ja existe):
        // o lote inteiro morre no primeiro `duplicate column name` e os
        // comandos seguintes nunca rodam. Aqui vao um a um, tolerando os que
        // ja estavam feitos. O `BEGIN` protege o caso em que o SQL tem trigger:
        // ali o `;` nao separa comandos, e partir seria quebrar.
        if efeito_presente(pool, *versao).await? != Some(true)
            && !migracao.sql.to_uppercase().contains("BEGIN")
        {
            for comando in migracao.sql.split(';') {
                if !comando.trim().is_empty() {
                    let _ = pool.execute(comando).await;
                }
            }
        }

        if efeito_presente(pool, *versao).await? != Some(true) {
            return Err(sqlx::Error::Protocol(format!(
                "migracao v{versao} reaplicada mas o efeito continua ausente"
            )));
        }
        reaplicadas.push(*versao);
    }
    Ok(reaplicadas)
}

pub(crate) fn caminho_do_banco(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("controle-de-gastos.db"))
        .map_err(|_| ERRO_GENERICO.to_string())
}

/// Abre o mesmo banco que o plugin-sql usa. `pub(crate)` porque o cache de
/// entitlement (cloud.rs) grava na tabela `cloud_entitlement` e nao pode abrir
/// um segundo caminho para o arquivo.
pub(crate) async fn abrir(app: &AppHandle) -> Result<SqlitePool, String> {
    let caminho = caminho_do_banco(app)?;
    let caminho = caminho.to_str().ok_or_else(|| ERRO_GENERICO.to_string())?;
    SqlitePool::connect(&format!("sqlite:{caminho}"))
        .await
        .map_err(|_| ERRO_GENERICO.to_string())
}

/// Cura o carimbo mentiroso antes de a webview abrir.
///
/// Este dano nao impede o app de abrir -- e por isso a tela de reparo nunca
/// aparece para quem sofre dele. O usuario so descobre meses depois, no meio de
/// uma importacao, com uma mensagem crua do SQLite. Nao ha decisao a tomar: o
/// schema prova o que falta e reaplicar so acrescenta coluna e indice, sem
/// tocar em dado. Entao curamos sozinhos, com backup antes.
///
/// Falha em silencio de proposito. Se o reparo nao der certo, o app continua
/// abrindo como antes -- e melhor um erro na importacao do que um app que nao
/// abre por causa da tentativa de conserto.
pub(crate) fn curar_carimbo_sem_efeito(app: &AppHandle) {
    let Ok(origem) = caminho_do_banco(app) else {
        return;
    };
    if !origem.exists() {
        return;
    }

    let app = app.clone();
    tauri::async_runtime::block_on(async move {
        let Ok(pool) = abrir(&app).await else {
            return;
        };
        let Ok(diagnostico) = diagnosticar(&pool).await else {
            return;
        };
        if diagnostico.sem_efeito.is_empty() {
            return;
        }
        if std::fs::copy(&origem, origem.with_extension("db.bak")).is_err() {
            return;
        }
        let _ = reaplicar(&pool, &diagnostico.sem_efeito).await;
        pool.close().await;
    });
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
    use sqlx::sqlite::SqlitePoolOptions;

    /// Schema base equivalente ao efeito das migracoes v1 + v3 + v4 -- as que
    /// estes cenarios registram como aplicadas no `_sqlx_migrations`.
    const SCHEMA_COM_COLUNAS: &str = r#"
        CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL, nature TEXT NOT NULL DEFAULT 'saida');
        CREATE TABLE expenses (
            id TEXT PRIMARY KEY NOT NULL,
            nature TEXT NOT NULL DEFAULT 'saida',
            status TEXT NOT NULL DEFAULT 'realizado',
            import_fingerprint TEXT
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

    /// O aparelho danificado: as colunas da v3 estao la, a da v4 nao -- ainda
    /// que o historico jure que a v4 rodou.
    const SCHEMA_SEM_A_COLUNA_DA_V4: &str = r#"
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
        for m in migrations() {
            pool.execute(m.sql).await.expect("aplicar migracao");
        }
        pool.execute(
            r#"CREATE TABLE _sqlx_migrations (
                version BIGINT PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            );"#,
        )
        .await
        .expect("historico");
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
        assert_eq!(esperados.len(), 6);
        // SHA-384 tem 48 bytes; se o sqlx trocar de algoritmo, isto quebra e
        // avisa antes de o reparo carimbar checksum errado.
        for (_, checksum) in &esperados {
            assert_eq!(checksum.len(), 48);
        }
    }

    /// Regressao: o reparo carimbava TODA migracao ausente com base numa unica
    /// evidencia (as colunas da v3). Bastou existir uma v5 para o cenario ficar
    /// perigoso -- ela seria registrada como aplicada sem a tabela existir, e
    /// `cloud_entitlement` nunca mais seria criada neste aparelho.
    #[tokio::test]
    async fn reparo_nao_carimba_migracao_cujo_efeito_nao_esta_no_banco() {
        let pool = pool_vazio().await;
        pool.execute(SCHEMA_COM_COLUNAS).await.expect("schema");

        let esperados = checksums_esperados();
        registrar(&pool, 1, vec![0xAA; 48]).await;
        for (versao, checksum) in esperados.iter().filter(|(v, _)| *v == 2 || *v == 4) {
            registrar(&pool, *versao, checksum.clone()).await;
        }

        let d = diagnosticar(&pool).await.expect("diagnostico");
        // A v3 entra porque as colunas provam que ela rodou; a v5 nao, porque a
        // tabela dela nao existe -- e ela e apenas pendente, nao quebrada.
        assert_eq!(d.ausentes, vec![3]);

        let r = reparar(&pool, "backup.db".to_string()).await.expect("reparo");
        assert_eq!(r.carimbadas, vec![3]);

        let v5: Option<(i64,)> =
            sqlx::query_as("SELECT version FROM _sqlx_migrations WHERE version = 5")
                .fetch_optional(&pool)
                .await
                .expect("consulta");
        assert!(v5.is_none(), "a v5 nao pode ser carimbada sem a tabela existir");
    }

    /// O dano que o reparo da fase 12 deixou em campo: a v4 foi carimbada como
    /// aplicada sem o ALTER ter rodado. O sqlx nunca mais a aplica, o app abre
    /// normal e so quebra na importacao, em "no such column: import_fingerprint".
    #[tokio::test]
    async fn carimbo_sem_efeito_e_reparado_reaplicando_a_migracao() {
        let pool = pool_vazio().await;
        pool.execute(SCHEMA_SEM_A_COLUNA_DA_V4)
            .await
            .expect("schema sem a coluna da v4");
        for (versao, checksum) in checksums_esperados() {
            registrar(&pool, versao, checksum).await;
        }

        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.state, DatabaseState::Reparavel);
        assert!(d.divergentes.is_empty());
        assert!(d.ausentes.is_empty());
        // v4 (coluna), v5 (tabelas da nuvem) e v6 (app_meta) estao carimbadas
        // sem efeito.
        assert_eq!(d.sem_efeito, vec![4, 5, 6]);

        let r = reparar(&pool, "backup.db".to_string())
            .await
            .expect("reparo");
        assert_eq!(r.reaplicadas, vec![4, 5, 6]);
        assert!(tem_coluna(&pool, "expenses", "import_fingerprint")
            .await
            .expect("coluna"));

        let depois = diagnosticar(&pool).await.expect("diagnostico pos-reparo");
        assert_eq!(depois.state, DatabaseState::Ok);
    }

    /// Migracao aplicada pela metade: a coluna existe, o resto nao. O primeiro
    /// comando do lote falha, e so a evidencia final decide se deu certo.
    #[tokio::test]
    async fn reaplicar_atravessa_migracao_aplicada_pela_metade() {
        let pool = pool_vazio().await;
        // `nature` em expenses ja existe; `status` e o `nature` de categories
        // nao. Reaplicar a v3 inteira morre no primeiro ALTER.
        pool.execute(
            r#"
            CREATE TABLE categories (id TEXT PRIMARY KEY NOT NULL);
            CREATE TABLE expenses (
                id TEXT PRIMARY KEY NOT NULL,
                nature TEXT NOT NULL DEFAULT 'saida',
                import_fingerprint TEXT
            );
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
        .expect("schema pela metade");
        for (versao, checksum) in checksums_esperados() {
            registrar(&pool, versao, checksum).await;
        }

        let d = diagnosticar(&pool).await.expect("diagnostico");
        assert_eq!(d.sem_efeito, vec![3, 5, 6]);

        let r = reparar(&pool, "backup.db".to_string())
            .await
            .expect("reparo");
        assert_eq!(r.reaplicadas, vec![3, 5, 6]);
        assert!(tem_coluna(&pool, "expenses", "status")
            .await
            .expect("status"));
        assert!(tem_coluna(&pool, "categories", "nature")
            .await
            .expect("nature"));
        assert!(tabela_existe(&pool, "cloud_backup_state")
            .await
            .expect("tabela"));
    }

    #[tokio::test]
    async fn toda_migracao_do_codigo_tem_evidencia_declarada() {
        // Aplica o SQL real de todas as migracoes e cobra que cada uma saiba se
        // reconhecer no schema. Se alguem adicionar a v6 e esquecer o
        // `efeito_presente`, este teste falha -- e o esquecimento viraria, em
        // campo, uma migracao carimbada sem nunca ter rodado.
        let pool = pool_vazio().await;
        for m in migrations() {
            pool.execute(m.sql).await.expect("aplicar migracao");
        }

        for (versao, _) in checksums_esperados() {
            if versao <= 2 {
                continue; // v1 e v2 criam o schema base; nao ha o que carimbar
            }
            assert_eq!(
                super::efeito_presente(&pool, versao)
                    .await
                    .expect("evidencia"),
                Some(true),
                "migracao v{versao} sem evidencia declarada em efeito_presente"
            );
        }
    }
}
