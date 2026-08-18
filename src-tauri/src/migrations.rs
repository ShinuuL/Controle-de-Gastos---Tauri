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
    ]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn migrations_enforce_positive_expense_amounts_without_rebuilding_expenses() {
        let migrations = migrations();
        assert_eq!(migrations.len(), 3);

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
    }
}
