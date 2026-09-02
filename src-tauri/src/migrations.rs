use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_categories_and_expenses",
            sql: r#"
            CREATE TABLE IF NOT EXISTS categories (
                id             TEXT PRIMARY KEY NOT NULL,
                name           TEXT NOT NULL,
                icon           TEXT NOT NULL,
                color          TEXT NOT NULL,
                is_preset      INTEGER NOT NULL DEFAULT 0,
                budget_monthly INTEGER,
                sort_order     INTEGER NOT NULL DEFAULT 0,
                created_at     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS expenses (
                id           TEXT PRIMARY KEY NOT NULL,
                category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                description  TEXT NOT NULL DEFAULT '',
                amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
                date         TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
            CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "enforce_positive_expense_amounts",
            sql: r#"
            CREATE TEMP TABLE expense_amount_guard (id INTEGER);

            CREATE TEMP TRIGGER validate_legacy_expense_amounts
            BEFORE INSERT ON expense_amount_guard
            WHEN EXISTS (
                SELECT 1 FROM expenses
                WHERE typeof(amount_cents) <> 'integer' OR amount_cents <= 0
            )
            BEGIN
                SELECT RAISE(ABORT, 'Dados legados inválidos detectados. Restaure um backup antes de continuar.');
            END;

            INSERT INTO expense_amount_guard DEFAULT VALUES;

            DROP TRIGGER validate_legacy_expense_amounts;
            DROP TABLE expense_amount_guard;

            CREATE TRIGGER IF NOT EXISTS prevent_non_positive_expense_amount_insert
            BEFORE INSERT ON expenses
            WHEN typeof(NEW.amount_cents) <> 'integer' OR NEW.amount_cents <= 0
            BEGIN
                SELECT RAISE(ABORT, 'amount_cents deve ser um inteiro positivo');
            END;

            CREATE TRIGGER IF NOT EXISTS prevent_non_positive_expense_amount_update
            BEFORE UPDATE OF amount_cents ON expenses
            WHEN typeof(NEW.amount_cents) <> 'integer' OR NEW.amount_cents <= 0
            BEGIN
                SELECT RAISE(ABORT, 'amount_cents deve ser um inteiro positivo');
            END;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_transaction_state_columns",
            sql: r#"
            ALTER TABLE categories
            ADD COLUMN nature TEXT NOT NULL DEFAULT 'saida' CHECK (nature IN ('entrada', 'saida'));

            ALTER TABLE expenses
            ADD COLUMN nature TEXT NOT NULL DEFAULT 'saida' CHECK (nature IN ('entrada', 'saida'));

            ALTER TABLE expenses
            ADD COLUMN status TEXT NOT NULL DEFAULT 'realizado' CHECK (status IN ('previsto', 'realizado'));
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_expense_import_fingerprint",
            sql: r#"
            ALTER TABLE expenses ADD COLUMN import_fingerprint TEXT;

            CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_import_fingerprint
            ON expenses(import_fingerprint) WHERE import_fingerprint IS NOT NULL;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_cloud_entitlement_cache",
            sql: r#"
            -- Ultimo entitlement conhecido, para o app continuar utilizavel sem
            -- rede. Uma linha so: o app atende uma conta por vez.
            --
            -- A assinatura fica junto porque e ela que faz este cache valer:
            -- sem ela, trocar 'revogado' por 'ativo' aqui seria um editor de
            -- SQLite de distancia. Nao ha dado financeiro nesta tabela.
            CREATE TABLE IF NOT EXISTS cloud_entitlement (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                account_id TEXT NOT NULL,
                status TEXT NOT NULL,
                expires_at TEXT,
                issued_at TEXT NOT NULL,
                signature TEXT
            );

            -- De qual versao do backup ESTE aparelho partiu.
            --
            -- Precisa viver junto do banco, e nao em memoria: e ela que o
            -- If-Match envia. Se o aparelho perguntasse a versao atual ao
            -- servidor antes de enviar, todo push venceria, e o aparelho que
            -- passou semanas offline apagaria em silencio o trabalho do outro.
            CREATE TABLE IF NOT EXISTS cloud_backup_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                account_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                synced_at TEXT NOT NULL
            );
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_app_meta",
            sql: r#"
            -- Fatos sobre esta instalacao que nao sao dado do usuario.
            --
            -- Existe por causa das categorias predefinidas. Ate agora a semeadura
            -- perguntava "a tabela esta vazia?", e isso bastava porque ninguem
            -- conseguia apagar uma predefinida. Agora que da, a pergunta passou a
            -- ter a resposta errada no caso exato de quem apagou todas: no
            -- proximo boot elas voltariam, e o app pareceria ignorar a decisao da
            -- pessoa.
            --
            -- Uma marca explicita responde a pergunta certa -- "ja semeei alguma
            -- vez?" -- que estado nenhum da tabela de categorias consegue
            -- distinguir de uma instalacao nova.
            CREATE TABLE IF NOT EXISTS app_meta (
                chave TEXT PRIMARY KEY NOT NULL,
                valor TEXT NOT NULL
            );
        "#,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn migrations_enforce_positive_expense_amounts_without_rebuilding_expenses() {
        let migrations = migrations();
        assert_eq!(migrations.len(), 6);

        let initial = migrations
            .iter()
            .find(|migration| migration.version == 1)
            .expect("version 1 migration");
        assert!(initial
            .sql
            .contains("CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0)"));
        assert!(initial.sql.contains("idx_expenses_date"));
        assert!(initial.sql.contains("idx_expenses_category_id"));
        assert!(!initial.sql.contains("nature"));
        assert!(!initial.sql.contains("status"));

        let hardening = migrations
            .iter()
            .find(|migration| migration.version == 2)
            .expect("version 2 migration");
        assert!(hardening.sql.contains("CREATE TEMP TABLE"));
        assert!(hardening
            .sql
            .contains("CREATE TEMP TRIGGER validate_legacy_expense_amounts"));
        assert!(hardening
            .sql
            .contains("BEFORE INSERT ON expense_amount_guard"));
        assert!(hardening
            .sql
            .contains("typeof(amount_cents) <> 'integer' OR amount_cents <= 0"));
        assert!(hardening.sql.contains(
            "RAISE(ABORT, 'Dados legados inválidos detectados. Restaure um backup antes de continuar.')"
        ));
        assert!(hardening
            .sql
            .contains("INSERT INTO expense_amount_guard DEFAULT VALUES"));
        assert!(hardening
            .sql
            .contains("DROP TRIGGER validate_legacy_expense_amounts"));
        assert!(hardening.sql.contains("DROP TABLE expense_amount_guard"));
        assert!(hardening
            .sql
            .contains("CREATE TRIGGER IF NOT EXISTS prevent_non_positive_expense_amount_insert"));
        assert!(hardening
            .sql
            .contains("CREATE TRIGGER IF NOT EXISTS prevent_non_positive_expense_amount_update"));
        assert!(hardening.sql.contains("BEFORE INSERT ON expenses"));
        assert!(hardening
            .sql
            .contains("BEFORE UPDATE OF amount_cents ON expenses"));
        assert!(hardening
            .sql
            .contains("WHEN typeof(NEW.amount_cents) <> 'integer' OR NEW.amount_cents <= 0"));
        assert!(hardening
            .sql
            .contains("RAISE(ABORT, 'amount_cents deve ser um inteiro positivo')"));
        assert!(!hardening.sql.contains("DROP TABLE expenses"));
        assert!(!hardening.sql.contains("DELETE FROM expenses"));
        assert!(!hardening.sql.contains("UPDATE expenses"));
        assert!(!hardening.sql.contains("INSERT INTO expenses"));

        let transaction_state = migrations
            .iter()
            .find(|migration| migration.version == 3)
            .expect("version 3 migration");
        assert!(transaction_state
            .sql
            .contains("ALTER TABLE categories"));
        assert!(transaction_state
            .sql
            .contains("ADD COLUMN nature TEXT NOT NULL DEFAULT 'saida' CHECK (nature IN ('entrada', 'saida'))"));
        assert!(transaction_state
            .sql
            .contains("ALTER TABLE expenses"));
        assert!(transaction_state
            .sql
            .contains("ADD COLUMN status TEXT NOT NULL DEFAULT 'realizado' CHECK (status IN ('previsto', 'realizado'))"));
        assert!(!transaction_state.sql.contains("DROP TABLE"));
        assert!(!transaction_state.sql.contains("DELETE FROM"));

        let import_fingerprint = migrations
            .iter()
            .find(|migration| migration.version == 4)
            .expect("version 4 migration");
        assert!(import_fingerprint
            .sql
            .contains("ALTER TABLE expenses ADD COLUMN import_fingerprint TEXT"));
        assert!(import_fingerprint
            .sql
            .contains("CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_import_fingerprint"));
        assert!(import_fingerprint
            .sql
            .contains("ON expenses(import_fingerprint) WHERE import_fingerprint IS NOT NULL"));
    }
}

/// Reproduz o aparelho em campo: banco criado por uma versao com N migracoes,
/// aberto depois por uma versao com N+1. Espelha o `MigrationList::resolve` do
/// tauri-plugin-sql, que e quem monta o migrator de verdade.
#[cfg(test)]
mod migracao_incremental {
    use super::migrations;
    use sqlx::migrate::{MigrationType, Migrator};
    use sqlx::sqlite::SqlitePoolOptions;
    use std::borrow::Cow;

    fn migrator(ate: usize) -> Migrator {
        let migracoes: Vec<sqlx::migrate::Migration> = migrations()
            .into_iter()
            .take(ate)
            .map(|m| {
                sqlx::migrate::Migration::new(
                    m.version as i64,
                    m.description.into(),
                    MigrationType::ReversibleUp,
                    m.sql.into(),
                    false,
                )
            })
            .collect();
        Migrator {
            migrations: Cow::Owned(migracoes),
            ignore_missing: false,
            locking: true,
            no_tx: false,
        }
    }

    async fn tem_tabela(pool: &sqlx::SqlitePool, nome: &str) -> bool {
        sqlx::query_as::<_, (String,)>("SELECT name FROM sqlite_master WHERE name = $1")
            .bind(nome)
            .fetch_optional(pool)
            .await
            .expect("consulta")
            .is_some()
    }

    #[tokio::test]
    async fn a_ultima_migracao_e_aplicada_sobre_um_banco_que_parou_na_anterior() {
        let total = migrations().len();
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("pool");

        migrator(total - 1).run(&pool).await.expect("aplicar ate a penultima");
        assert!(!tem_tabela(&pool, "app_meta").await);

        migrator(total).run(&pool).await.expect("aplicar a ultima");
        assert!(
            tem_tabela(&pool, "app_meta").await,
            "a ultima migracao rodou mas a tabela dela nao existe"
        );
    }
}
