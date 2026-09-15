# Memory Knowledge Graph — Phase 2 (Expansion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-hop graph traversal (`queryRelatedDeep`) and wire three more real writers (Hector, Jose, Maria) into the memory knowledge graph shipped in Phase 1, per `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-phase2-design.md`.

**Architecture:** A new Rust command (`memory_graph_query_related_deep`) adds `WITH RECURSIVE` traversal over the existing `memory_edges` table — no schema change. Direction (`forward`/`backward`/`both`) is resolved to one of three distinct, statically-written SQL query strings in Rust (not a single dynamically-branching query), since each direction's recursive step needs a different JOIN condition and that's far safer to get right as three separate, individually-testable queries than one query with runtime CASE branching baked into a recursive CTE. Cycle protection uses a delimited-string "visited" accumulator (the standard SQLite idiom, since SQLite has no native array/set type). The three writers each add one fire-and-forget graph write at a real call site already identified in the spec, exactly matching Phase 1's writer pattern.

**Tech Stack:** Rust (`rusqlite`, `WITH RECURSIVE`), TypeScript, `@tauri-apps/api/core`, Vitest, `cargo test`.

---

## Task 1: Rust — `memory_graph_query_related_deep` command

**Files:**
- Modify: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `src-tauri/src/memory_graph.rs` (after the existing `query_related_returns_edges_in_either_direction` test):

```rust
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
    assert_eq!(ids, vec!["e-ab".to_string(), "e-bc".to_string()], "depth 2 forward from A should reach e-ab and e-bc but not e-cd");
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
    assert_eq!(ids, vec!["e-bc".to_string(), "e-ab".to_string()], "backward from C should reach e-bc (depth 1) then e-ab (depth 2)");
  }

  #[test]
  fn query_related_deep_both_finds_edges_regardless_of_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    seed_chain(&conn);

    let results = query_related_deep_sql(&conn, "B", 1, "both").expect("query");
    let mut ids: Vec<String> = results.iter().map(|r| r.id.clone()).collect();
    ids.sort();
    assert_eq!(ids, vec!["e-ab".to_string(), "e-bc".to_string()], "'both' from B should find the incoming edge (e-ab) and outgoing edge (e-bc) at depth 1");
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
    assert_eq!(ids, vec!["e-ab".to_string(), "e-bc".to_string(), "e-ca".to_string()], "each edge in the cycle should appear exactly once");
  }

  #[test]
  fn query_related_deep_rejects_unknown_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let result = query_related_deep_sql(&conn, "A", 5, "sideways");
    assert!(result.is_err(), "an unrecognized direction string should be rejected, not silently treated as one of the 3 valid values");
  }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test memory_graph::tests::query_related_deep`
Expected: FAIL with `cannot find function query_related_deep_sql` (it doesn't exist yet)

- [ ] **Step 3: Add `GraphEdgeRowWithDepth`, the three SQL constants, and `query_related_deep_sql`**

Add to `src-tauri/src/memory_graph.rs`, after `memory_graph_query_related`:

```rust
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

const SQL_TRAVERSE_FORWARD: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',' || ?1 || ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT e.to_node_id, t.depth + 1, t.visited || e.to_node_id || ',',
           e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON e.from_node_id = t.current_node
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || e.to_node_id || ',') = 0
  )
  SELECT edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at, MIN(depth) AS depth
  FROM traverse
  WHERE edge_id IS NOT NULL
  GROUP BY edge_id
  ORDER BY depth ASC, edge_id ASC
";

const SQL_TRAVERSE_BACKWARD: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',' || ?1 || ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT e.from_node_id, t.depth + 1, t.visited || e.from_node_id || ',',
           e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON e.to_node_id = t.current_node
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || e.from_node_id || ',') = 0
  )
  SELECT edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at, MIN(depth) AS depth
  FROM traverse
  WHERE edge_id IS NOT NULL
  GROUP BY edge_id
  ORDER BY depth ASC, edge_id ASC
";

const SQL_TRAVERSE_BOTH: &str = "
  WITH RECURSIVE traverse(current_node, depth, visited, edge_id, from_node_id, to_node_id, edge_type, confidence, created_by, created_event, created_at) AS (
    SELECT ?1, 0, ',' || ?1 || ',', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    UNION ALL
    SELECT
      (CASE WHEN e.from_node_id = t.current_node THEN e.to_node_id ELSE e.from_node_id END),
      t.depth + 1,
      t.visited || (CASE WHEN e.from_node_id = t.current_node THEN e.to_node_id ELSE e.from_node_id END) || ',',
      e.id, e.from_node_id, e.to_node_id, e.edge_type, e.confidence, e.created_by, e.created_event, e.created_at
    FROM traverse t
    JOIN memory_edges e ON (e.from_node_id = t.current_node OR e.to_node_id = t.current_node)
    WHERE t.depth < ?2
      AND INSTR(t.visited, ',' || (CASE WHEN e.from_node_id = t.current_node THEN e.to_node_id ELSE e.from_node_id END) || ',') = 0
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test memory_graph::tests::query_related_deep`
Expected: 5 tests passing (`query_related_deep_forward_respects_max_depth`,
`query_related_deep_backward_follows_edges_in_reverse`,
`query_related_deep_both_finds_edges_regardless_of_direction`,
`query_related_deep_terminates_on_a_cycle`,
`query_related_deep_rejects_unknown_direction`)

- [ ] **Step 5: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, change:

```rust
pub(crate) use memory_graph::{memory_graph_add_edge, memory_graph_add_node, memory_graph_query_related};
```

to:

```rust
pub(crate) use memory_graph::{
  memory_graph_add_edge, memory_graph_add_node, memory_graph_query_related,
  memory_graph_query_related_deep,
};
```

Find the `invoke_handler(tauri::generate_handler![` list and add
`memory_graph_query_related_deep,` right after `memory_graph_query_related,`.

- [ ] **Step 6: Verify the crate compiles, clippy is clean, fmt is clean**

Run (from `src-tauri/`):
```bash
cargo check
cargo clippy -- -D warnings
cargo fmt --all -- --check
```
Expected: no errors, no warnings, no formatting diff. If `cargo fmt --all -- --check` reports a diff, run `cargo fmt --all` and re-check (matches what happened during Phase 1's implementation).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_graph_query_related_deep (multi-hop, direction-aware, cycle-safe)"
```

---

## Task 2: TypeScript — `queryRelatedDeep` + fix `queryRelated`'s stale doc comment

**Files:**
- Modify: `src/services/memoryGraphService.ts`
- Test: `src/test/services/memoryGraphService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/services/memoryGraphService.test.ts`, inside a new `describe('queryRelatedDeep', ...)` block (add it as a sibling to the existing `describe('queryRelated', ...)` block, inside the outer `describe('memoryGraphService', ...)`):

```ts
  describe('queryRelatedDeep', () => {
    it('passes nodeId, maxDepth, and direction through to the backend', async () => {
      const edges = [{
        id: 'e-1', fromNodeId: 'A', toNodeId: 'B', edgeType: 'next',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123, depth: 1
      }];
      invoke.mockResolvedValue(edges);
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'forward');
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_query_related_deep', {
        nodeId: 'A',
        maxDepth: 3,
        direction: 'forward'
      });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'both');
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { queryRelatedDeep } = await import('../../services/memoryGraphService');
      const result = await queryRelatedDeep('A', 3, 'backward');
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts -t "queryRelatedDeep"`
Expected: FAIL — `queryRelatedDeep is not a function` (doesn't exist yet)

- [ ] **Step 3: Add `queryRelatedDeep`, `TraversalDirection`, `GraphEdgeWithDepth`, and fix the stale doc comment**

In `src/services/memoryGraphService.ts`, add after the `GraphEdge` interface:

```ts
export type TraversalDirection = 'forward' | 'backward' | 'both';

export interface GraphEdgeWithDepth extends GraphEdge {
  depth: number;
}
```

Change the doc comment on `queryRelated` — it currently says (this is now factually wrong, since Phase 2 added a *separate* function instead):

```ts
/**
 * Phase 1 query capability: direct (one-hop) neighbors only. Multi-hop
 * traversal is a Phase 2 addition to this same function, not a new one.
 */
```

to:

```ts
/**
 * One-hop neighbors only. Multi-hop traversal is `queryRelatedDeep` (Phase
 * 2), a separate function — not an extension of this one. This function's
 * behavior and signature are unchanged since Phase 1.
 */
```

Add `queryRelatedDeep` at the end of the file, after `queryRelated`:

```ts
/**
 * Phase 2 query capability: multi-hop traversal via the backend's
 * `WITH RECURSIVE` implementation. `maxDepth` and `direction` are required,
 * not optional/defaulted — every call site must state its own intent
 * rather than inherit an invisible default. There is no ceiling on
 * `maxDepth`; the backend's cycle protection (visited-node tracking) is
 * what prevents a runaway query, not a depth cap.
 */
export async function queryRelatedDeep(
  nodeId: string,
  maxDepth: number,
  direction: TraversalDirection
): Promise<GraphEdgeWithDepth[]> {
  try {
    const rows = await invoke<GraphEdgeWithDepth[]>('memory_graph_query_related_deep', {
      nodeId,
      maxDepth,
      direction
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: all tests in the file PASS (8 pre-existing + 3 new = 11)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/memoryGraphService.ts src/test/services/memoryGraphService.test.ts
git commit -m "feat(memory-graph): add queryRelatedDeep, fix stale queryRelated doc comment"
```

---

## Task 3: Writer — Hector's `createResearchDraft`

**Files:**
- Modify: `src/services/hectorResearchService.js:719-788` (the `createResearchDraft` function)
- Test: `src/test/hectorResearchService.test.js`

- [ ] **Step 1: Write the failing test**

Add near the top of `src/test/hectorResearchService.test.js`, after the existing `vi.stubGlobal('fetch', ...)` block and before the `vi.mock('@tauri-apps/api/core', ...)` block:

```js
vi.mock('../services/memoryGraphService', () => ({
  addNode: vi.fn((nodeType, refId) => Promise.resolve(`${nodeType}:${refId}`)),
  addEdge: vi.fn().mockResolvedValue('mock-edge-id')
}));
```

The mock resolves `addNode` to the same `"{nodeType}:{refId}"` shape the real
Rust command produces (see Phase 1's `memory_graph_add_node`) — each of the
two `addNode` calls this writer makes (one for the report, one per source)
needs to resolve to a *different* id, since both feed into `addEdge`
assertions below; a single fixed `mockResolvedValue` would make both calls
return the same fake id and silently break those assertions.

Add a new test (place it near any existing `createResearchDraft` tests in the file, or as a new top-level `it` if none exist yet):

```js
it('writes a research_report node and cites edges to each source URL', async () => {
  const graph = await import('../services/memoryGraphService');
  const { createResearchDraft } = await import('../services/hectorResearchService');

  const report = createResearchDraft({
    researchQuestion: 'What is Tauri?',
    sourceUrls: ['https://tauri.app/docs', 'https://github.com/tauri-apps/tauri']
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(graph.addNode).toHaveBeenCalledWith('research_report', report.id);
  expect(graph.addNode).toHaveBeenCalledWith('source', 'https://tauri.app/docs');
  expect(graph.addNode).toHaveBeenCalledWith('source', 'https://github.com/tauri-apps/tauri');
  expect(graph.addEdge).toHaveBeenCalledWith(
    `research_report:${report.id}`,
    'source:https://tauri.app/docs',
    'cites',
    expect.objectContaining({ createdBy: 'hector', createdEvent: report.id })
  );
  expect(graph.addEdge).toHaveBeenCalledWith(
    `research_report:${report.id}`,
    'source:https://github.com/tauri-apps/tauri',
    'cites',
    expect.objectContaining({ createdBy: 'hector', createdEvent: report.id })
  );
});

it('writes no cites edges when sourceUrls is empty', async () => {
  const graph = await import('../services/memoryGraphService');
  const { createResearchDraft } = await import('../services/hectorResearchService');

  createResearchDraft({ researchQuestion: 'No sources yet' });

  await Promise.resolve();
  await Promise.resolve();

  expect(graph.addEdge).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/hectorResearchService.test.js -t "research_report"`
Expected: FAIL — `addNode`/`addEdge` not called (the integration doesn't exist yet)

- [ ] **Step 3: Add the import and the fire-and-forget graph write**

In `src/services/hectorResearchService.js`, add to the top-of-file imports (near the existing `scoreSourceConfidence` import):

```js
import { addNode, addEdge } from './memoryGraphService';
```

In `createResearchDraft`, immediately before `return report;` (the last line of the function body — currently right after the `appendSessionEvent({...})` call), add:

```js
  addNode('research_report', report.id).then((reportNodeId) => {
    if (!reportNodeId) return;
    sources.forEach((source) => {
      addNode('source', source.url).then((sourceNodeId) => {
        if (!sourceNodeId) return;
        addEdge(reportNodeId, sourceNodeId, 'cites', {
          confidence: source.confidence,
          createdBy: AGENTS.HECTOR,
          createdEvent: report.id
        });
      }).catch(() => {});
    });
  }).catch(() => {});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/hectorResearchService.test.js`
Expected: all tests in the file PASS (pre-existing + 2 new). `AGENTS.HECTOR` (already imported in this file, used elsewhere e.g. line 773) is confirmed `'hector'` — verified directly against `src/services/agentBusService.ts:111` — matching the test's `createdBy: 'hector'` expectation exactly.

- [ ] **Step 5: Commit**

```bash
git add src/services/hectorResearchService.js src/test/hectorResearchService.test.js
git commit -m "feat(memory-graph): wire createResearchDraft as a graph writer (research_report + source nodes, cites edges)"
```

---

## Task 4: Writer — Jose's `appendOrchestrationReceipt`

**Files:**
- Modify: `src/services/orchestrationReceiptService.ts:89-130` (the `appendOrchestrationReceipt` function)
- Test: `src/test/services/orchestrationReceiptService.test.ts`

- [ ] **Step 1: Write the failing test**

Add near the top of `src/test/services/orchestrationReceiptService.test.ts`, alongside the existing `vi.mock` calls:

```ts
vi.mock('../../services/memoryGraphService', () => ({
  addNode: vi.fn((nodeType: string, refId: string) => Promise.resolve(`${nodeType}:${refId}`)),
  addEdge: vi.fn().mockResolvedValue('mock-edge-id')
}));
```

The mock resolves `addNode` to the same `"{nodeType}:{refId}"` shape the real
Rust command produces — the two `addNode` calls this writer makes (receipt,
then packet) must resolve to different ids for the `addEdge` assertions
below to be meaningful.

Add a new `describe` block:

```ts
describe('appendOrchestrationReceipt graph integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a receipt node and a belongs_to edge when packetId is present', async () => {
    const graph = await import('../../services/memoryGraphService');
    const receipt = appendOrchestrationReceipt({ eventType: 'test_event', packetId: 'packet-1' });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addNode).toHaveBeenCalledWith('receipt', receipt.id);
    expect(graph.addNode).toHaveBeenCalledWith('packet', 'packet-1');
    expect(graph.addEdge).toHaveBeenCalledWith(
      `receipt:${receipt.id}`,
      'packet:packet-1',
      'belongs_to',
      expect.objectContaining({ createdBy: receipt.agent, createdEvent: receipt.id })
    );
  });

  it('falls back to commandId when packetId is absent', async () => {
    const graph = await import('../../services/memoryGraphService');
    appendOrchestrationReceipt({ eventType: 'test_event', commandId: 'cmd-1' });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addNode).toHaveBeenCalledWith('packet', 'cmd-1');
  });

  it('writes no edge when neither packetId nor commandId is present', async () => {
    const graph = await import('../../services/memoryGraphService');
    appendOrchestrationReceipt({ eventType: 'test_event' });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addEdge).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/orchestrationReceiptService.test.ts -t "graph integration"`
Expected: FAIL — `addNode`/`addEdge` not called

- [ ] **Step 3: Add the import and the fire-and-forget graph write**

In `src/services/orchestrationReceiptService.ts`, add to the top imports:

```ts
import { addNode, addEdge } from './memoryGraphService';
```

In `appendOrchestrationReceipt`, immediately before `return receipt;` (the last line, currently right after the `void import('./toolNotificationDispatcher')...` line), add:

```ts
  const packetRefId = receipt.packetId ?? receipt.commandId;
  addNode('receipt', receipt.id).then((receiptNodeId) => {
    if (!receiptNodeId || !packetRefId) return;
    addNode('packet', packetRefId).then((packetNodeId) => {
      if (!packetNodeId) return;
      addEdge(receiptNodeId, packetNodeId, 'belongs_to', {
        confidence: TRUST_STATES.VERIFIED,
        createdBy: receipt.agent,
        createdEvent: receipt.id
      });
    }).catch(() => {});
  }).catch(() => {});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/orchestrationReceiptService.test.ts`
Expected: all tests in the file PASS (pre-existing + 3 new)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/orchestrationReceiptService.ts src/test/services/orchestrationReceiptService.test.ts
git commit -m "feat(memory-graph): wire appendOrchestrationReceipt as a graph writer (receipt node, belongs_to edge to packet)"
```

---

## Task 5: Writer — Maria's `runMariaGovernanceAudit`

**Files:**
- Modify: `src/services/mariaAuditService.ts:166-256` (the `runMariaGovernanceAudit` function)
- Test: `src/test/mariaAuditService.test.js`

This writer reuses the `memory_item` node Maria's own existing `pushMemoryItem`
call already creates (Phase 1 wiring, via `pushMemoryItem`'s re-export chain
through `memoryService.ts` → `unifiedMemoryService.js`'s `pushMemory`) — no
new node type for the audit result itself, since it has no natural id of its
own beyond the memory item's.

- [ ] **Step 1: Write the failing test**

The file already mocks `../services/memoryService` (`vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }))`). Change that mock so it returns a value with an `.id` (currently it's a bare `vi.fn()` with no return value, which means `pushMemoryItem(...)` currently resolves to `undefined` in this test file):

```js
vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn(() => ({ id: 'mem-mock-1' })) }));
```

Add a new mock alongside the existing ones:

```js
vi.mock('../services/memoryGraphService', () => ({
  addNode: vi.fn((nodeType, refId) => Promise.resolve(`${nodeType}:${refId}`)),
  addEdge: vi.fn().mockResolvedValue('mock-edge-id')
}));
```

The mock resolves `addNode` to the same `"{nodeType}:{refId}"` shape the real
Rust command produces — the two `addNode` calls this writer makes (the
reused `memory_item` node, then the packet node) must resolve to different
ids for the `addEdge` assertions below to be meaningful.

Add a new `describe` block:

```js
describe('runMariaGovernanceAudit graph integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes an audits edge to a packet node when packetId is present', async () => {
    const graph = await import('../services/memoryGraphService');
    await runMariaGovernanceAudit('do the thing', { packetId: 'packet-1' }, { draftDisabled: true });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addNode).toHaveBeenCalledWith('memory_item', 'mem-mock-1');
    expect(graph.addNode).toHaveBeenCalledWith('packet', 'packet-1');
    expect(graph.addEdge).toHaveBeenCalledWith(
      'memory_item:mem-mock-1',
      'packet:packet-1',
      'audits',
      expect.objectContaining({ createdBy: 'maria' })
    );
  });

  it('falls back to commandId when packetId is absent', async () => {
    const graph = await import('../services/memoryGraphService');
    await runMariaGovernanceAudit('do the thing', { commandId: 'cmd-1' }, { draftDisabled: true });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addNode).toHaveBeenCalledWith('packet', 'cmd-1');
  });

  it('writes no edge when neither packetId nor commandId is present', async () => {
    const graph = await import('../services/memoryGraphService');
    await runMariaGovernanceAudit('do the thing', {}, { draftDisabled: true });

    await Promise.resolve();
    await Promise.resolve();

    expect(graph.addEdge).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/mariaAuditService.test.js -t "graph integration"`
Expected: FAIL — `addNode`/`addEdge` not called

- [ ] **Step 3: Add the import and the fire-and-forget graph write**

In `src/services/mariaAuditService.ts`, add to the top imports:

```ts
import { addNode, addEdge } from './memoryGraphService';
```

Change the existing `pushMemoryItem({...})` call (around line 208) to capture its return value — it currently reads:

```ts
  pushMemoryItem({
    title: `Maria audit: ${String(commandText || '').slice(0, 80)}`,
    category: 'governance_memory',
    content: schema,
    source: 'maria-audit-service',
    sourceAgent: 'maria',
    confidence: schema.confidenceLevel,
    verificationState: (schema as unknown as { verificationState: string }).verificationState
  });
```

Change to:

```ts
  const memoryItem = pushMemoryItem({
    title: `Maria audit: ${String(commandText || '').slice(0, 80)}`,
    category: 'governance_memory',
    content: schema,
    source: 'maria-audit-service',
    sourceAgent: 'maria',
    confidence: schema.confidenceLevel,
    verificationState: (schema as unknown as { verificationState: string }).verificationState
  });

  const packetRefId = assignment?.packetId ?? assignment?.commandId;
  if (memoryItem?.id) {
    addNode('memory_item', memoryItem.id).then((memoryItemNodeId) => {
      if (!memoryItemNodeId || !packetRefId) return;
      addNode('packet', packetRefId).then((packetNodeId) => {
        if (!packetNodeId) return;
        addEdge(memoryItemNodeId, packetNodeId, 'audits', {
          confidence: TRUST_STATES.VERIFIED,
          createdBy: 'maria',
          createdEvent: memoryItem.id
        });
      }).catch(() => {});
    }).catch(() => {});
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/mariaAuditService.test.js`
Expected: all tests in the file PASS (pre-existing + 3 new)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/mariaAuditService.ts src/test/mariaAuditService.test.js
git commit -m "feat(memory-graph): wire runMariaGovernanceAudit as a graph writer (audits edge from reused memory_item node to packet)"
```

---

## Task 6: Full verification pass + docs

**Files:**
- Modify: `CLAUDE.md` (the "Memory knowledge graph service" row added in Phase 1)

- [ ] **Step 1: Run the full Rust test + lint suite**

Run (from `src-tauri/`):
```bash
cargo check
cargo test
cargo clippy -- -D warnings
cargo fmt --all -- --check
```
Expected: all green. (If the full `cargo test` gets killed mid-compile on
this dev machine — a known, pre-existing environment constraint documented
in CLAUDE.md, not something this plan's changes cause — fall back to
`cargo test memory_graph::` plus the whole-crate `clippy`/`fmt` checks,
same as Phase 1's implementation did, and let CI confirm the full suite.)

- [ ] **Step 2: Run the affected JS/TS test files together**

Run:
```bash
npx vitest run src/test/services/memoryGraphService.test.ts src/test/hectorResearchService.test.js src/test/services/orchestrationReceiptService.test.ts src/test/mariaAuditService.test.js
```
Expected: all green.

- [ ] **Step 3: Full typecheck and lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 errors, 0 new lint warnings.

- [ ] **Step 4: Doc-count freshness**

Run: `npm run verify:docs`
Expected: clean. If it reports stale counts (Phase 1's implementation hit
this — new Rust functions/tests shift the counts in
`README.md`/`ARCHITECTURE.md`/`AGENTS.md`), fix each flagged line to the
number the script reports as correct, then re-run until clean.

- [ ] **Step 5: Update CLAUDE.md's memory knowledge graph row**

Find the row added in Phase 1 (search for "Memory knowledge graph
service" in CLAUDE.md's "Do Not Duplicate" table) and replace it with:

```
| Memory knowledge graph service | `src/services/memoryGraphService.ts` — relationship layer over `memory_nodes`/`memory_edges` SQLite tables (`src-tauri/src/memory_graph.rs`). `addNode`/`addEdge`/`queryRelated` (one-hop, Phase 1) + `queryRelatedDeep` (multi-hop via `WITH RECURSIVE`, required `maxDepth`/`direction` params, no ceiling, cycle-safe — Phase 2). Writers: `unifiedMemoryService.js`'s `pushMemory`, `boardroomThreadService.ts`'s `addThreadMessage` (Phase 1); `hectorResearchService.js`'s `createResearchDraft`, `orchestrationReceiptService.ts`'s `appendOrchestrationReceipt`, `mariaAuditService.ts`'s `runMariaGovernanceAudit` (Phase 2). Read access (`queryRelated`/`queryRelatedDeep`) is open to every agent regardless of writer count. See `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md` (Phase 1) and `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-phase2-design.md` (Phase 2) for the full design and roadmap. |
```

Run `npm run verify:dnd-coverage` to confirm it still passes clean.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update memory knowledge graph Do Not Duplicate entry for Phase 2"
```
