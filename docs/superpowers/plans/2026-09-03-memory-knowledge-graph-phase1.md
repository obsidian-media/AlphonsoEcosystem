# Memory Knowledge Graph — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a relationship layer over Alphonso's memory — a new `memoryGraphService.ts` backed by two real SQLite tables, with exactly two writers (`unifiedMemoryService.js`, `boardroomThreadService.ts`) and read access open to every agent, per `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md`.

**Architecture:** A new Rust module (`src-tauri/src/memory_graph.rs`) owns two tables — `memory_nodes` and `memory_edges` — in the app's existing `alphonso_memory.sqlite3` database (same file `kv_store.rs`/`memory_store.rs` already use, via `memory_store::open_memory_db`), exposed through 3 Tauri commands. A new TypeScript service (`src/services/memoryGraphService.ts`) wraps those commands with fail-soft error handling (returns `null`/`[]` on any failure, never throws — matches this app's established graceful-degradation convention for anything Tauri-backed). Node ids are deterministic (`"{node_type}:{ref_id}"`), so callers never need a separate id-lookup step to build edges between two things they already have ids for.

**Tech Stack:** Rust (`rusqlite`, existing `alphonso_memory.sqlite3`), TypeScript, `@tauri-apps/api/core`'s `invoke`, Vitest, `cargo test`.

---

## Task 1: Rust — `memory_graph.rs` module skeleton + table creation

**Files:**
- Create: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the module with `ensure_memory_graph_tables`**

```rust
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
```

- [ ] **Step 2: Run the test to verify it passes**

Run (from `src-tauri/`): `cargo test memory_graph::tests::ensure_memory_graph_tables_creates_both_tables`
Expected: `test memory_graph::tests::ensure_memory_graph_tables_creates_both_tables ... ok` — but first this module must be declared in `lib.rs` or `cargo test` won't find it. Do that now as part of this task, not deferred:

- [ ] **Step 3: Declare the module in `lib.rs`**

In `src-tauri/src/lib.rs`, find the alphabetical `mod` block (around line 32-33):

```rust
mod kv_store;
mod memory_store;
```

Change to:

```rust
mod kv_store;
mod memory_graph;
mod memory_store;
```

- [ ] **Step 4: Run the test again to verify it passes**

Run (from `src-tauri/`): `cargo test memory_graph::tests::ensure_memory_graph_tables_creates_both_tables`
Expected: `1 passed; 0 failed`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_nodes/memory_edges table schema"
```

---

## Task 2: Rust — `memory_graph_add_node` command

**Files:**
- Modify: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the failing test (direct SQL, matching `kv_store.rs`'s test style — commands take `AppHandle` and aren't unit-tested directly, only the underlying SQL logic is)**

Add to the `mod tests` block in `src-tauri/src/memory_graph.rs`:

```rust
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
    assert_eq!(count, 1, "adding the same node twice should not duplicate rows");
    assert_eq!(id, "memory_item:mem-1");
  }
```

- [ ] **Step 2: Run test to verify it passes (it should — this test only exercises raw SQL, proving the schema/query approach before wiring the command)**

Run: `cargo test memory_graph::tests::add_node_insert_is_idempotent_and_uses_deterministic_id`
Expected: `1 passed; 0 failed`

- [ ] **Step 3: Add the `memory_graph_add_node` command**

Add to `src-tauri/src/memory_graph.rs`, after `ensure_memory_graph_tables`:

```rust
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
```

- [ ] **Step 4: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, find:

```rust
pub(crate) use kv_store::{kv_delete, kv_get, kv_set, load_settings, save_settings};
```

Add directly below it:

```rust
pub(crate) use memory_graph::memory_graph_add_node;
```

Then find the `invoke_handler(tauri::generate_handler![` list (contains `kv_set, kv_get, kv_delete,`) and add `memory_graph_add_node,` right after `kv_delete,`:

```rust
      kv_set,
      kv_get,
      kv_delete,
      memory_graph_add_node,
```

- [ ] **Step 5: Verify the whole crate still compiles**

Run (from `src-tauri/`): `cargo check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_graph_add_node Tauri command"
```

---

## Task 3: Rust — `memory_graph_add_edge` command

**Files:**
- Modify: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the failing test**

Add to the `mod tests` block:

```rust
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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cargo test memory_graph::tests::add_edge_insert_round_trips_all_fields`
Expected: `1 passed; 0 failed`

- [ ] **Step 3: Add the `memory_graph_add_edge` command**

Add to `src-tauri/src/memory_graph.rs`, after `memory_graph_add_node`:

```rust
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
  let id = crate::generate_id();
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
```

- [ ] **Step 4: Register the command in `lib.rs`**

Change:

```rust
pub(crate) use memory_graph::memory_graph_add_node;
```

to:

```rust
pub(crate) use memory_graph::{memory_graph_add_edge, memory_graph_add_node};
```

Add `memory_graph_add_edge,` to the `invoke_handler` list, right after `memory_graph_add_node,`:

```rust
      memory_graph_add_node,
      memory_graph_add_edge,
```

- [ ] **Step 5: Verify the crate compiles**

Run (from `src-tauri/`): `cargo check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_graph_add_edge Tauri command"
```

---

## Task 4: Rust — `memory_graph_query_related` command (one-hop)

**Files:**
- Modify: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the failing test**

Add to the `mod tests` block:

```rust
  #[test]
  fn query_related_returns_edges_in_either_direction() {
    let conn = Connection::open_in_memory().expect("in-memory db");
    ensure_memory_graph_tables(&conn).expect("ensure_memory_graph_tables");
    let now = crate::now_ms() as i64;

    // node-x is the "from" side of one edge and the "to" side of another
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
    // an edge that does NOT touch node-x — must not be returned
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
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cargo test memory_graph::tests::query_related_returns_edges_in_either_direction`
Expected: `1 passed; 0 failed`

- [ ] **Step 3: Add the `GraphEdgeRow` struct and `memory_graph_query_related` command**

Add to `src-tauri/src/memory_graph.rs`, after `memory_graph_add_edge`:

```rust
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
```

The explicit `#[serde(rename = "createdAtMs")]` on `created_at` is required
because plain `camelCase` conversion would produce `createdAt`, not
`createdAtMs` — and the TypeScript `GraphEdge` interface (Task 5) is defined
with `createdAtMs` to match this app's existing `timestampMs`/`updatedAtMs`
naming convention (see `unifiedMemoryService.js`'s `timestampMs`,
`updatedAtMs` fields). Getting this wrong would silently produce
`edge.createdAtMs === undefined` on every row returned from
`queryRelated` — exactly the kind of mismatch this plan's self-review step
exists to catch before it ships.

```rust
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
```

- [ ] **Step 4: Register the command in `lib.rs`**

Change:

```rust
pub(crate) use memory_graph::{memory_graph_add_edge, memory_graph_add_node};
```

to:

```rust
pub(crate) use memory_graph::{memory_graph_add_edge, memory_graph_add_node, memory_graph_query_related};
```

Add `memory_graph_query_related,` to the `invoke_handler` list, right after `memory_graph_add_edge,`.

- [ ] **Step 5: Verify the crate compiles and clippy is clean**

Run (from `src-tauri/`): `cargo check && cargo clippy -- -D warnings`
Expected: no errors, no warnings.

- [ ] **Step 6: Run rustfmt check**

Run (from `src-tauri/`): `cargo fmt --all -- --check`
Expected: no diff (if there is one, run `cargo fmt --all` and re-check).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_graph_query_related Tauri command (one-hop)"
```

---

## Task 5: TypeScript — `memoryGraphService.ts`

**Files:**
- Create: `src/services/memoryGraphService.ts`
- Test: `src/test/services/memoryGraphService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/services/memoryGraphService.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args)
}));

describe('memoryGraphService', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  describe('addNode', () => {
    it('returns the node id from the backend on success', async () => {
      invoke.mockResolvedValue('memory_item:mem-1');
      const { addNode } = await import('../../services/memoryGraphService');
      const id = await addNode('memory_item', 'mem-1');
      expect(id).toBe('memory_item:mem-1');
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_node', {
        nodeType: 'memory_item',
        refId: 'mem-1'
      });
    });

    it('returns null instead of throwing when invoke fails (e.g. non-Tauri web mode)', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addNode } = await import('../../services/memoryGraphService');
      const id = await addNode('memory_item', 'mem-1');
      expect(id).toBeNull();
    });
  });

  describe('addEdge', () => {
    it('passes confidence/createdBy/createdEvent through to the backend', async () => {
      invoke.mockResolvedValue('edge-123');
      const { addEdge } = await import('../../services/memoryGraphService');
      const id = await addEdge('memory_item:mem-1', 'memory_item:mem-2', 'mentions', {
        confidence: 'user_confirmed',
        createdBy: 'echo',
        createdEvent: 'mem-1'
      });
      expect(id).toBe('edge-123');
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_edge', {
        fromNodeId: 'memory_item:mem-1',
        toNodeId: 'memory_item:mem-2',
        edgeType: 'mentions',
        confidence: 'user_confirmed',
        createdBy: 'echo',
        createdEvent: 'mem-1'
      });
    });

    it('defaults createdEvent to null when not provided', async () => {
      invoke.mockResolvedValue('edge-124');
      const { addEdge } = await import('../../services/memoryGraphService');
      await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(invoke).toHaveBeenCalledWith('memory_graph_add_edge', expect.objectContaining({
        createdEvent: null
      }));
    });

    it('returns null instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { addEdge } = await import('../../services/memoryGraphService');
      const id = await addEdge('a', 'b', 'mentions', { confidence: 'verified', createdBy: 'jose' });
      expect(id).toBeNull();
    });
  });

  describe('queryRelated', () => {
    it('returns the edges array from the backend', async () => {
      const edges = [{
        id: 'edge-1', fromNodeId: 'a', toNodeId: 'b', edgeType: 'mentions',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_query_related', { nodeId: 'a' });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { queryRelated } = await import('../../services/memoryGraphService');
      const result = await queryRelated('a');
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: FAIL — `Cannot find module '../../services/memoryGraphService'`

- [ ] **Step 3: Write `src/services/memoryGraphService.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import type { TrustState } from './trustModel';

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  confidence: string;
  createdBy: string;
  createdEvent: string | null;
  createdAtMs: number;
}

export interface AddEdgeOptions {
  confidence: TrustState;
  createdBy: string;
  createdEvent?: string;
}

/**
 * Creates (or no-ops if it already exists) a graph node for the given
 * node type + ref id pair. Node ids are deterministic ("{nodeType}:{refId}"),
 * so callers never need to look up an id separately before building an edge.
 * Returns null instead of throwing when the Tauri backend is unavailable
 * (e.g. running in a plain browser during development).
 */
export async function addNode(nodeType: string, refId: string): Promise<string | null> {
  try {
    return await invoke<string>('memory_graph_add_node', { nodeType, refId });
  } catch {
    return null;
  }
}

/**
 * Records a typed, directed edge between two already-known node ids.
 * Phase 1 is manual-only: callers must only invoke this at a moment they
 * already know a real relationship exists — no inference happens here.
 */
export async function addEdge(
  fromNodeId: string,
  toNodeId: string,
  edgeType: string,
  opts: AddEdgeOptions
): Promise<string | null> {
  try {
    return await invoke<string>('memory_graph_add_edge', {
      fromNodeId,
      toNodeId,
      edgeType,
      confidence: opts.confidence,
      createdBy: opts.createdBy,
      createdEvent: opts.createdEvent ?? null
    });
  } catch {
    return null;
  }
}

/**
 * Phase 1 query capability: direct (one-hop) neighbors only. Multi-hop
 * traversal is a Phase 2 addition to this same function, not a new one.
 */
export async function queryRelated(nodeId: string): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_query_related', { nodeId });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/memoryGraphService.ts src/test/services/memoryGraphService.test.ts
git commit -m "feat(memory-graph): add memoryGraphService.ts (addNode/addEdge/queryRelated)"
```

---

## Task 6: Writer 1 — `unifiedMemoryService.js`'s `pushMemory`

**Files:**
- Modify: `src/services/unifiedMemoryService.js:284-340` (the `pushMemory` function)
- Test: `src/test/unifiedMemoryService.test.js`

`pushMemory` is the real, non-deprecated entry point every other memory-writing
function in this file delegates to (`addMemoryItem`, `pushMemoryItem`,
`pushMiyaMemory`, etc. all call it) — writing the graph hook here means every
caller benefits, not just one of the deprecated wrappers.

- [ ] **Step 1: Write the failing test**

Add to `src/test/unifiedMemoryService.test.js` (check the top of the file first
for its existing `vi.mock` setup and add this mock alongside any existing
ones — do not replace existing mocks):

```js
vi.mock('../services/memoryGraphService', () => ({
  addNode: vi.fn().mockResolvedValue('memory_item:mock-node'),
  addEdge: vi.fn().mockResolvedValue('mock-edge-id')
}));
```

Then add a new `describe` block:

```js
describe('pushMemory graph integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('writes a memory_item node for every pushed memory', async () => {
    const graph = await import('../services/memoryGraphService');
    const { pushMemory } = await import('../services/unifiedMemoryService');
    const item = pushMemory({ title: 'Test memory', sourceAgent: 'echo' });
    // addNode is fire-and-forget; flush microtasks before asserting
    await Promise.resolve();
    await Promise.resolve();
    expect(graph.addNode).toHaveBeenCalledWith('memory_item', item.id);
  });

  it('writes an edge when relatedMemoryId is provided', async () => {
    const graph = await import('../services/memoryGraphService');
    const { pushMemory } = await import('../services/unifiedMemoryService');
    const item = pushMemory({
      title: 'Follow-up memory',
      sourceAgent: 'echo',
      relatedMemoryId: 'mem-earlier'
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(graph.addEdge).toHaveBeenCalledWith(
      'memory_item:mock-node',
      'memory_item:mem-earlier',
      'mentions',
      expect.objectContaining({ createdBy: 'echo', createdEvent: item.id })
    );
  });

  it('does not write an edge when relatedMemoryId is not provided', async () => {
    const graph = await import('../services/memoryGraphService');
    const { pushMemory } = await import('../services/unifiedMemoryService');
    pushMemory({ title: 'Standalone memory', sourceAgent: 'echo' });
    await Promise.resolve();
    await Promise.resolve();
    expect(graph.addEdge).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/unifiedMemoryService.test.js -t "pushMemory graph integration"`
Expected: FAIL — `addNode`/`addEdge` not called (the integration doesn't exist yet)

- [ ] **Step 3: Add the import and the fire-and-forget graph write to `pushMemory`**

In `src/services/unifiedMemoryService.js`, add to the top-of-file imports (near
the existing `TRUST_STATES` import):

```js
import { addNode, addEdge } from './memoryGraphService';
```

In `pushMemory`, immediately before `return tagged;` (the last line of the
function body), add:

```js
  addNode('memory_item', tagged.id).then((nodeId) => {
    if (nodeId && partial.relatedMemoryId) {
      addEdge(nodeId, `memory_item:${partial.relatedMemoryId}`, 'mentions', {
        confidence: TRUST_STATES.USER_CONFIRMED,
        createdBy: tagged.sourceAgent,
        createdEvent: tagged.id
      });
    }
  }).catch(() => {});

  return tagged;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/unifiedMemoryService.test.js`
Expected: all tests in the file PASS (both pre-existing and the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/services/unifiedMemoryService.js src/test/unifiedMemoryService.test.js
git commit -m "feat(memory-graph): wire pushMemory as a graph writer (memory_item nodes + optional relatedMemoryId edges)"
```

---

## Task 7: Writer 2 — `boardroomThreadService.ts`'s `addThreadMessage`

**Files:**
- Modify: `src/services/boardroomThreadService.ts:187-230ish` (the `addThreadMessage` function)
- Test: `src/test/services/boardroomThreadService.test.ts`

- [ ] **Step 1: Write the failing test**

Add near the top of `src/test/services/boardroomThreadService.test.ts`, before
the `describe('boardroomThreadService', ...)` block:

```ts
vi.mock('../../services/memoryGraphService', () => ({
  addNode: vi.fn().mockResolvedValue('boardroom_message:mock-node'),
  addEdge: vi.fn().mockResolvedValue('mock-edge-id')
}));
```

Add `vi` to the existing `import { describe, it, expect, beforeEach } from 'vitest';`
line — change it to `import { describe, it, expect, beforeEach, vi } from 'vitest';`.

Add a new `describe` block inside the outer `describe('boardroomThreadService', ...)`:

```ts
  describe('addThreadMessage graph integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('writes a boardroom_message node for every message', async () => {
      const graph = await import('../../services/memoryGraphService');
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const msg = addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Hello.' });
      await Promise.resolve();
      await Promise.resolve();
      expect(graph.addNode).toHaveBeenCalledWith('boardroom_message', msg?.id);
    });

    it('writes an informed_by edge when informedByMessageId is provided', async () => {
      const graph = await import('../../services/memoryGraphService');
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      const first = addThreadMessage({ threadId: thread.id, speaker: 'alphonso', content: '@hector look into this' });
      const reply = addThreadMessage({
        threadId: thread.id,
        speaker: 'hector',
        content: 'On it.',
        informedByMessageId: first?.id
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(graph.addEdge).toHaveBeenCalledWith(
        'boardroom_message:mock-node',
        `boardroom_message:${first?.id}`,
        'informed_by',
        expect.objectContaining({ createdBy: 'hector', createdEvent: reply?.id })
      );
    });

    it('does not write an edge when informedByMessageId is not provided', async () => {
      const graph = await import('../../services/memoryGraphService');
      const { createThread, addThreadMessage } = await import('../../services/boardroomThreadService');
      const thread = createThread({ topic: 'Test', participants: ['jose'] });
      addThreadMessage({ threadId: thread.id, speaker: 'jose', content: 'Standalone message.' });
      await Promise.resolve();
      await Promise.resolve();
      expect(graph.addEdge).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts -t "addThreadMessage graph integration"`
Expected: FAIL — `addNode`/`addEdge` not called, and TypeScript will also flag
`informedByMessageId` as an unknown property until Step 3 is done.

- [ ] **Step 3: Add `informedByMessageId` param and the graph write**

In `src/services/boardroomThreadService.ts`, add the import at the top of the
file (alongside the existing `missionRoomService` import):

```ts
import { addNode, addEdge } from './memoryGraphService';
import { TRUST_STATES } from './trustModel';
```

Update the `addThreadMessage` function signature to accept the new optional
field — change:

```ts
export function addThreadMessage({
  threadId,
  speaker,
  content,
  kind = 'message',
  retryContext,
  model,
  latencyMs
}: {
  threadId: string;
  speaker: string;
  content: string;
  kind?: BoardroomThreadMessage['kind'];
  retryContext?: string;
  model?: string;
  latencyMs?: number;
}): BoardroomThreadMessage | null {
```

to:

```ts
export function addThreadMessage({
  threadId,
  speaker,
  content,
  kind = 'message',
  retryContext,
  model,
  latencyMs,
  informedByMessageId
}: {
  threadId: string;
  speaker: string;
  content: string;
  kind?: BoardroomThreadMessage['kind'];
  retryContext?: string;
  model?: string;
  latencyMs?: number;
  informedByMessageId?: string;
}): BoardroomThreadMessage | null {
```

Then find where the function returns the created `message` (after it's pushed
into `rows`/persisted — look for the `return message;` or equivalent at the
end of the function) and add the fire-and-forget graph write immediately
before that return:

```ts
  addNode('boardroom_message', message.id).then((nodeId) => {
    if (nodeId && informedByMessageId) {
      addEdge(nodeId, `boardroom_message:${informedByMessageId}`, 'informed_by', {
        confidence: TRUST_STATES.VERIFIED,
        createdBy: speaker,
        createdEvent: message.id
      });
    }
  }).catch(() => {});
```

(If the function's final statement is something other than a bare
`return message;` — e.g. it returns after further processing — add this block
directly before whatever the final `return` statement is, using the same
`message` variable that's about to be returned.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/boardroomThreadService.test.ts`
Expected: all tests in the file PASS (pre-existing + 3 new)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/boardroomThreadService.ts src/test/services/boardroomThreadService.test.ts
git commit -m "feat(memory-graph): wire addThreadMessage as a graph writer (boardroom_message nodes + optional informedByMessageId edges)"
```

---

## Task 8: Thread `informedByMessageId` through Boardroom's real @mention chain

**Files:**
- Modify: `src/components/BoardroomChatView.tsx:180-280` (the `handleSend` function's chain loop)
- Test: `src/test/boardroomChatView.test.jsx`

This is the one real call site in the app today where a message is generated
*because of* a specific prior message — the `@mention` chain loop inside
`handleSend()`. This task threads that already-known relationship through to
`addThreadMessage`'s new `informedByMessageId` param. It deliberately does
**not** touch the "stopped by user" / "chain depth reached" / retry call sites
in the same file — those are system notices or a distinct retry flow, not a
content relationship worth graphing in Phase 1.

- [ ] **Step 1: Write the failing test**

The file's top imports (line 3) currently read:

```jsx
import { render, screen, fireEvent, within } from '@testing-library/react';
```

Change to add `waitFor`:

```jsx
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
```

Add a `vi.mock` for `boardroomThreadService` right after the existing
`vi.mock('../services/boardroomFacilitatorService', ...)` block (lines 12-16),
using `vi.importActual` so the real `createThread`/`listThreadMessages`/etc.
behavior still works — only `addThreadMessage` is wrapped to spy on its args:

```jsx
vi.mock('../services/boardroomThreadService', async () => {
  const actual = await vi.importActual('../services/boardroomThreadService');
  return {
    ...actual,
    addThreadMessage: vi.fn(actual.addThreadMessage)
  };
});
```

Add a new test in the existing top-level `describe('BoardroomChatView', ...)`
block, mirroring the exact render/composer/send sequence the file's own
"shows a mentioned-agent tag on a sent message that contains an @mention"
test (lines 85-97) already uses:

```jsx
  it('passes informedByMessageId through the @mention chain to addThreadMessage', async () => {
    const threadService = await import('../services/boardroomThreadService');
    const facilitator = await import('../services/boardroomFacilitatorService');
    facilitator.generateAgentResponse.mockResolvedValue({ ok: true, text: 'On it.' });

    const { BoardroomChatView } = await import('../components/BoardroomChatView');
    render(<BoardroomChatView />);

    fireEvent.change(screen.getByPlaceholderText(/new thread topic/i), { target: { value: 'Chain Test' } });
    fireEvent.click(screen.getByRole('button', { name: /new thread/i }));
    await screen.findByText('Chain Test');

    fireEvent.change(screen.getByPlaceholderText(/message the room/i), { target: { value: '@Hector please look at this' } });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('On it.');

    await waitFor(() => {
      const replyCall = threadService.addThreadMessage.mock.calls.find(
        ([args]) => args.speaker === 'hector' && args.kind === 'message'
      );
      expect(replyCall).toBeDefined();
      expect(replyCall[0].informedByMessageId).toBeDefined();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/boardroomChatView.test.jsx -t "informedByMessageId"`
Expected: FAIL — `informedByMessageId` is `undefined` on the call

- [ ] **Step 3: Thread `previousMessageId` through `handleSend`'s chain loop**

In `src/components/BoardroomChatView.tsx`, inside `handleSend()`:

Change the initial user-message call (around line 183):

```tsx
    addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
```

to:

```tsx
    const userMessage = addThreadMessage({ threadId: activeThreadId, speaker: composerSpeaker, content: text });
    let previousMessageId: string | undefined = userMessage?.id;
```

Change the chained-reply call (around line 257) — add `informedByMessageId`:

```tsx
      addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined
      });
```

to:

```tsx
      const replyMessage = addThreadMessage({
        threadId: activeThreadId,
        speaker: agentId,
        content: replyText,
        kind: result.ok ? 'message' : 'failure',
        retryContext: result.ok ? undefined : text,
        model: result.ok ? result.model : undefined,
        latencyMs: result.ok ? result.latencyMs : undefined,
        informedByMessageId: previousMessageId
      });
```

Then, in the `if (result.ok) { ... }` block directly below that call (around
line 268-280, where `chainedMentions` is computed and pushed), add a line to
advance `previousMessageId` to the just-created reply so the *next* hop in the
chain links to *this* reply, not the original message:

```tsx
      if (result.ok) {
        previousMessageId = replyMessage?.id;
        if (detectLowConfidence(replyText)) {
```

(This inserts `previousMessageId = replyMessage?.id;` as the first line inside
the existing `if (result.ok) {` block — the rest of that block, including the
`detectLowConfidence` check and `chainedMentions` push, stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/boardroomChatView.test.jsx`
Expected: all tests in the file PASS (pre-existing + the new one)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/BoardroomChatView.tsx src/test/boardroomChatView.test.jsx
git commit -m "feat(memory-graph): thread informedByMessageId through Boardroom's @mention chain loop"
```

---

## Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full Rust test + lint suite**

Run (from `src-tauri/`):
```bash
cargo check
cargo test
cargo clippy -- -D warnings
cargo fmt --all -- --check
```
Expected: all green.

- [ ] **Step 2: Run the affected JS/TS test files together**

Run:
```bash
npx vitest run src/test/services/memoryGraphService.test.ts src/test/unifiedMemoryService.test.js src/test/services/boardroomThreadService.test.ts src/test/boardroomChatView.test.jsx
```
Expected: all green.

- [ ] **Step 3: Full typecheck and lint**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: 0 errors, 0 new lint warnings.

- [ ] **Step 4: Update CLAUDE.md's "Do Not Duplicate" table**

Add a row for the new service (this repo's `verify:dnd-coverage` CI check is
now blocking — an undocumented new service file fails CI):

```
| Memory knowledge graph service | `src/services/memoryGraphService.ts` — Phase 1 relationship layer over `memory_nodes`/`memory_edges` SQLite tables (`src-tauri/src/memory_graph.rs`). `addNode`/`addEdge`/`queryRelated` (one-hop only in Phase 1). Writers (Phase 1, exactly two): `unifiedMemoryService.js`'s `pushMemory` and `boardroomThreadService.ts`'s `addThreadMessage`. Read access (`queryRelated`) is open to every agent regardless of writer count. See `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md` for the full design and roadmap. |
```

Run `npm run verify:dnd-coverage` to confirm it passes clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document memoryGraphService.ts in the Do Not Duplicate table"
```
