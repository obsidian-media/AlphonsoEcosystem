# Memory Knowledge Graph — Inferred Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated, structural edge-suggestion to the memory knowledge graph — the last deferred piece of the project (Phases 1, 2, and the visual viewer are already merged to `main`).

**Architecture:** One atomic Rust primitive (`memory_graph_infer_edges`) runs two SQL link-prediction signals (common-neighbor, shared-`created_event`) scoped to a caller-given node list, dedupes against existing edges, and writes survivors with `confidence: 'inferred'`. Three TS callers (per-write fire-and-forget, a 30-min scheduler, and a viewer button) invoke the same primitive with different scope/caps — no per-trigger reimplementation.

**Tech Stack:** Rust (`rusqlite`, existing `memory_graph.rs` conventions), TypeScript (`memoryGraphService.ts`, existing Tauri `invoke` wrapper pattern), React (`MemoryGraphViewer.tsx`, `react-force-graph-3d`), Vitest, `cargo test`.

Full design rationale: `docs/superpowers/specs/2026-09-04-memory-knowledge-graph-inferred-edges-design.md`.

---

### Task 1: Rust — `infer_edges_sql` core function + Tauri command

**Files:**
- Modify: `src-tauri/src/memory_graph.rs` (append after `memory_graph_list_edges`, i.e. after line 325, before the `#[cfg(test)]` block at line 327)
- Modify: `src-tauri/src/lib.rs:93-96` (add to the `pub(crate) use memory_graph::{...}` block) and `src-tauri/src/lib.rs:740-745` (add to `invoke_handler`)
- Test: `src-tauri/src/memory_graph.rs`'s own `#[cfg(test)] mod tests` block (append after the last test, `list_edges_respects_limit_and_orders_newest_first`, before the closing `}` at line 623)

This file already separates a plain, `&Connection`-taking, directly-testable
function (`query_related_deep_sql`) from its thin `#[tauri::command]` wrapper
(`memory_graph_query_related_deep`) — Tauri commands take an `AppHandle` and
can't be unit-tested without one, so the real logic lives in a plain
function instead. This task follows that exact pattern: `infer_edges_sql`
does all the work against a `&mut Connection` (transactions need
mutability), and `memory_graph_infer_edges` is a thin wrapper that opens the
db and delegates.

- [ ] **Step 1: Write the failing Rust tests**

Add to the end of `mod tests` in `src-tauri/src/memory_graph.rs` (before its
closing `}`):

```rust
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
    assert_eq!(created.len(), 1, "should suggest exactly the A-C common-neighbor pair");
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
    let pair = (created[0].from_node_id.clone(), created[0].to_node_id.clone());
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
    assert_eq!(created.len(), 0, "NULL created_event must never match another NULL");
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
    assert_eq!(created.len(), 0, "A-C already connected (as C-A), should not be re-suggested");
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
    // Hub node "M" connects to 5 leaves; each pair of leaves becomes a
    // common-neighbor candidate via M -- 10 possible pairs from 5 leaves.
    for (i, leaf) in ["L1", "L2", "L3", "L4", "L5"].iter().enumerate() {
      seed_edge(&conn, &format!("e-{}", i), "M", leaf, None);
    }

    let created = infer_edges_sql(&mut conn, &["M".to_string()], 3).expect("infer");
    assert_eq!(created.len(), 3, "cap of 3 must be respected even though more candidates exist");
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
    assert_eq!(created.len(), 0, "scope Z shares no edges with the A-B-C chain");
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
    assert_eq!(count, 1, "the suggested edge must actually be committed to the table");
  }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test memory_graph::tests::infer_edges -- --nocapture`
Expected: FAIL with `cannot find function 'infer_edges_sql' in this scope` (it doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Add to `src-tauri/src/memory_graph.rs`, after `memory_graph_list_edges` (after
line 325), before the `#[cfg(test)]` block:

```rust
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test memory_graph::tests::infer_edges -- --nocapture`
Expected: all 8 new tests PASS.

- [ ] **Step 5: Register the new command**

Modify `src-tauri/src/lib.rs:93-96`, from:

```rust
pub(crate) use memory_graph::{
  memory_graph_add_edge, memory_graph_add_node, memory_graph_list_edges, memory_graph_list_nodes,
  memory_graph_query_related, memory_graph_query_related_deep,
};
```

to:

```rust
pub(crate) use memory_graph::{
  memory_graph_add_edge, memory_graph_add_node, memory_graph_infer_edges, memory_graph_list_edges,
  memory_graph_list_nodes, memory_graph_query_related, memory_graph_query_related_deep,
};
```

Modify `src-tauri/src/lib.rs:740-745`, from:

```rust
      memory_graph_add_node,
      memory_graph_add_edge,
      memory_graph_query_related,
      memory_graph_query_related_deep,
      memory_graph_list_nodes,
      memory_graph_list_edges,
```

to:

```rust
      memory_graph_add_node,
      memory_graph_add_edge,
      memory_graph_query_related,
      memory_graph_query_related_deep,
      memory_graph_list_nodes,
      memory_graph_list_edges,
      memory_graph_infer_edges,
```

- [ ] **Step 6: Verify the whole crate still compiles and lints clean**

Run: `cd src-tauri && cargo check && cargo fmt --all -- --check && cargo clippy -- -D warnings`
Expected: all three succeed with no errors/warnings. If `cargo fmt` reports a
diff, run `cargo fmt --all` and re-check.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat: add memory_graph_infer_edges Rust command (structural link prediction)"
```

---

### Task 2: TS — `inferEdges()` export in `memoryGraphService.ts`

**Files:**
- Modify: `src/services/memoryGraphService.ts`
- Test: `src/test/services/memoryGraphService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/services/memoryGraphService.test.ts`, inside the top-level
`describe('memoryGraphService', ...)` block, after the `listAllEdges` describe
block (before its closing `});` at the end of the file):

```ts
  describe('inferEdges', () => {
    it('calls the backend with scope and max suggestions, and returns the created edges', async () => {
      const edges = [{
        id: 'edge-inf-1', fromNodeId: 'A', toNodeId: 'C', edgeType: 'related',
        confidence: 'inferred', createdBy: 'system:inference', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A', 'B'], 5);
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['A', 'B'],
        maxSuggestions: 5
      });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A'], 5);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { inferEdges } = await import('../../services/memoryGraphService');
      const result = await inferEdges(['A'], 5);
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: FAIL — `inferEdges` is not exported from `memoryGraphService.ts`.

- [ ] **Step 3: Write the implementation**

Add to `src/services/memoryGraphService.ts`, after `listAllEdges` (the last
function in the file):

```ts
/**
 * Runs one bounded structural-inference pass (common-neighbor + shared-event
 * link prediction, computed entirely server-side in Rust) scoped to the
 * given node ids, and returns whatever new edges it created. Every created
 * edge carries confidence: 'inferred' -- callers never need to guess which
 * edges came from this vs. a manual write. Fail-soft like every other
 * function in this file: returns [] instead of throwing.
 */
export async function inferEdges(scopeNodeIds: string[], maxSuggestions: number): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_infer_edges', {
      scopeNodeIds,
      maxSuggestions
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: all tests PASS (the 3 new ones plus the pre-existing ones,
unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/services/memoryGraphService.ts src/test/services/memoryGraphService.test.ts
git commit -m "feat: add inferEdges() export to memoryGraphService.ts"
```

---

### Task 3: TS — wire `addNode`/`addEdge` to trigger inference on write

**Files:**
- Modify: `src/services/memoryGraphService.ts`
- Test: `src/test/services/memoryGraphService.test.ts`

`addNode`/`addEdge` currently `return await invoke(...)` directly inside a
try/catch. To fire `inferEdges` only on success (never on failure, and never
blocking the caller), each needs to capture the result, conditionally kick
off `inferEdges` without awaiting it, then return the captured result.

`addEdge`'s docstring currently says *"Phase 1 is manual-only... no
inference happens here"* — this becomes false the moment this task ships,
so it must be corrected, not left stale.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/services/memoryGraphService.test.ts`, inside the
`describe('addNode', ...)` block, after its existing 2 tests:

```ts
    it('fires a scoped, capped inference pass after a successful add, without blocking the return', async () => {
      invoke.mockResolvedValue('memory_item:mem-1');
      const { addNode } = await import('../../services/memoryGraphService');
      await addNode('memory_item', 'mem-1');
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['memory_item:mem-1'],
        maxSuggestions: 5
      });
    });

    it('does not fire inference when the add itself failed', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addNode } = await import('../../services/memoryGraphService');
      await addNode('memory_item', 'mem-1');
      expect(invoke).not.toHaveBeenCalledWith('memory_graph_infer_edges', expect.anything());
    });
```

Append to the `describe('addEdge', ...)` block, after its existing 3 tests:

```ts
    it('fires a scoped, capped inference pass covering both endpoints after a successful add', async () => {
      invoke.mockResolvedValue('edge-999');
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('memory_item:mem-1', 'memory_item:mem-2', 'mentions', {
        confidence: 'user_confirmed',
        createdBy: 'echo'
      });
      expect(invoke).toHaveBeenCalledWith('memory_graph_infer_edges', {
        scopeNodeIds: ['memory_item:mem-1', 'memory_item:mem-2'],
        maxSuggestions: 5
      });
    });

    it('does not fire inference when the add itself failed', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(invoke).not.toHaveBeenCalledWith('memory_graph_infer_edges', expect.anything());
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: the 4 new tests FAIL (`memory_graph_infer_edges` was never called
— `addNode`/`addEdge` don't trigger it yet).

- [ ] **Step 3: Write the implementation**

In `src/services/memoryGraphService.ts`, replace the `addNode` function body:

```ts
export async function addNode(nodeType: string, refId: string): Promise<string | null> {
  try {
    const nodeId = await invoke<string>('memory_graph_add_node', { nodeType, refId });
    if (nodeId) {
      inferEdges([nodeId], 5).catch(() => {});
    }
    return nodeId;
  } catch {
    return null;
  }
}
```

Replace `addEdge`'s docstring and body (both the stale comment and the
function need to change):

```ts
/**
 * Records a typed, directed edge between two already-known node ids.
 * On success, also fires a small scoped structural-inference pass covering
 * both endpoints (see inferEdges) -- fire-and-forget, never blocks the
 * caller or affects this function's return value.
 */
export async function addEdge(
  fromNodeId: string,
  toNodeId: string,
  edgeType: string,
  opts: AddEdgeOptions
): Promise<string | null> {
  try {
    const edgeId = await invoke<string>('memory_graph_add_edge', {
      fromNodeId,
      toNodeId,
      edgeType,
      confidence: opts.confidence,
      createdBy: opts.createdBy,
      createdEvent: opts.createdEvent ?? null
    });
    if (edgeId) {
      inferEdges([fromNodeId, toNodeId], 5).catch(() => {});
    }
    return edgeId;
  } catch {
    return null;
  }
}
```

Note: `inferEdges` is defined later in the same file (after `listAllEdges`,
per Task 2) — this is fine in JS/TS since function declarations (not
expressions) are hoisted, and `inferEdges` is declared with `export async
function`, a hoisted declaration form.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: all tests PASS, including every pre-existing test (they assert
`toHaveBeenCalledWith` on the primary command, which still holds true
alongside the new secondary `inferEdges` call).

- [ ] **Step 5: Commit**

```bash
git add src/services/memoryGraphService.ts src/test/services/memoryGraphService.test.ts
git commit -m "feat: wire addNode/addEdge to trigger scoped inference on successful write"
```

---

### Task 4: TS — `memoryGraphInferenceService.ts` scheduler

**Files:**
- Create: `src/services/memoryGraphInferenceService.ts`
- Test: `src/test/memoryGraphInferenceService.test.ts`

Mirrors `src/services/echoFileWatcherService.ts`'s exact module-level-interval
pattern (`startFileWatcher`/`stopFileWatcher`), not `sentinelSecurityService`'s
closure-returning `startScheduledScans` — confirmed as the closer match
during the design's self-review.

- [ ] **Step 1: Write the failing tests**

Create `src/test/memoryGraphInferenceService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  inferEdges: vi.fn()
}));

import { listAllNodes, inferEdges } from '../services/memoryGraphService';
import {
  runScheduledInferencePass,
  startMemoryGraphInferenceScheduler,
  stopMemoryGraphInferenceScheduler
} from '../services/memoryGraphInferenceService';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  stopMemoryGraphInferenceScheduler();
  vi.useRealTimers();
});

describe('runScheduledInferencePass', () => {
  it('does nothing when there are no nodes', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    await runScheduledInferencePass();
    expect(inferEdges).not.toHaveBeenCalled();
  });

  it('calls inferEdges with a batch capped at 20 node ids and cap 20', async () => {
    const nodes = Array.from({ length: 30 }, (_, i) => ({
      id: `node-${i}`,
      nodeType: 'memory_item',
      refId: `${i}`,
      createdAtMs: i
    }));
    vi.mocked(listAllNodes).mockResolvedValue(nodes);
    vi.mocked(inferEdges).mockResolvedValue([]);

    await runScheduledInferencePass();

    expect(inferEdges).toHaveBeenCalledTimes(1);
    const [scopeArg, capArg] = vi.mocked(inferEdges).mock.calls[0];
    expect(scopeArg).toHaveLength(20);
    expect(capArg).toBe(20);
    for (const id of scopeArg) {
      expect(nodes.some((n) => n.id === id)).toBe(true);
    }
  });

  it('fetches all 500 nodes to sample from', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    await runScheduledInferencePass();
    expect(listAllNodes).toHaveBeenCalledWith(500);
  });
});

describe('startMemoryGraphInferenceScheduler / stopMemoryGraphInferenceScheduler', () => {
  it('does not throw when stopped without starting', () => {
    expect(() => stopMemoryGraphInferenceScheduler()).not.toThrow();
  });

  it('runs a pass on the configured interval', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(2);
  });

  it('does not schedule a second interval if already running', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    startMemoryGraphInferenceScheduler(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
  });

  it('stops firing after stopMemoryGraphInferenceScheduler', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler(1000);
    stopMemoryGraphInferenceScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(listAllNodes).not.toHaveBeenCalled();
  });

  it('defaults to a 30-minute interval when none is given', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    startMemoryGraphInferenceScheduler();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 - 1);
    expect(listAllNodes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(listAllNodes).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/memoryGraphInferenceService.test.ts`
Expected: FAIL — `src/services/memoryGraphInferenceService.ts` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `src/services/memoryGraphInferenceService.ts`:

```ts
import { listAllNodes, inferEdges } from './memoryGraphService';

const SCHEDULED_BATCH_SIZE = 20;
const SCHEDULED_MAX_SUGGESTIONS = 20;
const NODE_SAMPLE_POOL = 500;
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * One scheduled inference pass: samples a random batch of nodes from the
 * graph (no "already processed" tracking -- the simplest thing that keeps
 * this bounded without new bookkeeping) and runs the shared inferEdges
 * primitive against them.
 */
export async function runScheduledInferencePass(): Promise<void> {
  const nodes = await listAllNodes(NODE_SAMPLE_POOL);
  if (nodes.length === 0) return;

  const shuffled = [...nodes].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, SCHEDULED_BATCH_SIZE).map((n) => n.id);
  await inferEdges(batch, SCHEDULED_MAX_SUGGESTIONS);
}

let _inferenceInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the recurring inference pass. Idempotent -- calling this while
 * already running is a no-op, matching echoFileWatcherService's
 * start/stop-pair convention.
 */
export function startMemoryGraphInferenceScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (_inferenceInterval !== null) return;
  _inferenceInterval = setInterval(() => {
    runScheduledInferencePass().catch(() => {});
  }, intervalMs);
}

export function stopMemoryGraphInferenceScheduler(): void {
  if (_inferenceInterval !== null) {
    clearInterval(_inferenceInterval);
    _inferenceInterval = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/memoryGraphInferenceService.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/memoryGraphInferenceService.ts src/test/memoryGraphInferenceService.test.ts
git commit -m "feat: add memoryGraphInferenceService.ts scheduled inference scheduler"
```

---

### Task 5: TS — wire the scheduler at boot in `App.tsx`

**Files:**
- Modify: `src/App.tsx:438-459` (the Echo file watcher boot-effect block, this
  task's new effect goes immediately after it)
- Test: none new — this is a boot-wiring change exercised indirectly by the
  existing `appLazyImports.test.js`-style static checks and manually verified
  in Step 3 below; matching how the identical `startFileWatcher` wiring
  itself has no dedicated App.tsx-level test.

- [ ] **Step 1: Confirm the exact current block**

Read `src/App.tsx` lines 438-459 and confirm it still matches:

```tsx
  // Echo file watcher background service
  useEffect(() => {
    let watcherStop: (() => void) | null = null;
    (async () => {
      try {
        const { startFileWatcher, getWatcherConfig } = await import('./services/echoFileWatcherService');
        const config = getWatcherConfig();
        if (config?.enabled && config?.inboxPath) {
          watcherStop = startFileWatcher((result) => {
            if (result?.ingested > 0) {
              addNotification({
                type: 'success',
                title: 'Echo auto-ingest',
                message: `${result.ingested} file(s) ingested from inbox.`
              });
            }
          });
        }
      } catch { /* non-critical */ }
    })();
    return () => { try { watcherStop?.(); } catch { /* ignore */ } };
  }, []);
```

If the surrounding line numbers have shifted (later merges may have added
code above this block), locate it by searching for the comment `// Echo file
watcher background service` instead of trusting the line numbers literally.

- [ ] **Step 2: Add the new boot effect immediately after it**

Insert directly after the closing `}, []);` of the block above:

```tsx

  // Memory graph inference scheduler
  useEffect(() => {
    (async () => {
      try {
        const { startMemoryGraphInferenceScheduler } = await import('./services/memoryGraphInferenceService');
        startMemoryGraphInferenceScheduler();
      } catch { /* non-critical */ }
    })();
    return () => {
      (async () => {
        try {
          const { stopMemoryGraphInferenceScheduler } = await import('./services/memoryGraphInferenceService');
          stopMemoryGraphInferenceScheduler();
        } catch { /* ignore */ }
      })();
    };
  }, []);
```

This intentionally does not surface a notification on new inferred edges
(unlike the Echo watcher's ingest toast) -- inferred edges are a background
enrichment, not something requiring the user's attention the moment they
appear; they're visible next time the memory graph viewer is opened.

- [ ] **Step 3: Manually verify the app still boots cleanly**

Run: `npm run dev` (or `npm run tauri dev` if Rust changes from Task 1 need
exercising together), open the app, and confirm no new console errors appear
on boot. Stop the dev server afterward.

- [ ] **Step 4: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: start the memory graph inference scheduler at boot"
```

---

### Task 6: TS — `MemoryGraphViewer.tsx`: link coloring + "Suggest connections" button

**Files:**
- Modify: `src/components/MemoryGraphViewer.tsx`
- Test: `src/test/memoryGraphViewer.test.tsx`

`trustColor()` (from `trustModel.ts`) returns Tailwind color-family names
(e.g. `'blue'`, `'amber'`, `'zinc'`) meant for the `Badge` UI component's
`color` prop — **not** literal CSS/WebGL colors. `'amber'` and `'zinc'` are
not valid CSS/THREE.js color keywords, so passing `trustColor()`'s output
directly into `react-force-graph-3d`'s `linkColor` prop would silently
render wrong. This task adds a small local hex-mapping layer (matching the
file's own existing `NODE_TYPE_COLORS`/`colorForNodeType` convention for
node colors) that translates `trustColor()`'s semantic family name into an
actual hex value — reusing `trustColor()` for the trust *classification*,
translating only for the renderer.

- [ ] **Step 1: Write the failing tests**

First, update the module mock at the top of
`src/test/memoryGraphViewer.test.tsx` (the existing `vi.mock('../services/memoryGraphService', ...)`
block only exports 3 functions; the new button needs a 4th):

Replace:

```ts
vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn()
}));

import { listAllNodes, listAllEdges, queryRelated } from '../services/memoryGraphService';
```

with:

```ts
vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn(),
  inferEdges: vi.fn()
}));

import { listAllNodes, listAllEdges, queryRelated, inferEdges } from '../services/memoryGraphService';
```

Then append these tests inside the `describe('MemoryGraphViewer', ...)`
block, after the last existing test (`'selects the other node when a listed
connection is clicked...'`), before the block's closing `});`:

```ts
  it('colors links by confidence via trustColor, with a fallback for unmapped confidence values', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 100 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());
    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    expect(typeof props.linkColor).toBe('function');
    // verified: inferred, amber: pending, and an unknown value should each resolve
    // to a distinct, real hex color (never a bare Tailwind family name like 'amber').
    const verifiedColor = props.linkColor({ confidence: 'verified' });
    const inferredColor = props.linkColor({ confidence: 'inferred' });
    const unknownColor = props.linkColor({ confidence: 'not-a-real-state' });
    expect(verifiedColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(inferredColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(unknownColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(verifiedColor).not.toBe(inferredColor);
  });

  it('shows a "Suggest connections" button that runs inference over the currently-loaded nodes and reports the result', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(inferEdges).mockResolvedValue([
      { id: 'edge-inf-1', fromNodeId: 'memory_item:a', toNodeId: 'memory_item:b', edgeType: 'related', confidence: 'inferred', createdBy: 'system:inference', createdEvent: null, createdAtMs: 300 }
    ]);

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(listAllNodes).toHaveBeenCalled());

    const button = await screen.findByRole('button', { name: /suggest connections/i });
    button.click();

    await waitFor(() => expect(inferEdges).toHaveBeenCalledWith(
      ['memory_item:a', 'memory_item:b'],
      50
    ));
    // 0 new edges is a valid, non-error outcome that must also be surfaced --
    // the second wave of listAllEdges (from the refetch) plus the initial
    // mount means this is called at least twice by the time the count shows.
    expect(await screen.findByText(/1 new connection/i)).toBeInTheDocument();
    expect(listAllEdges).toHaveBeenCalledTimes(2);
  });

  it('reports zero found connections as a real, non-error result rather than showing nothing', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(inferEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(listAllNodes).toHaveBeenCalled());

    const button = await screen.findByRole('button', { name: /suggest connections/i });
    button.click();

    expect(await screen.findByText(/no new connections/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: the 3 new tests FAIL (no `linkColor` prop, no "Suggest
connections" button exist yet). The pre-existing tests should still PASS
(the mock now includes `inferEdges: vi.fn()`, which defaults to returning
`undefined` when unmocked in a given test — harmless since nothing in those
tests triggers a call to it).

- [ ] **Step 3: Write the implementation**

In `src/components/MemoryGraphViewer.tsx`, add the import and hex-mapping
helper near the top (after the existing imports and `NODE_TYPE_COLORS`
block, i.e. after line 20's `colorForNodeType` function):

```tsx
import { listAllNodes, listAllEdges, queryRelated, inferEdges, type GraphNode, type GraphEdge } from '../services/memoryGraphService';
import { trustColor } from '../services/trustModel';
```

(replacing the existing single-line import that only pulls in
`listAllNodes, listAllEdges, queryRelated, type GraphNode, type GraphEdge`).

After `colorForNodeType` (after line 20), add:

```tsx
// trustColor() returns a Tailwind color-*family* name (e.g. 'blue', 'amber')
// meant for the Badge component's `color` prop -- not a literal CSS/WebGL
// color. 'amber' and 'zinc' aren't valid CSS/THREE.js color keywords, so
// this maps trustColor()'s semantic classification to an actual hex value
// for the 3D renderer, the same way NODE_TYPE_COLORS does for nodes.
const TRUST_FAMILY_HEX: Record<string, string> = {
  green: '#22c55e',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  zinc: '#71717a',
  indigo: '#6366f1'
};

function colorForConfidence(confidence: string): string {
  return TRUST_FAMILY_HEX[trustColor(confidence)] || TRUST_FAMILY_HEX.zinc;
}
```

Add state for the suggest-connections flow, inside the component function
(after the existing `connections` state declared at line 78, before the
`useEffect` that depends on `selectedNode`):

```tsx
  const [suggesting, setSuggesting] = useState(false);
  const [suggestResult, setSuggestResult] = useState<number | null>(null);

  async function handleSuggestConnections() {
    setSuggesting(true);
    setSuggestResult(null);
    try {
      const nodeIds = nodes.map((n) => n.id);
      const created = await inferEdges(nodeIds, 50);
      setSuggestResult(created.length);
      const refreshedEdges = await listAllEdges(EDGE_LIMIT);
      setEdges(refreshedEdges);
    } finally {
      setSuggesting(false);
    }
  }
```

Modify the `<ForceGraph3D>` element (around line 111-116) to add `linkColor`:

```tsx
        <ForceGraph3D
          graphData={graphData}
          height={height}
          nodeColor={(node: ForceGraphNode) => colorForNodeType(node.nodeType)}
          linkColor={(link: ForceGraphLink) => colorForConfidence(link.confidence)}
          onNodeClick={(node: ForceGraphNode) => setSelectedNode(node)}
        />
```

Add the button + result text just above the outer returned `<div>` (replace
the `return (` block's opening, right after the `const height = ...` line
and before the current `return (`):

```tsx
  return (
    <div className={size === 'full' ? 'h-full flex flex-col gap-2' : 'flex flex-col gap-2'}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSuggestConnections}
          disabled={suggesting}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] disabled:opacity-50"
        >
          {suggesting ? 'Suggesting…' : 'Suggest connections'}
        </button>
        {suggestResult !== null && (
          <span className="text-xs text-[var(--text-3)]">
            {suggestResult === 0
              ? 'No new connections found.'
              : `${suggestResult} new connection${suggestResult === 1 ? '' : 's'} found.`}
          </span>
        )}
      </div>
      <div className={size === 'full' ? 'flex-1 w-full flex gap-4' : 'h-60 w-full flex gap-4'}>
```

This wraps the existing inner `<div className={size === 'full' ? 'h-full
w-full flex gap-4' : 'h-60 w-full flex gap-4'}>` element in a new outer
container, so the component's closing tags need one extra `</div>`. The
file's current final 4 lines are exactly:

```tsx
      )}
    </div>
  );
}
```

Change them to:

```tsx
      )}
    </div>
  </div>
  );
}
```

(The new `</div>` closes the new outer wrapper added above; the `</div>`
above it is the pre-existing one that already closed the original outer
container and is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: all tests PASS, including every pre-existing test.

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/MemoryGraphViewer.tsx src/test/memoryGraphViewer.test.tsx
git commit -m "feat: color graph links by confidence, add Suggest connections button"
```

---

### Task 7: Documentation + final verification

**Files:**
- Modify: `CLAUDE.md` (the "Do Not Duplicate" table)
- Modify: `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md` (mark Phase 3's inferred-edge half as closed in the roadmap section, matching how prior phases were marked complete)

- [ ] **Step 1: Add a "Do Not Duplicate" row**

`npm run verify:dnd-coverage` fails CI if a new `src/services/*.ts` file has
no matching row in `CLAUDE.md`'s "Do Not Duplicate" table. Add a new row
(alphabetically near the other "Memory graph..." rows, next to the existing
"Memory graph visual viewer" row):

```markdown
| Memory graph inferred-edge scheduler | `src/services/memoryGraphInferenceService.ts` — `startMemoryGraphInferenceScheduler`/`stopMemoryGraphInferenceScheduler`, wired at `App.tsx` boot next to `startFileWatcher`. Runs `memoryGraphService.ts`'s `inferEdges()` (backed by the Rust `memory_graph_infer_edges` command — structural common-neighbor + shared-`created_event` link prediction, no content inspection) over a random 20-node batch every 30 min. The same `inferEdges()` primitive is also called fire-and-forget from `addNode`/`addEdge` on every successful write (scoped to just the touched nodes, cap 5) and from a "Suggest connections" button in `MemoryGraphViewer.tsx` (scoped to the currently-loaded graph, cap 50) — one bounded primitive, three callers, not three separate implementations. |
```

- [ ] **Step 2: Update the roadmap doc**

In `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md`,
find the `**Phase 3 — Intelligence & Visualization**` roadmap entry and
append a note (matching how other completed items in this repo's docs are
annotated, e.g. a `**CLOSED**` marker with a one-line pointer) confirming
the inferred-edges half is done, pointing to
`docs/superpowers/specs/2026-09-04-memory-knowledge-graph-inferred-edges-design.md`.

- [ ] **Step 3: Run the full targeted test suite**

Run:
```bash
npx vitest run src/test/services/memoryGraphService.test.ts src/test/memoryGraphInferenceService.test.ts src/test/memoryGraphViewer.test.tsx src/test/ui/Modal.test.tsx
```
Expected: all PASS.

Run: `cd src-tauri && cargo test memory_graph:: -- --nocapture`
Expected: all PASS (12 pre-existing + 8 new = 20 tests in this module).

- [ ] **Step 4: Run full-repo verification**

Run: `npx tsc --noEmit && npm run lint && npm run verify:docs && npm run verify:dnd-coverage`
Expected: all clean.

Run (from `src-tauri/`): `cargo fmt --all -- --check && cargo clippy -- -D warnings`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md
git commit -m "docs: close out the memory knowledge graph inferred-edges phase"
```

---

## Spec coverage check

- Common-neighbor signal — Task 1.
- Shared-`created_event` signal — Task 1.
- Auto-write with `confidence: 'inferred'` — Task 1.
- Atomic transaction, dedup, cap, self-loop rejection — Task 1.
- `inferEdges()` TS export — Task 2.
- Per-write trigger (scoped to touched nodes, cap 5) — Task 3.
- Stale `addEdge` docstring correction — Task 3.
- Scheduled trigger (random 20-node batch, cap 20, 30-min default) — Task 4.
- Boot wiring — Task 5.
- On-demand trigger (viewer button, cap 50) + link coloring via `trustColor()` — Task 6.
- Doc/CLAUDE.md updates — Task 7.

All spec requirements have a task. No placeholders. No gaps.
