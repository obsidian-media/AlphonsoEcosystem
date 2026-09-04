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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GraphEdgeRowWithDepth {
  pub(crate) id: String,
  pub(crate) from_node_id: String,
  pub(crate) to_node_id: String,
  pub(crate) edge_type: String,
  pub(crate) confidence: String,
  pub(crate) created_by: String,
  pub(crate) created_event: Option<String>,
  #[serde(rename = "createdAtMs")]
  pub(crate) created_at: i64,
  pub(crate) depth: i64,
}

// Cycle protection tracks *visited edge ids*, not visited node ids. Tracking
// nodes would also exclude any edge that points back at an already-seen
// node (e.g. the edge that closes a cycle back to the origin) -- a real,
// legitimate edge, not an infinite-loop risk. Tracking edges instead still
// guarantees termination (a finite graph has finitely many edges, so a walk
// that never repeats an edge must end) while still surfacing every real
// edge in a cycle exactly once.
const SQL_TRAVERSE_FORWARD: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT e.to_node_id, t.depth + 1, t.visited || e.id || ',',
           e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON e.from_node_id = t.current_node
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || e.id || ',') = 0
  )
  SELECT edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at, MIN(depth) AS depth
  FROM traverse
  WHERE edge_id IS NOT NULL
  GROUP BY edge_id
  ORDER BY depth ASC, edge_id ASC
";

const SQL_TRAVERSE_BACKWARD: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT e.from_node_id, t.depth + 1, t.visited || e.id || ',',
           e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON e.to_node_id = t.current_node
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || e.id || ',') = 0
  )
  SELECT edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at, MIN(depth) AS depth
  FROM traverse
  WHERE edge_id IS NOT NULL
  GROUP BY edge_id
  ORDER BY depth ASC, edge_id ASC
";

const SQL_TRAVERSE_BOTH: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT
      (CASE WHEN e.from_node_id = t.current_node THEN e.to_node_id ELSE e.from_node_id END),
      t.depth + 1,
      t.visited || e.id || ',',
      e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON (e.from_node_id = t.current_node OR e.to_node_id = t.current_node)
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || e.id || ',') = 0
  )
  SELECT edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at, MIN(depth) AS depth
  FROM traverse
  WHERE edge_id IS NOT NULL
  GROUP BY edge_id
  ORDER BY depth ASC, edge_id ASC
";

pub(crate) fn query_related_deep_sql(
  conn: &Connection,
  node_id: &str,
  max_depth: i64,
  direction: &str,
) -> Result<Vec<GraphEdgeRowWithDepth>, String> {
  let sql = match direction {
    "forward" => SQL_TRAVERSE_FORWARD,
    "backward" => SQL_TRAVERSE_BACKWARD,
    "both" => SQL_TRAVERSE_BOTH,
    other => return Err(format!("unknown traversal direction: {other}")),
  };
  let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map(params![node_id, max_depth], |row| {
      Ok(GraphEdgeRowWithDepth {
        id: row.get(0)?,
        from_node_id: row.get(1)?,
        to_node_id: row.get(2)?,
        edge_type: row.get(3)?,
        confidence: row.get(4)?,
        created_by: row.get(5)?,
        created_event: row.get(6)?,
        created_at: row.get(7)?,
        depth: row.get(8)?,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row.map_err(|e| e.to_string())?);
  }
  Ok(result)
}

#[tauri::command]
pub fn memory_graph_query_related_deep(
  app: tauri::AppHandle,
  node_id: String,
  max_depth: i64,
  direction: String,
) -> Result<Vec<GraphEdgeRowWithDepth>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  query_related_deep_sql(&conn, &node_id, max_depth, &direction)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GraphNodeRow {
  pub(crate) id: String,
  pub(crate) node_type: String,
  pub(crate) ref_id: String,
  #[serde(rename = "createdAtMs")]
  pub(crate) created_at: i64,
}

pub(crate) fn list_nodes_sql(conn: &Connection, limit: i64) -> Result<Vec<GraphNodeRow>, String> {
  let mut stmt = conn
    .prepare("SELECT id, node_type, ref_id, created_at FROM memory_nodes ORDER BY created_at DESC LIMIT ?1")
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map(params![limit], |row| {
      Ok(GraphNodeRow {
        id: row.get(0)?,
        node_type: row.get(1)?,
        ref_id: row.get(2)?,
        created_at: row.get(3)?,
      })
    })
    .map_err(|e| e.to_string())?;
  let mut result = Vec::new();
  for row in rows {
    result.push(row.map_err(|e| e.to_string())?);
  }
  Ok(result)
}

pub(crate) fn list_edges_sql(conn: &Connection, limit: i64) -> Result<Vec<GraphEdgeRow>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at
       FROM memory_edges ORDER BY created_at DESC LIMIT ?1",
    )
    .map_err(|e| e.to_string())?;
  let rows = stmt
    .query_map(params![limit], |row| {
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

#[tauri::command]
pub fn memory_graph_list_nodes(
  app: tauri::AppHandle,
  limit: i64,
) -> Result<Vec<GraphNodeRow>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  list_nodes_sql(&conn, limit)
}

#[tauri::command]
pub fn memory_graph_list_edges(
  app: tauri::AppHandle,
  limit: i64,
) -> Result<Vec<GraphEdgeRow>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  list_edges_sql(&conn, limit)
}

fn build_common_neighbor_sql(scope_len: usize) -> String {
  let list: Vec<String> = (1..=scope_len).map(|i| format!("?{}", i)).collect();
  let list = list.join(", ");
  format!(
    "SELECT DISTINCT e1.from_node_id AS a, e2.to_node_id AS b
     FROM memory_edges e1
     JOIN memory_edges e2 ON e1.to_node_id = e2.from_node_id
     WHERE e1.from_node_id != e2.to_node_id
       AND (e1.from_node_id IN ({list}) OR e2.to_node_id IN ({list}))"
  )
}

fn build_shared_event_sql(scope_len: usize) -> String {
  let list: Vec<String> = (1..=scope_len).map(|i| format!("?{}", i)).collect();
  let list = list.join(", ");
  format!(
    "SELECT DISTINCT e1.from_node_id AS a, e2.from_node_id AS b
     FROM memory_edges e1
     JOIN memory_edges e2
       ON e1.created_event = e2.created_event AND e1.id != e2.id
     WHERE e1.created_event IS NOT NULL
       AND e1.from_node_id != e2.from_node_id
       AND (e1.from_node_id IN ({list}) OR e2.from_node_id IN ({list}))"
  )
}

// Core, directly-testable logic -- takes a plain &mut Connection (not an
// AppHandle) so it can run against an in-memory db in unit tests, matching
// the query_related_deep_sql / memory_graph_query_related_deep split above.
// &mut is required because building the transaction needs it.
pub(crate) fn infer_edges_sql(
  conn: &mut Connection,
  scope_node_ids: &[String],
  max_suggestions: i64,
) -> Result<Vec<GraphEdgeRow>, String> {
  if scope_node_ids.is_empty() {
    return Ok(Vec::new());
  }

  let tx = conn.transaction().map_err(|e| e.to_string())?;

  let mut candidates: Vec<(String, String)> = Vec::new();
  for sql in [
    build_common_neighbor_sql(scope_node_ids.len()),
    build_shared_event_sql(scope_node_ids.len()),
  ] {
    let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
    // Each numbered placeholder (?1..?N) appears twice in the SQL text (once
    // per side of the OR) but SQLite treats a numbered parameter as ONE
    // binding slot no matter how many times it's referenced -- bind the
    // scope ids exactly once, not doubled.
    let params: Vec<&dyn rusqlite::ToSql> = scope_node_ids
      .iter()
      .map(|s| s as &dyn rusqlite::ToSql)
      .collect();
    let rows = stmt
      .query_map(params.as_slice(), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
      })
      .map_err(|e| e.to_string())?;
    for row in rows {
      candidates.push(row.map_err(|e| e.to_string())?);
    }
  }

  let mut created: Vec<GraphEdgeRow> = Vec::new();
  let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

  for (from_id, to_id) in candidates {
    if from_id == to_id {
      continue;
    }
    let key = if from_id < to_id {
      (from_id.clone(), to_id.clone())
    } else {
      (to_id.clone(), from_id.clone())
    };
    if seen.contains(&key) {
      continue;
    }
    seen.insert(key);

    let exists: bool = tx
      .query_row(
        "SELECT EXISTS(SELECT 1 FROM memory_edges WHERE
           (from_node_id = ?1 AND to_node_id = ?2) OR
           (from_node_id = ?2 AND to_node_id = ?1))",
        params![from_id, to_id],
        |row| row.get(0),
      )
      .map_err(|e| e.to_string())?;
    if exists {
      continue;
    }

    if created.len() as i64 >= max_suggestions {
      break;
    }

    let id = crate::utils::generate_id();
    let created_at = crate::now_ms() as i64;
    tx.execute(
      "INSERT INTO memory_edges
         (id, from_node_id, to_node_id, edge_type, confidence,
          created_by, created_event, created_at)
       VALUES (?1, ?2, ?3, 'related', 'inferred', 'system:inference', NULL, ?4)",
      params![id, from_id, to_id, created_at],
    )
    .map_err(|e| e.to_string())?;

    created.push(GraphEdgeRow {
      id,
      from_node_id: from_id,
      to_node_id: to_id,
      edge_type: "related".to_string(),
      confidence: "inferred".to_string(),
      created_by: "system:inference".to_string(),
      created_event: None,
      created_at,
    });
  }

  tx.commit().map_err(|e| e.to_string())?;
  Ok(created)
}

#[tauri::command]
pub fn memory_graph_infer_edges(
  app: tauri::AppHandle,
  scope_node_ids: Vec<String>,
  max_suggestions: i64,
) -> Result<Vec<GraphEdgeRow>, String> {
  let (mut conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  infer_edges_sql(&mut conn, &scope_node_ids, max_suggestions)
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

  fn seed_chain(conn: &Connection) {
    // A -> B -> C -> D, each edge_type "next"
    let now = crate::now_ms() as i64;
    for (id, from, to) in [("e-ab", "A", "B"), ("e-bc", "B", "C"), ("e-cd", "C", "D")] {
      conn
        .execute(
          "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
           VALUES (?1, ?2, ?3, 'next', 'verified', 'test', NULL, ?4)",
          params![id, from, to, now],
        )
        .expect("seed edge insert");
    }
  }

  #[test]
  fn query_related_deep_forward_respects_max_depth() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_chain(&conn);

    let results = query_related_deep_sql(&conn, "A", 2, "forward").expect("query");
    let ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
    assert_eq!(
      ids,
      vec!["e-ab".to_string(), "e-bc".to_string()],
      "depth 2 forward from A should reach e-ab and e-bc but not e-cd"
    );
    assert_eq!(results.iter().find(|r| r.id == "e-ab").unwrap().depth, 1);
    assert_eq!(results.iter().find(|r| r.id == "e-bc").unwrap().depth, 2);
  }

  #[test]
  fn query_related_deep_backward_follows_edges_in_reverse() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_chain(&conn);

    let results = query_related_deep_sql(&conn, "C", 5, "backward").expect("query");
    let ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
    assert_eq!(
      ids,
      vec!["e-bc".to_string(), "e-ab".to_string()],
      "backward from C should reach e-bc (depth 1) then e-ab (depth 2)"
    );
  }

  #[test]
  fn query_related_deep_both_finds_edges_regardless_of_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_chain(&conn);

    let results = query_related_deep_sql(&conn, "B", 1, "both").expect("query");
    let mut ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
    ids.sort();
    assert_eq!(
      ids,
      vec!["e-ab".to_string(), "e-bc".to_string()],
      "'both' from B should find the incoming edge (e-ab) and outgoing edge (e-bc) at depth 1"
    );
  }

  #[test]
  fn query_related_deep_terminates_on_a_cycle() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let now = crate::now_ms() as i64;
    // A -> B -> C -> A (cycle)
    for (id, from, to) in [("e-ab", "A", "B"), ("e-bc", "B", "C"), ("e-ca", "C", "A")] {
      conn
        .execute(
          "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
           VALUES (?1, ?2, ?3, 'next', 'verified', 'test', NULL, ?4)",
          params![id, from, to, now],
        )
        .expect("seed edge insert");
    }

    // max_depth is deliberately generous (50) -- without cycle protection this
    // would either loop forever or return each edge many times.
    let results = query_related_deep_sql(&conn, "A", 50, "forward").expect("query");
    let mut ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
    ids.sort();
    assert_eq!(
      ids,
      vec!["e-ab".to_string(), "e-bc".to_string(), "e-ca".to_string()],
      "each edge in the cycle should appear exactly once"
    );
  }

  #[test]
  fn query_related_deep_rejects_unknown_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let result = query_related_deep_sql(&conn, "A", 5, "sideways");
    assert!(result.is_err(), "an unrecognized direction string should be rejected, not silently treated as one of the 3 valid values");
  }

  #[test]
  fn list_nodes_respects_limit_and_orders_newest_first() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    for (id, node_type, ref_id, created_at) in [
      ("memory_item:a", "memory_item", "a", 100),
      ("memory_item:b", "memory_item", "b", 200),
      ("memory_item:c", "memory_item", "c", 300),
    ] {
      conn
        .execute(
          "INSERT INTO memory_nodes (id, node_type, ref_id, created_at) VALUES (?1, ?2, ?3, ?4)",
          params![id, node_type, ref_id, created_at],
        )
        .expect("seed node insert");
    }

    let rows = list_nodes_sql(&conn, 2).expect("query");
    let ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    assert_eq!(
      ids,
      vec!["memory_item:c".to_string(), "memory_item:b".to_string()],
      "limit 2, newest first"
    );
  }

  #[test]
  fn list_nodes_returns_empty_vec_not_error_when_table_is_empty() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let rows = list_nodes_sql(&conn, 500).expect("query");
    assert_eq!(rows.len(), 0);
  }

  #[test]
  fn list_edges_respects_limit_and_orders_newest_first() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    for (id, created_at) in [("edge-a", 100), ("edge-b", 200), ("edge-c", 300)] {
      conn
        .execute(
          "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
           VALUES (?1, 'node-x', 'node-y', 'mentions', 'verified', 'test', NULL, ?2)",
          params![id, created_at],
        )
        .expect("seed edge insert");
    }

    let rows = list_edges_sql(&conn, 2).expect("query");
    let ids: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    assert_eq!(
      ids,
      vec!["edge-c".to_string(), "edge-b".to_string()],
      "limit 2, newest first"
    );
  }

  fn seed_edge(conn: &Connection, id: &str, from: &str, to: &str, created_event: Option<&str>) {
    let now = crate::now_ms() as i64;
    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES (?1, ?2, ?3, 'mentions', 'verified', 'test', ?4, ?5)",
        params![id, from, to, created_event, now],
      )
      .expect("seed edge insert");
  }

  #[test]
  fn infer_edges_finds_a_common_neighbor_pair() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    // A -> B -> C means A and C share neighbor B but have no direct edge.
    seed_edge(&conn, "e-ab", "A", "B", None);
    seed_edge(&conn, "e-bc", "B", "C", None);

    let created = infer_edges_sql(&mut conn, &["A".to_string()], 10).expect("infer");
    assert_eq!(
      created.len(),
      1,
      "should suggest exactly the A-C common-neighbor pair"
    );
    assert_eq!(created[0].from_node_id, "A");
    assert_eq!(created[0].to_node_id, "C");
    assert_eq!(created[0].edge_type, "related");
    assert_eq!(created[0].confidence, "inferred");
    assert_eq!(created[0].created_by, "system:inference");
    assert_eq!(created[0].created_event, None);
  }

  #[test]
  fn infer_edges_finds_a_shared_event_pair() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    // Two edges stamped with the same created_event but pointing from
    // otherwise-unconnected source nodes.
    seed_edge(&conn, "e-1", "X", "P", Some("pkt-1"));
    seed_edge(&conn, "e-2", "Y", "Q", Some("pkt-1"));

    let created = infer_edges_sql(&mut conn, &["X".to_string()], 10).expect("infer");
    assert_eq!(created.len(), 1, "should suggest the X-Y shared-event pair");
    let pair = (
      created[0].from_node_id.clone(),
      created[0].to_node_id.clone(),
    );
    assert!(
      pair == ("X".to_string(), "Y".to_string()) || pair == ("Y".to_string(), "X".to_string()),
      "expected an X-Y pair, got {:?}",
      pair
    );
  }

  #[test]
  fn infer_edges_does_not_fire_on_null_created_event() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_edge(&conn, "e-1", "X", "P", None);
    seed_edge(&conn, "e-2", "Y", "Q", None);

    let created = infer_edges_sql(&mut conn, &["X".to_string()], 10).expect("infer");
    assert_eq!(
      created.len(),
      0,
      "NULL created_event must never match another NULL"
    );
  }

  #[test]
  fn infer_edges_skips_a_pair_that_already_has_a_direct_edge() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_edge(&conn, "e-ab", "A", "B", None);
    seed_edge(&conn, "e-bc", "B", "C", None);
    // A and C already have a direct edge (in the reverse direction) -- must not duplicate.
    seed_edge(&conn, "e-ca", "C", "A", None);

    let created = infer_edges_sql(&mut conn, &["A".to_string()], 10).expect("infer");
    assert_eq!(
      created.len(),
      0,
      "A-C already connected (as C-A), should not be re-suggested"
    );
  }

  #[test]
  fn infer_edges_never_proposes_a_self_loop() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    // A -> B -> A: common-neighbor logic could otherwise suggest A-A.
    seed_edge(&conn, "e-ab", "A", "B", None);
    seed_edge(&conn, "e-ba", "B", "A", None);

    let created = infer_edges_sql(&mut conn, &["A".to_string()], 10).expect("infer");
    assert!(
      created.iter().all(|e| e.from_node_id != e.to_node_id),
      "no created edge should connect a node to itself"
    );
  }

  #[test]
  fn infer_edges_respects_max_suggestions_cap() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    // The scope filter matches a candidate pair's *endpoints* (e1.from /
    // e2.to), not an intermediate node -- so to generate many candidates
    // that actually touch scoped node "A", A must be a chain endpoint, not
    // a common-neighbor middleman. 5 independent 2-hop chains A -> Mi -> Li
    // each yield one (A, Li) candidate -- 5 candidates, far more than the
    // cap of 3.
    for (i, mid) in ["M1", "M2", "M3", "M4", "M5"].iter().enumerate() {
      let leaf = format!("L{}", i);
      seed_edge(&conn, &format!("e-a-{}", i), "A", mid, None);
      seed_edge(&conn, &format!("e-m-{}", i), mid, &leaf, None);
    }

    let created = infer_edges_sql(&mut conn, &["A".to_string()], 3).expect("infer");
    assert_eq!(
      created.len(),
      3,
      "cap of 3 must be respected even though more candidates exist"
    );
  }

  #[test]
  fn infer_edges_only_considers_pairs_touching_the_scope() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    // A-B-C is a valid common-neighbor pair, but scope is ["Z"] (unrelated) --
    // nothing here should touch Z, so no suggestions should fire.
    seed_edge(&conn, "e-ab", "A", "B", None);
    seed_edge(&conn, "e-bc", "B", "C", None);

    let created = infer_edges_sql(&mut conn, &["Z".to_string()], 10).expect("infer");
    assert_eq!(
      created.len(),
      0,
      "scope Z shares no edges with the A-B-C chain"
    );
  }

  #[test]
  fn infer_edges_returns_empty_for_empty_scope() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_edge(&conn, "e-ab", "A", "B", None);

    let created = infer_edges_sql(&mut conn, &[], 10).expect("infer");
    assert_eq!(created.len(), 0);
  }

  #[test]
  fn infer_edges_actually_persists_the_inserted_rows() {
    let mut conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_edge(&conn, "e-ab", "A", "B", None);
    seed_edge(&conn, "e-bc", "B", "C", None);

    infer_edges_sql(&mut conn, &["A".to_string()], 10).expect("infer");

    let count: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM memory_edges WHERE edge_type = 'related' AND confidence = 'inferred'",
        [],
        |row| row.get(0),
      )
      .expect("count query");
    assert_eq!(
      count, 1,
      "the suggested edge must actually be committed to the table"
    );
  }
}
