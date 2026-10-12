//! Memory knowledge graph — Phase 4 (governance): retention and pruning.
//!
//! Design: `docs/superpowers/specs/2026-10-06-memory-knowledge-graph-phase4-governance-design.md`.
//!
//! The Rust side only *executes numbers*: every window, protection list and
//! the live-memory-item list arrives in a [`PrunePolicy`] built by the TS side
//! (`memoryGraphRetentionService.ts`, which owns the policy constants). That
//! keeps the retention vocabulary in one place (Echo's `RETENTION_RULES`) and
//! lets tests pass tiny windows.
//!
//! Only graph rows are ever touched — never the memory items themselves.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const DAY_MS: i64 = 86_400_000;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryItemRetention {
  pub(crate) ref_id: String,
  /// `None` = permanent (never pruned, and anchors provenance protection).
  pub(crate) days: Option<i64>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrunePolicy {
  /// Per node_type window in days (receipt, packet, boardroom_message, ...).
  /// A node type absent from this map is never pruned by age.
  #[serde(default)]
  pub(crate) node_window_days: HashMap<String, i64>,
  /// Live memory items and their retention. `None` means the caller could not
  /// enumerate memory items: every `memory_item` node is then protected and no
  /// orphan detection happens (fail safe).
  #[serde(default)]
  pub(crate) memory_items: Option<Vec<MemoryItemRetention>>,
  /// ref_ids that must never be pruned (escalated/acknowledged threads, ...).
  #[serde(default)]
  pub(crate) protected_ref_ids: Vec<String>,
  /// Inferred edges not confirmed for this many days are dropped.
  pub(crate) inferred_edge_days: i64,
  /// Nodes read within this many days are protected.
  pub(crate) protect_accessed_days: i64,
  /// A real run that would remove more than this fraction of nodes aborts.
  #[serde(default = "default_max_fraction")]
  pub(crate) max_remove_fraction: f64,
  #[serde(default)]
  pub(crate) dry_run: bool,
  /// Test hook; production callers leave it unset.
  #[serde(default)]
  pub(crate) now_ms: Option<i64>,
}

fn default_max_fraction() -> f64 {
  0.5
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PruneReport {
  pub(crate) dry_run: bool,
  pub(crate) aborted: bool,
  pub(crate) abort_reason: Option<String>,
  pub(crate) total_nodes: i64,
  pub(crate) total_edges: i64,
  pub(crate) nodes_removed: i64,
  pub(crate) edges_removed: i64,
  pub(crate) protected_nodes: i64,
  pub(crate) within_window_nodes: i64,
  pub(crate) removed_by_type: HashMap<String, i64>,
}

struct Node {
  id: String,
  node_type: String,
  ref_id: String,
  created_at: i64,
  last_accessed_at: Option<i64>,
}

struct Edge {
  id: String,
  from: String,
  to: String,
  confidence: String,
  created_at: i64,
  last_seen_at: Option<i64>,
}

impl Edge {
  fn activity(&self) -> i64 {
    self
      .last_seen_at
      .unwrap_or(self.created_at)
      .max(self.created_at)
  }
}

pub(crate) fn prune_graph_sql(
  conn: &mut Connection,
  policy: &PrunePolicy,
) -> Result<PruneReport, String> {
  let now = policy.now_ms.unwrap_or_else(|| crate::now_ms() as i64);

  let nodes: Vec<Node> = {
    let mut stmt = conn
      .prepare("SELECT id, node_type, ref_id, created_at, last_accessed_at FROM memory_nodes")
      .map_err(|e| e.to_string())?;
    let rows = stmt
      .query_map([], |r| {
        Ok(Node {
          id: r.get(0)?,
          node_type: r.get(1)?,
          ref_id: r.get(2)?,
          created_at: r.get(3)?,
          last_accessed_at: r.get(4)?,
        })
      })
      .map_err(|e| e.to_string())?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| e.to_string())?
  };
  let edges: Vec<Edge> = {
    let mut stmt = conn
      .prepare(
        "SELECT id, from_node_id, to_node_id, confidence, created_at, last_seen_at FROM memory_edges",
      )
      .map_err(|e| e.to_string())?;
    let rows = stmt
      .query_map([], |r| {
        Ok(Edge {
          id: r.get(0)?,
          from: r.get(1)?,
          to: r.get(2)?,
          confidence: r.get(3)?,
          created_at: r.get(4)?,
          last_seen_at: r.get(5)?,
        })
      })
      .map_err(|e| e.to_string())?;
    rows
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| e.to_string())?
  };

  let mut report = PruneReport {
    dry_run: policy.dry_run,
    total_nodes: nodes.len() as i64,
    total_edges: edges.len() as i64,
    ..Default::default()
  };

  let item_retention: Option<HashMap<&str, Option<i64>>> = policy
    .memory_items
    .as_ref()
    .map(|items| items.iter().map(|i| (i.ref_id.as_str(), i.days)).collect());
  let protected_refs: HashSet<&str> = policy
    .protected_ref_ids
    .iter()
    .map(|s| s.as_str())
    .collect();

  // Latest activity per node: its own creation or any adjacent edge's
  // creation / re-confirmation, whichever is newest.
  let mut activity: HashMap<&str, i64> = nodes
    .iter()
    .map(|n| (n.id.as_str(), n.created_at))
    .collect();
  for e in &edges {
    let a = e.activity();
    for end in [e.from.as_str(), e.to.as_str()] {
      if let Some(v) = activity.get_mut(end) {
        if a > *v {
          *v = a;
        }
      }
    }
  }

  // Permanent anchors: permanent memory items plus explicitly protected refs.
  let node_by_id: HashMap<&str, &Node> = nodes.iter().map(|n| (n.id.as_str(), n)).collect();
  let is_permanent = |n: &Node| -> bool {
    protected_refs.contains(n.ref_id.as_str())
      || (n.node_type == "memory_item"
        && item_retention
          .as_ref()
          .map(|m| matches!(m.get(n.ref_id.as_str()), Some(None)))
          .unwrap_or(false))
  };
  let permanent_ids: HashSet<&str> = nodes
    .iter()
    .filter(|n| is_permanent(n))
    .map(|n| n.id.as_str())
    .collect();

  // One-hop provenance protection via non-inferred edges.
  let mut provenance: HashSet<&str> = HashSet::new();
  for e in &edges {
    if e.confidence == "inferred" {
      continue;
    }
    if permanent_ids.contains(e.from.as_str()) {
      provenance.insert(e.to.as_str());
    }
    if permanent_ids.contains(e.to.as_str()) {
      provenance.insert(e.from.as_str());
    }
  }

  let access_cutoff = now - policy.protect_accessed_days * DAY_MS;

  // Pass 1: decide every node except `source`, which depends on its reports.
  let mut removed: HashSet<&str> = HashSet::new();
  let mut protected_count = 0i64;
  let mut within_window = 0i64;
  let mut deferred_sources: Vec<&Node> = Vec::new();

  for n in &nodes {
    if n.node_type == "source" {
      deferred_sources.push(n);
      continue;
    }
    match classify(
      n,
      policy,
      &item_retention,
      &activity,
      now,
      &permanent_ids,
      &provenance,
      access_cutoff,
    ) {
      Verdict::Protected => protected_count += 1,
      Verdict::WithinWindow => within_window += 1,
      Verdict::Expired => {
        removed.insert(n.id.as_str());
      }
    }
  }

  // Pass 2: a source survives while any surviving research_report cites it.
  for n in deferred_sources {
    let cited_by_survivor = edges.iter().any(|e| {
      let other = if e.from == n.id {
        Some(e.to.as_str())
      } else if e.to == n.id {
        Some(e.from.as_str())
      } else {
        None
      };
      other
        .and_then(|o| node_by_id.get(o))
        .map(|o| o.node_type == "research_report" && !removed.contains(o.id.as_str()))
        .unwrap_or(false)
    });
    if cited_by_survivor {
      within_window += 1;
      continue;
    }
    match classify(
      n,
      policy,
      &item_retention,
      &activity,
      now,
      &permanent_ids,
      &provenance,
      access_cutoff,
    ) {
      Verdict::Protected => protected_count += 1,
      Verdict::WithinWindow => within_window += 1,
      Verdict::Expired => {
        removed.insert(n.id.as_str());
      }
    }
  }

  report.protected_nodes = protected_count;
  report.within_window_nodes = within_window;

  // Edges: expired inferred edges, anything touching a removed node, and any
  // edge whose endpoint no longer exists (dangling).
  let inferred_cutoff = now - policy.inferred_edge_days * DAY_MS;
  let mut edge_ids: Vec<&str> = Vec::new();
  for e in &edges {
    let dangling =
      !node_by_id.contains_key(e.from.as_str()) || !node_by_id.contains_key(e.to.as_str());
    let touches_removed = removed.contains(e.from.as_str()) || removed.contains(e.to.as_str());
    let expired_inferred = e.confidence == "inferred" && e.activity() < inferred_cutoff;
    if dangling || touches_removed || expired_inferred {
      edge_ids.push(e.id.as_str());
    }
  }

  report.nodes_removed = removed.len() as i64;
  report.edges_removed = edge_ids.len() as i64;
  for id in &removed {
    if let Some(n) = node_by_id.get(id) {
      *report
        .removed_by_type
        .entry(n.node_type.clone())
        .or_insert(0) += 1;
    }
  }

  // Guard against a bad threshold or a clock problem.
  if !nodes.is_empty() && (removed.len() as f64) > (nodes.len() as f64) * policy.max_remove_fraction
  {
    report.aborted = true;
    report.abort_reason = Some(format!(
      "would remove {} of {} nodes (> {:.0}% guard)",
      removed.len(),
      nodes.len(),
      policy.max_remove_fraction * 100.0
    ));
    if !policy.dry_run {
      // Real run: report what it *would* have done, but delete nothing.
      report.nodes_removed = 0;
      report.edges_removed = 0;
      report.removed_by_type.clear();
    }
    return Ok(report);
  }

  if policy.dry_run {
    return Ok(report);
  }

  let tx = conn.transaction().map_err(|e| e.to_string())?;
  for id in &edge_ids {
    tx.execute("DELETE FROM memory_edges WHERE id = ?1", params![id])
      .map_err(|e| e.to_string())?;
  }
  for id in &removed {
    tx.execute("DELETE FROM memory_nodes WHERE id = ?1", params![id])
      .map_err(|e| e.to_string())?;
  }
  tx.commit().map_err(|e| e.to_string())?;
  Ok(report)
}

enum Verdict {
  Protected,
  WithinWindow,
  Expired,
}

#[allow(clippy::too_many_arguments)]
fn classify(
  n: &Node,
  policy: &PrunePolicy,
  item_retention: &Option<HashMap<&str, Option<i64>>>,
  activity: &HashMap<&str, i64>,
  now: i64,
  permanent_ids: &HashSet<&str>,
  provenance: &HashSet<&str>,
  access_cutoff: i64,
) -> Verdict {
  if permanent_ids.contains(n.id.as_str()) || provenance.contains(n.id.as_str()) {
    return Verdict::Protected;
  }
  if n
    .last_accessed_at
    .map(|t| t >= access_cutoff)
    .unwrap_or(false)
  {
    return Verdict::Protected;
  }

  let window_days: Option<i64> = if n.node_type == "memory_item" {
    match item_retention {
      // Caller could not list memory items: protect rather than guess.
      None => return Verdict::Protected,
      Some(map) => match map.get(n.ref_id.as_str()) {
        // Target no longer exists: orphan, prune now.
        None => return Verdict::Expired,
        Some(days) => *days,
      },
    }
  } else {
    policy.node_window_days.get(&n.node_type).copied()
  };

  let Some(days) = window_days else {
    return Verdict::Protected;
  };
  let last = activity.get(n.id.as_str()).copied().unwrap_or(n.created_at);
  if last < now - days * DAY_MS {
    Verdict::Expired
  } else {
    Verdict::WithinWindow
  }
}

#[tauri::command]
pub fn memory_graph_prune(
  app: tauri::AppHandle,
  policy: PrunePolicy,
) -> Result<PruneReport, String> {
  let (mut conn, _) = crate::memory_store::open_memory_db(&app)?;
  crate::memory_graph::ensure_memory_graph_tables(&conn)?;
  prune_graph_sql(&mut conn, &policy)
}

#[cfg(test)]
mod tests {
  use super::*;

  const NOW: i64 = 1_000 * DAY_MS;

  fn db() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory db");
    crate::memory_graph::ensure_memory_graph_tables(&conn).expect("tables");
    conn
  }

  fn node(conn: &Connection, ty: &str, r: &str, age_days: i64) -> String {
    let id = format!("{}:{}", ty, r);
    conn
      .execute(
        "INSERT INTO memory_nodes (id, node_type, ref_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, ty, r, NOW - age_days * DAY_MS],
      )
      .expect("node");
    id
  }

  fn edge(conn: &Connection, id: &str, from: &str, to: &str, conf: &str, age_days: i64) {
    conn
      .execute(
        "INSERT INTO memory_edges (id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at)
         VALUES (?1, ?2, ?3, 'related', ?4, 't', NULL, ?5)",
        params![id, from, to, conf, NOW - age_days * DAY_MS],
      )
      .expect("edge");
  }

  fn policy() -> PrunePolicy {
    PrunePolicy {
      node_window_days: [
        ("receipt".to_string(), 90),
        ("packet".to_string(), 90),
        ("boardroom_message".to_string(), 180),
        ("research_report".to_string(), 180),
        ("source".to_string(), 180),
      ]
      .into_iter()
      .collect(),
      memory_items: Some(vec![]),
      protected_ref_ids: vec![],
      inferred_edge_days: 30,
      protect_accessed_days: 14,
      max_remove_fraction: 0.99,
      dry_run: false,
      now_ms: Some(NOW),
    }
  }

  fn count(conn: &Connection, table: &str) -> i64 {
    conn
      .query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| r.get(0))
      .unwrap()
  }

  #[test]
  fn expired_receipt_is_removed_and_fresh_one_kept() {
    let mut conn = db();
    node(&conn, "receipt", "old", 200);
    node(&conn, "receipt", "new", 5);
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 1);
    assert_eq!(count(&conn, "memory_nodes"), 1);
  }

  #[test]
  fn permanent_memory_item_is_never_pruned() {
    let mut conn = db();
    node(&conn, "memory_item", "keep", 5000);
    let mut p = policy();
    p.memory_items = Some(vec![MemoryItemRetention {
      ref_id: "keep".into(),
      days: None,
    }]);
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 0);
    assert_eq!(r.protected_nodes, 1);
  }

  #[test]
  fn ephemeral_memory_item_expires_on_its_own_window() {
    let mut conn = db();
    node(&conn, "memory_item", "eph", 10);
    node(&conn, "memory_item", "std", 10);
    let mut p = policy();
    p.memory_items = Some(vec![
      MemoryItemRetention {
        ref_id: "eph".into(),
        days: Some(7),
      },
      MemoryItemRetention {
        ref_id: "std".into(),
        days: Some(180),
      },
    ]);
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 1);
    let left: String = conn
      .query_row("SELECT ref_id FROM memory_nodes", [], |r| r.get(0))
      .unwrap();
    assert_eq!(left, "std");
  }

  #[test]
  fn orphan_memory_item_is_removed_but_unknown_list_protects_everything() {
    let mut conn = db();
    node(&conn, "memory_item", "gone", 1);
    node(&conn, "receipt", "keeper-a", 1);
    node(&conn, "receipt", "keeper-b", 1);
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 1, "ref no longer exists -> orphan");

    let mut conn = db();
    node(&conn, "memory_item", "gone", 1);
    let mut p = policy();
    p.memory_items = None;
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 0, "no memory item list -> fail safe");
  }

  #[test]
  fn node_one_hop_from_permanent_via_manual_edge_is_protected() {
    let mut conn = db();
    let perm = node(&conn, "memory_item", "perm", 5000);
    let rec = node(&conn, "receipt", "r", 400);
    edge(&conn, "e1", &perm, &rec, "verified", 400);
    let mut p = policy();
    p.memory_items = Some(vec![MemoryItemRetention {
      ref_id: "perm".into(),
      days: None,
    }]);
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 0);
  }

  #[test]
  fn inferred_edge_does_not_grant_provenance_protection() {
    let mut conn = db();
    let perm = node(&conn, "memory_item", "perm", 5000);
    let rec = node(&conn, "receipt", "r", 400);
    edge(&conn, "e1", &perm, &rec, "inferred", 1);
    let mut p = policy();
    p.memory_items = Some(vec![MemoryItemRetention {
      ref_id: "perm".into(),
      days: None,
    }]);
    // The inferred edge is recent, so it also counts as activity on the receipt.
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(
      r.nodes_removed, 0,
      "recent edge activity keeps the receipt within its window"
    );
    // Age the edge past both windows: receipt is now expirable.
    conn
      .execute(
        "UPDATE memory_edges SET created_at = ?1",
        params![NOW - 400 * DAY_MS],
      )
      .unwrap();
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 1);
  }

  #[test]
  fn expired_inferred_edge_removed_manual_edge_kept() {
    let mut conn = db();
    let a = node(&conn, "receipt", "a", 5);
    let b = node(&conn, "receipt", "b", 5);
    edge(&conn, "inf", &a, &b, "inferred", 40);
    edge(&conn, "man", &a, &b, "verified", 400);
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.edges_removed, 1);
    let left: String = conn
      .query_row("SELECT id FROM memory_edges", [], |r| r.get(0))
      .unwrap();
    assert_eq!(left, "man");
  }

  #[test]
  fn reconfirmed_inferred_edge_survives() {
    let mut conn = db();
    let a = node(&conn, "receipt", "a", 5);
    let b = node(&conn, "receipt", "b", 5);
    edge(&conn, "inf", &a, &b, "inferred", 40);
    conn
      .execute(
        "UPDATE memory_edges SET last_seen_at = ?1",
        params![NOW - 2 * DAY_MS],
      )
      .unwrap();
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.edges_removed, 0);
  }

  #[test]
  fn edge_reconfirmation_resets_node_window() {
    let mut conn = db();
    let a = node(&conn, "receipt", "a", 200);
    let b = node(&conn, "receipt", "b", 200);
    edge(&conn, "inf", &a, &b, "inferred", 200);
    conn
      .execute(
        "UPDATE memory_edges SET last_seen_at = ?1",
        params![NOW - DAY_MS],
      )
      .unwrap();
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(
      r.nodes_removed, 0,
      "recent re-confirmation resets the 90d window"
    );
  }

  #[test]
  fn removing_a_node_removes_its_edges_and_leaves_no_dangling() {
    let mut conn = db();
    let old = node(&conn, "receipt", "old", 400);
    let new = node(&conn, "receipt", "new", 1);
    edge(&conn, "e", &old, &new, "verified", 400);
    // activity: the edge is old, so `old` expires; `new` keeps its own age.
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 1);
    assert_eq!(count(&conn, "memory_edges"), 0);
  }

  #[test]
  fn pre_existing_dangling_edge_is_cleaned() {
    let mut conn = db();
    let a = node(&conn, "receipt", "a", 1);
    edge(&conn, "d", &a, "receipt:missing", "verified", 1);
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.edges_removed, 1);
  }

  #[test]
  fn source_survives_while_a_surviving_report_cites_it() {
    let mut conn = db();
    let rep = node(&conn, "research_report", "rep", 5);
    let src = node(&conn, "source", "s", 400);
    edge(&conn, "e", &rep, &src, "verified", 400);
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 0);
  }

  #[test]
  fn source_goes_with_an_expired_report() {
    let mut conn = db();
    let rep = node(&conn, "research_report", "rep", 400);
    let src = node(&conn, "source", "s", 400);
    edge(&conn, "e", &rep, &src, "verified", 400);
    for k in ["a", "b", "c", "d"] {
      node(&conn, "receipt", k, 1);
    }
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 2);
    assert_eq!(count(&conn, "memory_nodes"), 4);
  }

  #[test]
  fn recently_accessed_node_is_protected() {
    let mut conn = db();
    let id = node(&conn, "receipt", "r", 400);
    node(&conn, "receipt", "keeper-a", 1);
    node(&conn, "receipt", "keeper-b", 1);
    conn
      .execute(
        "UPDATE memory_nodes SET last_accessed_at = ?1 WHERE id = ?2",
        params![NOW - 3 * DAY_MS, id],
      )
      .unwrap();
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(r.nodes_removed, 0);
    conn
      .execute(
        "UPDATE memory_nodes SET last_accessed_at = ?1",
        params![NOW - 30 * DAY_MS],
      )
      .unwrap();
    let r = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(
      r.nodes_removed, 1,
      "access older than the window no longer protects"
    );
  }

  #[test]
  fn explicitly_protected_ref_is_never_pruned() {
    let mut conn = db();
    node(&conn, "boardroom_message", "esc", 900);
    let mut p = policy();
    p.protected_ref_ids = vec!["esc".into()];
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert_eq!(r.nodes_removed, 0);
  }

  #[test]
  fn dry_run_reports_but_deletes_nothing() {
    let mut conn = db();
    let a = node(&conn, "receipt", "old", 400);
    node(&conn, "receipt", "new", 1);
    let b = node(&conn, "receipt", "other", 1);
    edge(&conn, "e", &a, &b, "verified", 400);
    let mut p = policy();
    p.dry_run = true;
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert!(r.dry_run);
    assert_eq!(r.nodes_removed, 1);
    assert_eq!(r.edges_removed, 1);
    assert_eq!(count(&conn, "memory_nodes"), 3);
    assert_eq!(count(&conn, "memory_edges"), 1);
  }

  #[test]
  fn guard_aborts_when_more_than_half_would_go() {
    let mut conn = db();
    node(&conn, "receipt", "a", 400);
    node(&conn, "receipt", "b", 400);
    node(&conn, "receipt", "c", 1);
    let mut p = policy();
    p.max_remove_fraction = 0.5;
    let r = prune_graph_sql(&mut conn, &p).unwrap();
    assert!(r.aborted);
    assert_eq!(r.nodes_removed, 0);
    assert_eq!(count(&conn, "memory_nodes"), 3, "nothing deleted on abort");
  }

  #[test]
  fn second_run_is_idempotent() {
    let mut conn = db();
    node(&conn, "receipt", "old", 400);
    node(&conn, "receipt", "new", 1);
    node(&conn, "receipt", "new2", 1);
    let first = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(first.nodes_removed, 1);
    let second = prune_graph_sql(&mut conn, &policy()).unwrap();
    assert_eq!(second.nodes_removed, 0);
    assert_eq!(second.edges_removed, 0);
  }

  #[test]
  fn traversal_still_terminates_after_a_prune() {
    let mut conn = db();
    let a = node(&conn, "receipt", "a", 1);
    let b = node(&conn, "receipt", "b", 1);
    node(&conn, "receipt", "old", 400);
    edge(&conn, "ab", &a, &b, "verified", 1);
    edge(&conn, "ba", &b, &a, "verified", 1);
    prune_graph_sql(&mut conn, &policy()).unwrap();
    let rows = crate::memory_graph::query_related_deep_sql(&conn, &a, 5, "both").unwrap();
    assert!(!rows.is_empty());
  }

  #[test]
  fn touch_is_throttled_to_once_per_hour() {
    let conn = db();
    let id = node(&conn, "receipt", "r", 1);
    crate::memory_graph::touch_nodes_sql(&conn, std::slice::from_ref(&id), NOW).unwrap();
    crate::memory_graph::touch_nodes_sql(&conn, std::slice::from_ref(&id), NOW + 60_000).unwrap();
    let t: i64 = conn
      .query_row(
        "SELECT last_accessed_at FROM memory_nodes WHERE id = ?1",
        params![id],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(t, NOW, "second touch inside the hour must not rewrite");
    crate::memory_graph::touch_nodes_sql(&conn, std::slice::from_ref(&id), NOW + 2 * 3_600_000)
      .unwrap();
    let t: i64 = conn
      .query_row(
        "SELECT last_accessed_at FROM memory_nodes WHERE id = ?1",
        params![id],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(t, NOW + 2 * 3_600_000);
  }

  #[test]
  fn schema_migration_adds_columns_to_an_old_database() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        "CREATE TABLE memory_nodes (id TEXT PRIMARY KEY, node_type TEXT NOT NULL, ref_id TEXT NOT NULL, created_at INTEGER NOT NULL);
         CREATE TABLE memory_edges (id TEXT PRIMARY KEY, from_node_id TEXT NOT NULL, to_node_id TEXT NOT NULL, edge_type TEXT NOT NULL, confidence TEXT NOT NULL, created_by TEXT NOT NULL, created_event TEXT, created_at INTEGER NOT NULL);",
      )
      .unwrap();
    crate::memory_graph::ensure_memory_graph_tables(&conn).unwrap();
    crate::memory_graph::ensure_memory_graph_tables(&conn).unwrap(); // idempotent
    conn
      .execute("SELECT last_accessed_at FROM memory_nodes", [])
      .ok();
    conn
      .prepare("SELECT last_accessed_at FROM memory_nodes")
      .unwrap();
    conn
      .prepare("SELECT last_seen_at FROM memory_edges")
      .unwrap();
  }
}
