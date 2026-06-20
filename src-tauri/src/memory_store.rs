use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const MEMORY_SCHEMA_VERSION: u32 = 3;
pub(crate) const MEMORY_SCHEMA_INIT_MIGRATION_ID: &str = "memory_schema_init_v1";
pub(crate) const MEMORY_SCHEMA_V2_MIGRATION_ID: &str = "memory_schema_migration_v2";
pub(crate) const MEMORY_SCHEMA_V3_MIGRATION_ID: &str = "memory_schema_migration_v3";

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

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventRecord {
  pub(crate) id: String,
  pub(crate) event_type: String,
  pub(crate) source: String,
  pub(crate) subject_kind: Option<String>,
  pub(crate) subject_id: Option<String>,
  pub(crate) outcome: String,
  pub(crate) payload: Value,
  pub(crate) dedup_key: String,
  pub(crate) occurred_at_ms: u64,
  pub(crate) correlation_id: Option<String>,
  pub(crate) trust: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventListFilters {
  pub(crate) event_type: Option<String>,
  pub(crate) source: Option<String>,
  pub(crate) outcome: Option<String>,
  pub(crate) subject_kind: Option<String>,
  pub(crate) subject_id: Option<String>,
  pub(crate) correlation_id: Option<String>,
  pub(crate) since_ms: Option<u64>,
  pub(crate) limit: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventStoreStatus {
  pub(crate) available: bool,
  pub(crate) storage: String,
  pub(crate) path: String,
  pub(crate) schema_version: u32,
  pub(crate) event_count: u64,
  pub(crate) dedup_count: u64,
  pub(crate) unique_event_types: u64,
  pub(crate) last_event_at_ms: Option<u64>,
  pub(crate) checked_at_ms: u64,
  pub(crate) trust: String,
  pub(crate) error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventWriteProof {
  pub(crate) requested: usize,
  pub(crate) written: usize,
  pub(crate) deduped: usize,
  pub(crate) storage: String,
  pub(crate) path: String,
  pub(crate) written_at_ms: u64,
  pub(crate) trust: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EventDedupRow {
  pub(crate) dedup_key: String,
  pub(crate) first_event_id: String,
  pub(crate) first_occurred_at_ms: u64,
  pub(crate) occurrence_count: u64,
  pub(crate) last_occurred_at_ms: u64,
  pub(crate) last_outcome: String,
  pub(crate) last_event_type: Option<String>,
  pub(crate) last_source: Option<String>,
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
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        subject_kind TEXT,
        subject_id TEXT,
        outcome TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        dedup_key TEXT NOT NULL,
        occurred_at_ms INTEGER NOT NULL,
        recorded_at_ms INTEGER NOT NULL,
        correlation_id TEXT,
        trust TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, occurred_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_events_source_time ON events(source, occurred_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_kind, subject_id);
      CREATE INDEX IF NOT EXISTS idx_events_outcome_time ON events(outcome, occurred_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_events_dedup_key ON events(dedup_key);
      CREATE TABLE IF NOT EXISTS event_dedup (
        dedup_key TEXT PRIMARY KEY,
        first_event_id TEXT NOT NULL,
        first_occurred_at_ms INTEGER NOT NULL,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        last_occurred_at_ms INTEGER NOT NULL,
        last_outcome TEXT NOT NULL,
        last_event_type TEXT,
        last_source TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_event_dedup_last_time ON event_dedup(last_occurred_at_ms DESC);
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
    "schemaVersion": 2,
    "status": "applied",
    "trust": "verified"
  });
  let v3_migration = serde_json::json!({
    "migrationId": MEMORY_SCHEMA_V3_MIGRATION_ID,
    "description": "Add canonical events + event_dedup tables for runtime event sourcing.",
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
        format!("memory-schema-v2-{}", 2),
        "applied",
        "verified",
        v2_migration.to_string()
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
        MEMORY_SCHEMA_V3_MIGRATION_ID,
        "Add canonical events + event_dedup tables for runtime event sourcing.",
        applied_at_ms,
        format!("memory-schema-v3-{}", schema_version),
        "applied",
        "verified",
        v3_migration.to_string()
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

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<EventRecord> {
  let payload_json: String = row.get(6)?;
  let payload = serde_json::from_str(&payload_json).unwrap_or(Value::String(payload_json));
  let occurred_at_ms: i64 = row.get(8)?;
  Ok(EventRecord {
    id: row.get(0)?,
    event_type: row.get(1)?,
    source: row.get(2)?,
    subject_kind: row.get(3)?,
    subject_id: row.get(4)?,
    outcome: row.get(5)?,
    payload,
    dedup_key: row.get(7)?,
    occurred_at_ms: occurred_at_ms.max(0) as u64,
    correlation_id: row.get(10)?,
    trust: row.get(11)?,
  })
}

fn row_to_event_dedup(row: &rusqlite::Row<'_>) -> rusqlite::Result<EventDedupRow> {
  let first_ms: i64 = row.get(2)?;
  let last_ms: i64 = row.get(4)?;
  Ok(EventDedupRow {
    dedup_key: row.get(0)?,
    first_event_id: row.get(1)?,
    first_occurred_at_ms: first_ms.max(0) as u64,
    occurrence_count: row.get::<_, i64>(3)?.max(0) as u64,
    last_occurred_at_ms: last_ms.max(0) as u64,
    last_outcome: row.get(5)?,
    last_event_type: row.get(6)?,
    last_source: row.get(7)?,
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

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum EventInsertOutcome {
  Written,
  Deduped,
}

pub(crate) fn insert_event(conn: &mut Connection, event: &EventRecord) -> Result<EventInsertOutcome, String> {
  let payload_json = serde_json::to_string(&event.payload).map_err(|error| error.to_string())?;
  let occurred_at_ms = event.occurred_at_ms as i64;
  let recorded_at_ms = crate::now_ms() as i64;
  let tx = conn.transaction().map_err(|error| error.to_string())?;

  // Check if dedup_key already exists. If so, this is a duplicate operation:
  // increment the counter but do NOT insert a new events row.
  let already_exists: bool = tx
    .query_row(
      "SELECT COUNT(*) > 0 FROM event_dedup WHERE dedup_key = ?1",
      params![event.dedup_key],
      |row| row.get(0),
    )
    .unwrap_or(false);

  let inserted = if already_exists {
    0
  } else {
    // First time for this dedup_key: insert the event row.
    tx.execute(
      "
      INSERT OR IGNORE INTO events (
        id, event_type, source, subject_kind, subject_id, outcome, payload_json,
        dedup_key, occurred_at_ms, recorded_at_ms, correlation_id, trust
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      ",
      params![
        &event.id,
        &event.event_type,
        &event.source,
        event.subject_kind.as_deref(),
        event.subject_id.as_deref(),
        &event.outcome,
        payload_json,
        &event.dedup_key,
        occurred_at_ms,
        recorded_at_ms,
        event.correlation_id.as_deref(),
        &event.trust
      ],
    )
    .map_err(|error| error.to_string())?
  };

  // Always touch event_dedup so dedup counters reflect the latest call.
  tx.execute(
    "
    INSERT INTO event_dedup (
      dedup_key, first_event_id, first_occurred_at_ms, occurrence_count,
      last_occurred_at_ms, last_outcome, last_event_type, last_source
    ) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7)
    ON CONFLICT(dedup_key) DO UPDATE SET
      occurrence_count = occurrence_count + 1,
      last_occurred_at_ms = excluded.last_occurred_at_ms,
      last_outcome = excluded.last_outcome,
      last_event_type = excluded.last_event_type,
      last_source = excluded.last_source
    ",
    params![
      &event.dedup_key,
      &event.id,
      occurred_at_ms,
      occurred_at_ms,
      &event.outcome,
      &event.event_type,
      &event.source
    ],
  )
  .map_err(|error| error.to_string())?;

  tx.commit().map_err(|error| error.to_string())?;

  if already_exists || inserted == 0 {
    Ok(EventInsertOutcome::Deduped)
  } else {
    Ok(EventInsertOutcome::Written)
  }
}

pub(crate) fn list_events(conn: &Connection, filters: &EventListFilters) -> Vec<EventRecord> {
  let limit = filters.limit.unwrap_or(500).clamp(1, 5000) as i64;
  let mut sql = String::from(
    "SELECT id, event_type, source, subject_kind, subject_id, outcome, payload_json, \
            dedup_key, occurred_at_ms, recorded_at_ms, correlation_id, trust \
     FROM events WHERE 1=1"
  );
  let mut binds: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
  if let Some(et) = &filters.event_type {
    if !et.is_empty() && et != "all" {
      sql.push_str(" AND event_type = ?");
      binds.push(Box::new(et.clone()));
    }
  }
  if let Some(src) = &filters.source {
    if !src.is_empty() && src != "all" {
      sql.push_str(" AND source = ?");
      binds.push(Box::new(src.clone()));
    }
  }
  if let Some(oc) = &filters.outcome {
    if !oc.is_empty() && oc != "all" {
      sql.push_str(" AND outcome = ?");
      binds.push(Box::new(oc.clone()));
    }
  }
  if let Some(sk) = &filters.subject_kind {
    if !sk.is_empty() {
      sql.push_str(" AND subject_kind = ?");
      binds.push(Box::new(sk.clone()));
    }
  }
  if let Some(sid) = &filters.subject_id {
    if !sid.is_empty() {
      sql.push_str(" AND subject_id = ?");
      binds.push(Box::new(sid.clone()));
    }
  }
  if let Some(cid) = &filters.correlation_id {
    if !cid.is_empty() {
      sql.push_str(" AND correlation_id = ?");
      binds.push(Box::new(cid.clone()));
    }
  }
  if let Some(since) = filters.since_ms {
    sql.push_str(" AND occurred_at_ms >= ?");
    binds.push(Box::new(since as i64));
  }
  sql.push_str(" ORDER BY occurred_at_ms DESC LIMIT ?");
  binds.push(Box::new(limit));

  let mut stmt = match conn.prepare(&sql) {
    Ok(stmt) => stmt,
    Err(_) => return Vec::new(),
  };
  let bind_refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|b| b.as_ref()).collect();
  let rows = match stmt.query_map(&bind_refs[..], row_to_event) {
    Ok(rows) => rows,
    Err(_) => return Vec::new(),
  };
  rows.filter_map(|r| r.ok()).collect()
}

pub(crate) fn list_event_dedup(conn: &Connection, limit: u32) -> Vec<EventDedupRow> {
  let limit = limit.clamp(1, 5000) as i64;
  let mut stmt = match conn.prepare(
    "SELECT dedup_key, first_event_id, first_occurred_at_ms, occurrence_count, \
            last_occurred_at_ms, last_outcome, last_event_type, last_source \
     FROM event_dedup ORDER BY last_occurred_at_ms DESC LIMIT ?1"
  ) {
    Ok(stmt) => stmt,
    Err(_) => return Vec::new(),
  };
  let rows = match stmt.query_map(params![limit], row_to_event_dedup) {
    Ok(rows) => rows,
    Err(_) => return Vec::new(),
  };
  rows.filter_map(|r| r.ok()).collect()
}

pub(crate) fn compute_event_status(conn: &Connection) -> EventStoreStatus {
  let event_count: u64 = conn
    .query_row("SELECT COUNT(*) FROM events", [], |row| row.get::<_, i64>(0))
    .unwrap_or(0)
    .max(0) as u64;
  let dedup_count: u64 = conn
    .query_row("SELECT COUNT(*) FROM event_dedup", [], |row| row.get::<_, i64>(0))
    .unwrap_or(0)
    .max(0) as u64;
  let unique_event_types: u64 = conn
    .query_row("SELECT COUNT(DISTINCT event_type) FROM events", [], |row| row.get::<_, i64>(0))
    .unwrap_or(0)
    .max(0) as u64;
  let last_event_at_ms: Option<i64> = conn
    .query_row("SELECT MAX(occurred_at_ms) FROM events", [], |row| row.get(0))
    .unwrap_or(None);
  EventStoreStatus {
    available: true,
    storage: "sqlite".to_string(),
    path: String::new(),
    schema_version: read_memory_schema_version(conn),
    event_count,
    dedup_count,
    unique_event_types,
    last_event_at_ms: last_event_at_ms.map(|v| v.max(0) as u64),
    checked_at_ms: crate::now_ms(),
    trust: "verified".to_string(),
    error: None,
  }
}

#[tauri::command]
pub(crate) fn record_event(app: tauri::AppHandle, event: EventRecord) -> Result<EventWriteProof, String> {
  let written_at_ms = crate::now_ms();
  let (mut conn, path) = open_memory_db(&app)?;
  let outcome = insert_event(&mut conn, &event)?;
  drop(conn);
  Ok(EventWriteProof {
    requested: 1,
    written: if outcome == EventInsertOutcome::Written { 1 } else { 0 },
    deduped: if outcome == EventInsertOutcome::Deduped { 1 } else { 0 },
    storage: "sqlite_events".to_string(),
    path: path.to_string_lossy().to_string(),
    written_at_ms,
    trust: "verified".to_string(),
  })
}

#[tauri::command]
pub(crate) fn list_events_command(app: tauri::AppHandle, filters: Option<EventListFilters>) -> Result<Vec<EventRecord>, String> {
  let (conn, _) = open_memory_db(&app)?;
  Ok(list_events(&conn, &filters.unwrap_or_default()))
}

#[tauri::command]
pub(crate) fn list_event_dedup_command(app: tauri::AppHandle, limit: Option<u32>) -> Result<Vec<EventDedupRow>, String> {
  let (conn, _) = open_memory_db(&app)?;
  Ok(list_event_dedup(&conn, limit.unwrap_or(200)))
}

#[tauri::command]
pub(crate) fn get_event_store_status(app: tauri::AppHandle) -> EventStoreStatus {
  let checked_at_ms = crate::now_ms();
  match open_memory_db(&app) {
    Ok((conn, path)) => {
      let mut status = compute_event_status(&conn);
      status.path = path.to_string_lossy().to_string();
      status.checked_at_ms = checked_at_ms;
      status
    }
    Err(error) => EventStoreStatus {
      available: false,
      storage: "sqlite".to_string(),
      path: String::new(),
      schema_version: 0,
      event_count: 0,
      dedup_count: 0,
      unique_event_types: 0,
      last_event_at_ms: None,
      checked_at_ms,
      trust: "failed".to_string(),
      error: Some(error),
    },
  }
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
    assert_eq!(migration_count, 3);

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

  fn sample_event(id: &str, dedup_key: &str, occurred_at_ms: u64, outcome: &str) -> EventRecord {
    EventRecord {
      id: id.to_string(),
      event_type: "ollama.preflight".to_string(),
      source: "alphonso/operator".to_string(),
      subject_kind: Some("ollama_model".to_string()),
      subject_id: Some("llama3.2:3b".to_string()),
      outcome: outcome.to_string(),
      payload: serde_json::json!({ "endpoint": "http://127.0.0.1:11434" }),
      dedup_key: dedup_key.to_string(),
      occurred_at_ms,
      correlation_id: Some("preflight-2026-06-07".to_string()),
      trust: "verified".to_string(),
    }
  }

  #[test]
  fn record_event_inserts_first_and_dedupes_subsequent() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    initialize_memory_schema(&conn).expect("initialize schema");

    // First insertion: writes both events + event_dedup rows.
    let first = insert_event(&mut conn, &sample_event("evt-1", "ollama.preflight:llama3.2:3b", 1_000, "success")).expect("first insert");
    assert_eq!(first, EventInsertOutcome::Written);

    // Same dedup_key, different id: deduped (no new event row).
    let second = insert_event(&mut conn, &sample_event("evt-2", "ollama.preflight:llama3.2:3b", 2_000, "success")).expect("second insert");
    assert_eq!(second, EventInsertOutcome::Deduped);

    // Different dedup_key: written again.
    let third = insert_event(&mut conn, &sample_event("evt-3", "notion.sync.pull:abc123", 3_000, "failure")).expect("third insert");
    assert_eq!(third, EventInsertOutcome::Written);

    let event_count: i64 = conn
      .query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))
      .expect("event count");
    assert_eq!(event_count, 2, "deduped events must not produce a new row");

    let dedup_count: i64 = conn
      .query_row("SELECT COUNT(*) FROM event_dedup", [], |row| row.get(0))
      .expect("dedup count");
    assert_eq!(dedup_count, 2);

    let occurrence: i64 = conn
      .query_row(
        "SELECT occurrence_count FROM event_dedup WHERE dedup_key = ?1",
        params!["ollama.preflight:llama3.2:3b"],
        |row| row.get(0),
      )
      .expect("occurrence count");
    assert_eq!(occurrence, 2, "dedup counter must increment on duplicate");
  }

  #[test]
  fn record_event_preserves_first_event_id_in_dedup() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    initialize_memory_schema(&conn).expect("initialize schema");

    insert_event(&mut conn, &sample_event("evt-first", "k1", 100, "success")).expect("first");
    insert_event(&mut conn, &sample_event("evt-second", "k1", 200, "failure")).expect("second");

    let first_event_id: String = conn
      .query_row(
        "SELECT first_event_id FROM event_dedup WHERE dedup_key = ?1",
        params!["k1"],
        |row| row.get(0),
      )
      .expect("first_event_id");
    assert_eq!(first_event_id, "evt-first", "first_event_id must remain stable across dedupes");

    let last_outcome: String = conn
      .query_row(
        "SELECT last_outcome FROM event_dedup WHERE dedup_key = ?1",
        params!["k1"],
        |row| row.get(0),
      )
      .expect("last_outcome");
    assert_eq!(last_outcome, "failure", "last_outcome must reflect the latest call");
  }

  #[test]
  fn list_events_filters_by_event_type_and_correlation() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    initialize_memory_schema(&conn).expect("initialize schema");

    let mut a = sample_event("a", "ollama.preflight:llama3.2:3b", 100, "success");
    a.event_type = "ollama.preflight".to_string();
    a.correlation_id = Some("boot-1".to_string());
    insert_event(&mut conn, &a).expect("a");

    let mut b = sample_event("b", "notion.sync.pull:abc", 200, "success");
    b.event_type = "notion.sync.pull".to_string();
    b.correlation_id = Some("boot-1".to_string());
    insert_event(&mut conn, &b).expect("b");

    let mut c = sample_event("c", "ollama.preflight:qwen2.5:3b", 300, "blocked");
    c.event_type = "ollama.preflight".to_string();
    c.subject_id = Some("qwen2.5:3b".to_string());
    c.outcome = "blocked".to_string();
    c.correlation_id = Some("boot-2".to_string());
    insert_event(&mut conn, &c).expect("c");

    let preflights = list_events(&conn, &EventListFilters {
      event_type: Some("ollama.preflight".to_string()),
      ..EventListFilters::default()
    });
    assert_eq!(preflights.len(), 2);

    let boot1 = list_events(&conn, &EventListFilters {
      correlation_id: Some("boot-1".to_string()),
      ..EventListFilters::default()
    });
    assert_eq!(boot1.len(), 2);

    let blocked = list_events(&conn, &EventListFilters {
      outcome: Some("blocked".to_string()),
      ..EventListFilters::default()
    });
    assert_eq!(blocked.len(), 1);
    assert_eq!(blocked[0].id, "c");
  }

  #[test]
  fn event_status_reflects_counts_and_last_event() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    initialize_memory_schema(&conn).expect("initialize schema");

    insert_event(&mut conn, &sample_event("e1", "k1", 100, "success")).expect("e1");
    insert_event(&mut conn, &sample_event("e2", "k2", 200, "failure")).expect("e2");
    insert_event(&mut conn, &sample_event("e3", "k1", 300, "success")).expect("e3 dedup");

    let status = compute_event_status(&conn);
    assert_eq!(status.event_count, 2);
    assert_eq!(status.dedup_count, 2);
    assert_eq!(status.last_event_at_ms, Some(200));
    assert_eq!(status.unique_event_types, 1);
  }
}
