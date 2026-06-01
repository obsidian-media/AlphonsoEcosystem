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
  let (conn, _) = crate::open_memory_db(&app)?;
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
  let (conn, _) = crate::open_memory_db(&app)?;
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
  let (conn, _) = crate::open_memory_db(&app)?;
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
  let (conn, _) = crate::open_memory_db(&app)?;
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
