use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const MEMORY_SCHEMA_VERSION: u32 = 2;
pub(crate) const MEMORY_SCHEMA_INIT_MIGRATION_ID: &str = "memory_schema_init_v1";
pub(crate) const MEMORY_SCHEMA_V2_MIGRATION_ID: &str = "memory_schema_migration_v2";

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryRecord {
  pub(crate) id: String,
  pub(crate) title: String,
  pub(crate) content: Value,
  pub(crate) category: String,
  pub(crate) source_agent: String,
  pub(crate) source: String,
  pub(crate) timestamp_ms: u64,
  pub(crate) confidence: String,
  pub(crate) verification_state: String,
  pub(crate) project_reference: Option<String>,
  pub(crate) expires_at: Option<u64>,
  pub(crate) expiry_rule: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryListFilters {
  pub(crate) category: Option<String>,
  pub(crate) source_agent: Option<String>,
  pub(crate) confidence: Option<String>,
  pub(crate) project_reference: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryStoreStatus {
  pub(crate) available: bool,
  pub(crate) storage: String,
  pub(crate) path: String,
  pub(crate) schema_version: u32,
  pub(crate) record_count: u64,
  pub(crate) expired_count: u64,
  pub(crate) checked_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryWriteProof {
  pub(crate) requested: usize,
  pub(crate) written: usize,
  pub(crate) storage: String,
  pub(crate) path: String,
  pub(crate) written_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLedgerRecord {
  pub(crate) id: String,
  pub(crate) data: Value,
  pub(crate) status: String,
  pub(crate) confidence: String,
  pub(crate) verification_state: String,
  pub(crate) timestamp_ms: u64,
}

fn memory_db_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  let mut dir = crate::app_data_subdir(app, "memory")?;
  dir.push("alphonso_memory.sqlite3");
  Ok(dir)
}

pub(crate) fn open_memory_db(app: &tauri::AppHandle) -> Result<(Connection, std::path::PathBuf), String> {
  let path = memory_db_path(app)?;
  let conn = Connection::open(&path).map_err(|error| error.to_string())?;
  // WAL mode: allows concurrent reads during writes, prevents UI freeze on memory writes.
  // PRAGMA synchronous=NORMAL is safe with WAL and gives a solid durability/performance balance.
  conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536;")
    .map_err(|error| format!("WAL pragma failed: {}", error))?;
  initialize_memory_schema(&conn)?;
  Ok((conn, path))
}

fn read_memory_schema_version(conn: &Connection) -> u32 {
  conn
    .query_row(
      "SELECT CAST(value AS INTEGER) FROM memory_meta WHERE key = 'schema_version' LIMIT 1",
      [],
      |row| row.get::<_, i64>(0),
    )
    .map(|value| value.max(0) as u32)
    .unwrap_or(0)
}

fn initialize_memory_schema(conn: &Connection) -> Result<u32, String> {
  let schema_version = MEMORY_SCHEMA_VERSION;
  conn
    .execute_batch(
      "
      CREATE TABLE IF NOT EXISTS memory_records (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content_json TEXT NOT NULL,
        category TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        source TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        verification_state TEXT NOT NULL,
        project_reference TEXT,
        expires_at INTEGER,
        expiry_rule TEXT,
        updated_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_records(category);
      CREATE INDEX IF NOT EXISTS idx_memory_source_agent ON memory_records(source_agent);
      CREATE INDEX IF NOT EXISTS idx_memory_confidence ON memory_records(confidence);
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_records(timestamp_ms);
      CREATE TABLE IF NOT EXISTS memory_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_schema_migrations (
        migration_id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at_ms INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL,
        trust TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_schema_migrations_applied_at ON memory_schema_migrations(applied_at_ms DESC);
      CREATE TABLE IF NOT EXISTS runtime_ledger (
        scope TEXT NOT NULL,
        id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence TEXT NOT NULL,
        verification_state TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(scope, id)
      );
      CREATE INDEX IF NOT EXISTS idx_runtime_ledger_scope_time ON runtime_ledger(scope, timestamp_ms DESC);
      ",
    )
    .map_err(|error| error.to_string())?;

  let init_migration = serde_json::json!({
    "migrationId": MEMORY_SCHEMA_INIT_MIGRATION_ID,
    "description": "Initialize local memory tables and runtime ledger.",
    "schemaVersion": 1,
    "status": "applied",
    "trust": "verified"
  });
  let v2_migration = serde_json::json!({
    "migrationId": MEMORY_SCHEMA_V2_MIGRATION_ID,
    "description": "Add explicit migration registry and bump local memory schema version.",
    "schemaVersion": schema_version,
    "status": "applied",
    "trust": "verified"
  });
  let applied_at_ms = crate::now_ms() as i64;
  conn
    .execute(
      "
      INSERT OR IGNORE INTO memory_schema_migrations (
        migration_id, description, applied_at_ms, checksum, status, trust, details_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ",
      params![
        MEMORY_SCHEMA_INIT_MIGRATION_ID,
        "Initialize local memory tables and runtime ledger.",
        applied_at_ms,
        format!("memory-schema-init-{}", 1),
        "applied",
        "verified",
        init_migration.to_string()
      ],
    )
    .map_err(|error| error.to_string())?;
  conn
    .execute(
      "
      INSERT OR IGNORE INTO memory_schema_migrations (
        migration_id, description, applied_at_ms, checksum, status, trust, details_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ",
      params![
        MEMORY_SCHEMA_V2_MIGRATION_ID,
        "Add explicit migration registry and bump local memory schema version.",
        applied_at_ms,
        format!("memory-schema-v2-{}", schema_version),
        "applied",
        "verified",
        v2_migration.to_string()
      ],
    )
    .map_err(|error| error.to_string())?;
  conn
    .execute(
      "INSERT OR REPLACE INTO memory_meta(key, value) VALUES ('schema_version', ?1)",
      params![schema_version.to_string()],
    )
    .map_err(|error| error.to_string())?;

  Ok(read_memory_schema_version(conn))
}

fn row_to_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryRecord> {
  let content_json: String = row.get(2)?;
  let content = serde_json::from_str(&content_json).unwrap_or(Value::String(content_json));
  let timestamp_ms: i64 = row.get(6)?;
  let expires_at: Option<i64> = row.get(10)?;
  Ok(MemoryRecord {
    id: row.get(0)?,
    title: row.get(1)?,
    content,
    category: row.get(3)?,
    source_agent: row.get(4)?,
    source: row.get(5)?,
    timestamp_ms: timestamp_ms.max(0) as u64,
    confidence: row.get(7)?,
    verification_state: row.get(8)?,
    project_reference: row.get(9)?,
    expires_at: expires_at.map(|value| value.max(0) as u64),
    expiry_rule: row.get(11)?,
  })
}

fn row_to_runtime_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<RuntimeLedgerRecord> {
  let data_json: String = row.get(1)?;
  let data = serde_json::from_str(&data_json).unwrap_or(Value::String(data_json));
  let timestamp_ms: i64 = row.get(5)?;
  Ok(RuntimeLedgerRecord {
    id: row.get(0)?,
    data,
    status: row.get(2)?,
    confidence: row.get(3)?,
    verification_state: row.get(4)?,
    timestamp_ms: timestamp_ms.max(0) as u64,
  })
}

#[tauri::command]
pub(crate) fn get_memory_store_status(app: tauri::AppHandle) -> MemoryStoreStatus {
  let checked_at_ms = crate::now_ms();
  match open_memory_db(&app) {
    Ok((conn, path)) => {
      let record_count = conn
        .query_row("SELECT COUNT(*) FROM memory_records", [], |row| row.get::<_, i64>(0))
        .unwrap_or(0)
        .max(0) as u64;
      let expired_count = conn
        .query_row(
          "SELECT COUNT(*) FROM memory_records WHERE expires_at IS NOT NULL AND expires_at < ?1",
          params![checked_at_ms as i64],
          |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        .max(0) as u64;
      MemoryStoreStatus {
        available: true,
        storage: "sqlite".to_string(),
        path: path.to_string_lossy().to_string(),
        schema_version: read_memory_schema_version(&conn),
        record_count,
        expired_count,
        checked_at_ms,
        trust: "verified".to_string(),
        error: None,
      }
    }
    Err(error) => MemoryStoreStatus {
      available: false,
      storage: "sqlite".to_string(),
      path: String::new(),
      schema_version: 0,
      record_count: 0,
      expired_count: 0,
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(error),
    },
  }
}

#[tauri::command]
pub(crate) fn upsert_memory_records(app: tauri::AppHandle, records: Vec<MemoryRecord>) -> Result<MemoryWriteProof, String> {
  let written_at_ms = crate::now_ms();
  let (mut conn, path) = open_memory_db(&app)?;
  let tx = conn.transaction().map_err(|error| error.to_string())?;
  let mut written = 0_usize;

  for record in records.iter() {
    let content_json = serde_json::to_string(&record.content).map_err(|error| error.to_string())?;
    tx.execute(
      "
      INSERT OR REPLACE INTO memory_records (
        id, title, content_json, category, source_agent, source, timestamp_ms,
        confidence, verification_state, project_reference, expires_at, expiry_rule, updated_at_ms
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      ",
      params![
        &record.id,
        &record.title,
        content_json,
        &record.category,
        &record.source_agent,
        &record.source,
        record.timestamp_ms as i64,
        &record.confidence,
        &record.verification_state,
        record.project_reference.as_deref(),
        record.expires_at.map(|value| value as i64),
        record.expiry_rule.as_deref(),
        written_at_ms as i64,
      ],
    )
    .map_err(|error| error.to_string())?;
    written += 1;
  }

  tx.commit().map_err(|error| error.to_string())?;
  Ok(MemoryWriteProof {
    requested: records.len(),
    written,
    storage: "sqlite".to_string(),
    path: path.to_string_lossy().to_string(),
    written_at_ms,
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn list_memory_records(app: tauri::AppHandle, filters: Option<MemoryListFilters>) -> Result<Vec<MemoryRecord>, String> {
  let (conn, _) = open_memory_db(&app)?;
  let mut stmt = conn
    .prepare(
      "
      SELECT id, title, content_json, category, source_agent, source, timestamp_ms,
             confidence, verification_state, project_reference, expires_at, expiry_rule
      FROM memory_records
      ORDER BY timestamp_ms DESC
      LIMIT 1000
      ",
    )
    .map_err(|error| error.to_string())?;

  let rows = stmt.query_map([], row_to_memory).map_err(|error| error.to_string())?;
  let filters = filters.unwrap_or(MemoryListFilters {
    category: None,
    source_agent: None,
    confidence: None,
    project_reference: None,
  });
  let mut records = Vec::new();

  for row in rows {
    let record = row.map_err(|error| error.to_string())?;
    if let Some(category) = &filters.category {
      if category != "all" && &record.category != category {
        continue;
      }
    }
    if let Some(source_agent) = &filters.source_agent {
      if source_agent != "all" && &record.source_agent != source_agent {
        continue;
      }
    }
    if let Some(confidence) = &filters.confidence {
      if confidence != "all" && &record.confidence != confidence && &record.verification_state != confidence {
        continue;
      }
    }
    if let Some(project_reference) = &filters.project_reference {
      if !project_reference.trim().is_empty()
        && !record.project_reference.clone().unwrap_or_default().to_ascii_lowercase().contains(&project_reference.to_ascii_lowercase())
      {
        continue;
      }
    }
    records.push(record);
  }
  Ok(records)
}

#[tauri::command]
pub(crate) fn upsert_runtime_ledger_records(
  app: tauri::AppHandle,
  scope: String,
  records: Vec<RuntimeLedgerRecord>,
) -> Result<MemoryWriteProof, String> {
  let clean_scope = scope.trim().to_string();
  if clean_scope.is_empty() {
    return Err("runtime ledger scope is required".to_string());
  }

  let written_at_ms = crate::now_ms();
  let (mut conn, path) = open_memory_db(&app)?;
  let tx = conn.transaction().map_err(|error| error.to_string())?;
  let mut written = 0_usize;

  for record in records.iter().take(5000) {
    let data_json = serde_json::to_string(&record.data).map_err(|error| error.to_string())?;
    tx.execute(
      "
      INSERT OR REPLACE INTO runtime_ledger (
        scope, id, data_json, status, confidence, verification_state, timestamp_ms, updated_at_ms
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ",
      params![
        &clean_scope,
        &record.id,
        data_json,
        &record.status,
        &record.confidence,
        &record.verification_state,
        record.timestamp_ms as i64,
        written_at_ms as i64,
      ],
    )
    .map_err(|error| error.to_string())?;
    written += 1;
  }

  tx.commit().map_err(|error| error.to_string())?;
  Ok(MemoryWriteProof {
    requested: records.len(),
    written,
    storage: "sqlite_runtime_ledger".to_string(),
    path: path.to_string_lossy().to_string(),
    written_at_ms,
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn list_runtime_ledger_records(
  app: tauri::AppHandle,
  scope: String,
  limit: Option<u32>,
) -> Result<Vec<RuntimeLedgerRecord>, String> {
  let clean_scope = scope.trim().to_string();
  if clean_scope.is_empty() {
    return Ok(vec![]);
  }
  let limit = limit.unwrap_or(1200).clamp(1, 5000) as i64;
  let (conn, _) = open_memory_db(&app)?;
  let mut stmt = conn
    .prepare(
      "
      SELECT id, data_json, status, confidence, verification_state, timestamp_ms
      FROM runtime_ledger
      WHERE scope = ?1
      ORDER BY timestamp_ms DESC
      LIMIT ?2
      ",
    )
    .map_err(|error| error.to_string())?;
  let rows = stmt
    .query_map(params![clean_scope, limit], row_to_runtime_record)
    .map_err(|error| error.to_string())?;
  let mut records = Vec::new();
  for row in rows {
    records.push(row.map_err(|error| error.to_string())?);
  }
  Ok(records)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn initializes_memory_schema_with_migration_registry() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    let version = initialize_memory_schema(&conn).expect("initialize schema");
    assert_eq!(version, MEMORY_SCHEMA_VERSION);

    let migration_count: i64 = conn
      .query_row("SELECT COUNT(*) FROM memory_schema_migrations", [], |row| row.get(0))
      .expect("migration count");
    assert_eq!(migration_count, 2);

    let meta_version = read_memory_schema_version(&conn);
    assert_eq!(meta_version, MEMORY_SCHEMA_VERSION);
  }

  #[test]
  fn wal_pragma_applies_on_in_memory_db() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    // WAL mode is silently ignored on in-memory DBs (they use memory journal),
    // but the execute_batch must not return an error — this confirms the SQL is valid.
    let result = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    assert!(result.is_ok(), "WAL pragma should not error on in-memory db: {:?}", result);
  }
}
