use std::{collections::HashSet, path::PathBuf};

use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};
use tauri::{AppHandle, Manager};

const GENERIC_IMPORT_ERROR: &str = "Não foi possível confirmar a importação do extrato.";

#[derive(Clone, Debug, Deserialize)]
pub struct ApprovedImportLine {
    pub category_id: String,
    pub description: String,
    pub amount_cents: i64,
    pub date: String,
    pub nature: String,
    pub fingerprint: String,
    #[serde(rename = "createCategoryName")]
    pub create_category_name: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
pub struct ImportResult {
    pub imported: usize,
}

struct ValidatedImportLine {
    category_id: String,
    description: String,
    amount_cents: i64,
    date: String,
    nature: String,
    fingerprint: String,
    create_category_name: Option<String>,
}

fn validate_date(value: &str) -> bool {
    let parts: Vec<_> = value.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        parts[0].parse::<u32>(),
        parts[1].parse::<u32>(),
        parts[2].parse::<u32>(),
    ) else {
        return false;
    };
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 400 == 0 || (year % 4 == 0 && year % 100 != 0) => 29,
        2 => 28,
        _ => return false,
    };
    day >= 1 && day <= days
}

fn safe_category(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("Informe uma categoria válida.".to_string());
    }
    Ok(value.to_string())
}

fn validate_lines(lines: Vec<ApprovedImportLine>) -> Result<Vec<ValidatedImportLine>, String> {
    let mut fingerprints = HashSet::new();
    lines
        .into_iter()
        .map(|line| {
            let category_id = safe_category(&line.category_id)?;
            let description = line.description.trim().to_string();
            if description.len() > 500 {
                return Err("A descrição deve ter no máximo 500 caracteres.".to_string());
            }
            if line.amount_cents <= 0 {
                return Err("Informe um valor válido maior que zero.".to_string());
            }
            if !validate_date(&line.date) {
                return Err("Informe uma data válida.".to_string());
            }
            if line.nature != "entrada" && line.nature != "saida" {
                return Err("Informe uma natureza válida.".to_string());
            }
            let fingerprint = line.fingerprint.trim().to_string();
            if fingerprint.is_empty() {
                return Err("Informe um identificador de importação válido.".to_string());
            }
            if !fingerprints.insert(fingerprint.clone()) {
                return Err("Esta linha do extrato já foi importada.".to_string());
            }
            let create_category_name = line
                .create_category_name
                .as_deref()
                .map(safe_category)
                .transpose()?;
            Ok(ValidatedImportLine {
                category_id,
                description,
                amount_cents: line.amount_cents,
                date: line.date,
                nature: line.nature,
                fingerprint,
                create_category_name,
            })
        })
        .collect()
}

async fn category_id_for(
    tx: &mut Transaction<'_, Sqlite>,
    line: &ValidatedImportLine,
) -> Result<String, String> {
    let category_id = sqlx::query_scalar::<_, String>("SELECT id FROM categories WHERE id = $1")
        .bind(&line.category_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    if let Some(category_id) = category_id {
        return Ok(category_id);
    }
    let Some(name) = &line.create_category_name else {
        return Err("Categoria não encontrada.".to_string());
    };
    let category_id = sqlx::query_scalar::<_, String>("SELECT id FROM categories WHERE name = $1")
        .bind(name)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    if let Some(category_id) = category_id {
        return Ok(category_id);
    }
    let sort_order = sqlx::query_scalar::<_, Option<i64>>("SELECT MAX(sort_order) FROM categories")
        .fetch_one(&mut **tx)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?
        .unwrap_or(-1)
        + 1;
    let category_id = new_id(tx).await?;
    sqlx::query(
        "INSERT INTO categories (id, name, icon, color, is_preset, budget_monthly, sort_order, created_at) VALUES ($1, $2, $3, $4, 0, $5, $6, datetime('now'))",
    )
    .bind(&category_id)
    .bind(name)
    .bind("tag")
    .bind("#6366F1")
    .bind(Option::<i64>::None)
    .bind(sort_order)
    .execute(&mut **tx)
    .await
    .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    Ok(category_id)
}

async fn new_id(tx: &mut Transaction<'_, Sqlite>) -> Result<String, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))",
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(|_| GENERIC_IMPORT_ERROR.to_string())
}

async fn persist_lines(
    tx: &mut Transaction<'_, Sqlite>,
    lines: &[ValidatedImportLine],
) -> Result<ImportResult, String> {
    for line in lines {
        let duplicate = sqlx::query_scalar::<_, String>(
            "SELECT id FROM expenses WHERE import_fingerprint = $1",
        )
        .bind(&line.fingerprint)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
        if duplicate.is_some() {
            return Err("Esta linha do extrato já foi importada.".to_string());
        }
        let category_id = category_id_for(tx, line).await?;
        let id = new_id(tx).await?;
        sqlx::query(
            "INSERT INTO expenses (id, category_id, description, amount_cents, date, nature, status, created_at, updated_at, import_fingerprint) VALUES ($1, $2, $3, $4, $5, $6, 'realizado', datetime('now'), datetime('now'), $7)",
        )
        .bind(id)
        .bind(category_id)
        .bind(&line.description)
        .bind(line.amount_cents)
        .bind(&line.date)
        .bind(&line.nature)
        .bind(&line.fingerprint)
        .execute(&mut **tx)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    }
    Ok(ImportResult {
        imported: lines.len(),
    })
}

async fn persist_statement_import(
    pool: &SqlitePool,
    lines: &[ApprovedImportLine],
) -> Result<ImportResult, String> {
    let validated = validate_lines(lines.to_vec())?;
    if validated.is_empty() {
        return Ok(ImportResult { imported: 0 });
    }
    let mut tx = pool
        .begin()
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    match persist_lines(&mut tx, &validated).await {
        Ok(result) => tx
            .commit()
            .await
            .map(|_| result)
            .map_err(|_| GENERIC_IMPORT_ERROR.to_string()),
        Err(error) => {
            let _ = tx.rollback().await;
            Err(error)
        }
    }
}

fn database_url(app: &AppHandle) -> Result<String, String> {
    let path: PathBuf = app
        .path()
        .app_config_dir()
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?
        .join("controle-de-gastos.db");
    let path = path
        .to_str()
        .ok_or_else(|| GENERIC_IMPORT_ERROR.to_string())?;
    Ok(format!("sqlite:{path}"))
}

#[tauri::command]
pub async fn confirm_statement_import(
    app: AppHandle,
    lines: Vec<ApprovedImportLine>,
) -> Result<ImportResult, String> {
    let database_url = database_url(&app)?;
    let pool = SqlitePool::connect(&database_url)
        .await
        .map_err(|_| GENERIC_IMPORT_ERROR.to_string())?;
    persist_statement_import(&pool, &lines).await
}

#[cfg(test)]
mod tests {
    use super::{persist_statement_import, ApprovedImportLine, GENERIC_IMPORT_ERROR};
    use sqlx::{sqlite::SqlitePoolOptions, Executor};

    fn approved(fingerprint: &str, description: &str) -> ApprovedImportLine {
        ApprovedImportLine {
            category_id: "food".to_string(),
            description: description.to_string(),
            amount_cents: 1250,
            date: "2026-01-10".to_string(),
            nature: "saida".to_string(),
            fingerprint: fingerprint.to_string(),
            create_category_name: None,
        }
    }

    #[test]
    fn rolls_back_every_statement_line_when_a_later_insert_fails() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect("sqlite::memory:")
                .await
                .expect("in-memory SQLite pool");
            pool.execute(
                "CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, is_preset INTEGER NOT NULL DEFAULT 0, budget_monthly INTEGER, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, nature TEXT NOT NULL DEFAULT 'saida')",
            )
            .await
            .expect("categories schema");
            pool.execute(
                "CREATE TABLE expenses (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, date TEXT NOT NULL, nature TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, import_fingerprint TEXT UNIQUE)",
            )
            .await
            .expect("expenses schema");
            pool.execute("INSERT INTO categories (id, name, icon, color, created_at) VALUES ('food', 'Alimentação', 'tag', '#000000', 'now')")
                .await
                .expect("seed category");
            pool.execute(
                "CREATE TRIGGER reject_later_import BEFORE INSERT ON expenses WHEN NEW.description = 'falhar' BEGIN SELECT RAISE(ABORT, 'forçar falha'); END",
            )
            .await
            .expect("failure trigger");

            let result = persist_statement_import(
                &pool,
                &[approved("first", "primeira"), approved("second", "falhar")],
            )
            .await;

            assert_eq!(result, Err(GENERIC_IMPORT_ERROR.to_string()));
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expenses")
                .fetch_one(&pool)
                .await
                .expect("count expenses");
            assert_eq!(count, 0);
        });
    }
}
