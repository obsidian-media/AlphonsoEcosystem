use rusqlite::Connection;

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
}
