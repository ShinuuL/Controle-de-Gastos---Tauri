use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
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
                amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
                date         TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
            CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
        "#,
        kind: MigrationKind::Up,
    }]
}
