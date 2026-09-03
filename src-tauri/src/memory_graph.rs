use rusqlite::{params, Connection};
use serde::Serialize;

pub(crate) fn ensure_memory_graph_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS memory_nodes (
       id TEXT PRIMARY KEY,
       node_type TEXT NOT NULL,
       ref_id TEXT NOT NULL,
       created_at INTEGER NOT NULL
     );
     CREATE TABLE IF NOT EXISTS memory_edges (
       id TEXT PRIMARY KEY,
       from_node_id TEXT NOT NULL,
       to_node_id TEXT NOT NULL,
       edge_type TEXT NOT NULL,
       confidence TEXT NOT NULL,
       created_by TEXT NOT NULL,
       created_event TEXT,
       created_at INTEGER NOT NULL
     );
     CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_node_id);
     CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_node_id);",
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_graph_add_node(
  app: tauri::AppHandle,
  node_type: String,
  ref_id: String,
) -> Result<String, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  let id = format!("{}:{}", node_type, ref_id);
  let now = crate::now_ms() as i64;
  conn
    .execute(
      "INSERT INTO memory_nodes (id, node_type, ref_id, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(id) DO NOTHING",
      params![id, node_type, ref_id, now],
    )
    .map_err(|e| e.to_string())?;
  Ok(id)
}

#[tauri::command]
pub fn memory_graph_add_edge(
  app: tauri::AppHandle,
  from_node_id: String,
  to_node_id: String,
  edge_type: String,
  confidence: String,
  created_by: String,
  created_event: Option<String>,
) -> Result<String, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  let id = crate::utils::generate_id();
  let now = crate::now_ms() as i64;
  conn
    .execute(
      "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
      params![id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, now],
    )
    .map_err(|e| e.to_string())?;
  Ok(id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GraphEdgeRow {
  pub(crate) id: String,
  pub(crate) from_node_id: String,
  pub(crate) to_node_id: String,
  pub(crate) edge_type: String,
  pub(crate) confidence: String,
  pub(crate) created_by: String,
  pub(crate) created_event: Option<String>,
  #[serde(rename = "createdAtMs")]
  pub(crate) created_at: i64,
}

#[tauri::command]
pub fn memory_graph_query_related(
  app: tauri::AppHandle,
  node_id: String,
) -> Result<Vec<GraphEdgeRow>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  let mut stmt = conn
    .prepare(
      "SELECT id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at
       FROM memory_edges WHERE from_node_id = ?1 OR to_node_id = ?1
       ORDER BY created_at DESC",
    )
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map(params![node_id], |row| {
      Ok(GraphEdgeRow {
        id: row.get(0)?,
        from_node_id: row.get(1)?,
        to_node_id: row.get(2)?,
        edge_type: row.get(3)?,
        confidence: row.get(4)?,
        created_by: row.get(5)?,
        created_event: row.get(6)?,
        created_at: row.get(7)?,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row.map_err(|e| e.to_string())?);
  }
  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ensure_memory_graph_tables_creates_both_tables() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables should succeed");
    let node_table_exists: bool = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='memory_nodes'",
        [],
        |row| row.get::<_, i64>(0),
      )
      .expect("query sqlite_master")
      > 0;
    let edge_table_exists: bool = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='memory_edges'",
        [],
        |row| row.get::<_, i64>(0),
      )
      .expect("query sqlite_master")
      > 0;
    assert!(node_table_exists, "memory_nodes table should exist");
    assert!(edge_table_exists, "memory_edges table should exist");
  }

  #[test]
  fn add_node_insert_is_idempotent_and_uses_deterministic_id() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let now = crate::now_ms() as i64;
    let id = format!("{}:{}", "memory_item", "mem-1");

    conn
      .execute(
        "INSERT INTO memory_nodes (id, node_type, ref_id, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO NOTHING",
        params![id, "memory_item", "mem-1", now],
      )
      .expect("first insert");
    conn
      .execute(
        "INSERT INTO memory_nodes (id, node_type, ref_id, created_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO NOTHING",
        params![id, "memory_item", "mem-1", now],
      )
      .expect("second insert should not error (idempotent)");

    let count: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM memory_nodes WHERE id = ?1",
        params![id],
        |row| row.get(0),
      )
      .expect("count query");
    assert_eq!(
      count, 1,
      "adding the same node twice should not duplicate rows"
    );
    assert_eq!(id, "memory_item:mem-1");
  }

  #[test]
  fn add_edge_insert_round_trips_all_fields() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let now = crate::now_ms() as i64;

    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
          "edge-1",
          "memory_item:mem-1",
          "memory_item:mem-2",
          "mentions",
          "user_confirmed",
          "echo",
          Some("mem-1"),
          now
        ],
      )
      .expect("edge insert");

    let (from_id, to_id, edge_type, confidence, created_by): (String, String, String, String, String) = conn
      .query_row(
        "SELECT from_node_id, to_node_id, edge_type, confidence, created_by FROM memory_edges WHERE id = ?1",
        params!["edge-1"],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
      )
      .expect("edge query");

    assert_eq!(from_id, "memory_item:mem-1");
    assert_eq!(to_id, "memory_item:mem-2");
    assert_eq!(edge_type, "mentions");
    assert_eq!(confidence, "user_confirmed");
    assert_eq!(created_by, "echo");
  }

  #[test]
  fn query_related_returns_edges_in_either_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let now = crate::now_ms() as i64;

    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES ('edge-a', 'node-x', 'node-y', 'mentions', 'verified', 'echo', NULL, ?1)",
        params![now],
      )
      .expect("edge-a insert");
    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES ('edge-b', 'node-z', 'node-x', 'informed_by', 'verified', 'jose', NULL, ?1)",
        params![now],
      )
      .expect("edge-b insert");
    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES ('edge-c', 'node-y', 'node-z', 'mentions', 'verified', 'echo', NULL, ?1)",
        params![now],
      )
      .expect("edge-c insert");

    let mut stmt = conn
      .prepare("SELECT id FROM memory_edges WHERE from_node_id = ?1 OR to_node_id = ?1 ORDER BY id")
      .expect("prepare");
    let ids: Vec<String> = stmt
      .query_map(params!["node-x"], |row| row.get::<_, String>(0))
      .expect("query_map")
      .map(|r| r.expect("row"))
      .collect();

    assert_eq!(ids, vec!["edge-a".to_string(), "edge-b".to_string()]);
  }
}
