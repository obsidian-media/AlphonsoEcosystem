use rusqlite::{params, Connection};

pub(crate) fn ensure_kv_table(conn: &Connection) -> Result<(), String> {
  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS kv_store (
       key   TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at INTEGER NOT NULL DEFAULT 0
     );"
  ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kv_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_kv_table(&conn)?;
  let now = crate::now_ms() as i64;
  conn.execute(
    "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    params![key, value, now],
  ).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn kv_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_kv_table(&conn)?;
  match conn.query_row(
    "SELECT value FROM kv_store WHERE key = ?1 LIMIT 1",
    params![key],
    |row| row.get::<_, String>(0),
  ) {
    Ok(v) => Ok(Some(v)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings_json: String) -> Result<(), String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_kv_table(&conn)?;
  let now = crate::now_ms() as i64;
  conn.execute(
    "INSERT INTO kv_store (key, value, updated_at) VALUES ('app_settings', ?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    params![settings_json, now],
  ).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<Option<String>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_kv_table(&conn)?;
  let result = conn.query_row(
    "SELECT value FROM kv_store WHERE key = 'app_settings' LIMIT 1",
    [],
    |row| row.get::<_, String>(0),
  );
  match result {
    Ok(v) => Ok(Some(v)),
    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use rusqlite::Connection;

  #[test]
  fn ensure_kv_table_creates_table() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_kv_table(&conn).expect("ensure_kv_table should succeed");
    let table_exists: bool = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='kv_store'",
        [],
        |row| row.get::<_, i64>(0),
      )
      .expect("query sqlite_master")
      > 0;
    assert!(table_exists, "kv_store table should exist after ensure_kv_table");
  }

  #[test]
  fn kv_round_trip_set_and_get() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_kv_table(&conn).expect("ensure_kv_table");
    let now = crate::now_ms() as i64;

    conn.execute(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      params!["test_key", "test_value", now],
    )
    .expect("kv_set insert");

    let result: String = conn
      .query_row(
        "SELECT value FROM kv_store WHERE key = ?1 LIMIT 1",
        params!["test_key"],
        |row| row.get(0),
      )
      .expect("kv_get query");
    assert_eq!(result, "test_value");
  }

  #[test]
  fn kv_get_returns_none_for_missing_key() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_kv_table(&conn).expect("ensure_kv_table");

    let result = conn.query_row(
      "SELECT value FROM kv_store WHERE key = ?1 LIMIT 1",
      params!["nonexistent"],
      |row| row.get::<_, String>(0),
    );
    assert!(
      matches!(result, Err(rusqlite::Error::QueryReturnedNoRows)),
      "missing key should return QueryReturnedNoRows"
    );
  }

  #[test]
  fn kv_set_overwrites_existing_key() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_kv_table(&conn).expect("ensure_kv_table");
    let now = crate::now_ms() as i64;

    conn.execute(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)",
      params!["key1", "original", now],
    )
    .expect("first insert");

    conn.execute(
      "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      params!["key1", "overwritten", now],
    )
    .expect("overwrite insert");

    let result: String = conn
      .query_row(
        "SELECT value FROM kv_store WHERE key = ?1 LIMIT 1",
        params!["key1"],
        |row| row.get(0),
      )
      .expect("get overwritten value");
    assert_eq!(result, "overwritten");
  }

  #[test]
  fn settings_round_trip() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_kv_table(&conn).expect("ensure_kv_table");
    let now = crate::now_ms() as i64;
    let settings = r#"{"theme":"dark","language":"en"}"#;

    conn.execute(
      "INSERT INTO kv_store (key, value, updated_at) VALUES ('app_settings', ?1, ?2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      params![settings, now],
    )
    .expect("save_settings insert");

    let result: String = conn
      .query_row(
        "SELECT value FROM kv_store WHERE key = 'app_settings' LIMIT 1",
        [],
        |row| row.get(0),
      )
      .expect("load_settings query");
    assert_eq!(result, settings);
  }
}
