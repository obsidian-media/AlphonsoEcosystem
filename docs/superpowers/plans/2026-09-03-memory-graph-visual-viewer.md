# Memory Knowledge Graph — Visual Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, whole-graph 3D visualization of the memory knowledge graph, per `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-visual-viewer-design.md`.

**Architecture:** New Rust commands (`memory_graph_list_nodes`/`memory_graph_list_edges`, capped 500/1000) give the frontend a way to fetch the whole graph for the first time — every existing query starts from one node. A new `MemoryGraphViewer.tsx` component renders it with `react-force-graph-3d` (WebGL, real rotation — a deliberate departure from this app's usual hand-rolled-SVG convention), in `compact` (inline, Settings) or `full` (modal) size modes. Clicking a node opens a detail panel that reuses the existing one-hop `queryRelated` to list and navigate connections.

**Tech Stack:** Rust (`rusqlite`), TypeScript/React, `react-force-graph-3d` (new dependency), Vitest, `@testing-library/react`.

---

## Task 1: Rust — `memory_graph_list_nodes` / `memory_graph_list_edges`

**Files:**
- Modify: `src-tauri/src/memory_graph.rs`

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `src-tauri/src/memory_graph.rs`:

```rust
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
    assert_eq!(ids, vec!["memory_item:c".to_string(), "memory_item:b".to_string()], "limit 2, newest first");
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
    assert_eq!(ids, vec!["edge-c".to_string(), "edge-b".to_string()], "limit 2, newest first");
  }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test memory_graph::tests::list_nodes memory_graph::tests::list_edges`
Expected: FAIL with `cannot find function list_nodes_sql` / `list_edges_sql`

- [ ] **Step 3: Add `GraphNodeRow` and the two list functions/commands**

Add to `src-tauri/src/memory_graph.rs`, after `memory_graph_query_related_deep`:

```rust
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
pub fn memory_graph_list_nodes(app: tauri::AppHandle, limit: i64) -> Result<Vec<GraphNodeRow>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  list_nodes_sql(&conn, limit)
}

#[tauri::command]
pub fn memory_graph_list_edges(app: tauri::AppHandle, limit: i64) -> Result<Vec<GraphEdgeRow>, String> {
  let (conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;
  list_edges_sql(&conn, limit)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test memory_graph::tests::list_nodes memory_graph::tests::list_edges`
Expected: 3 tests passing

- [ ] **Step 5: Register both commands in `lib.rs`**

In `src-tauri/src/lib.rs`, change:

```rust
pub(crate) use memory_graph::{
  memory_graph_add_edge, memory_graph_add_node, memory_graph_query_related,
  memory_graph_query_related_deep,
};
```

to:

```rust
pub(crate) use memory_graph::{
  memory_graph_add_edge, memory_graph_add_node, memory_graph_list_edges, memory_graph_list_nodes,
  memory_graph_query_related, memory_graph_query_related_deep,
};
```

Find the `invoke_handler(tauri::generate_handler![` list and add `memory_graph_list_nodes,` and
`memory_graph_list_edges,` right after `memory_graph_query_related_deep,`.

- [ ] **Step 6: Verify the crate compiles, clippy is clean, fmt is clean**

Run (from `src-tauri/`):
```bash
cargo check
cargo clippy -- -D warnings
cargo fmt --all -- --check
```
Expected: no errors, no warnings. If `cargo fmt --all -- --check` reports a diff, run `cargo fmt --all` and re-check (this has happened on every prior task in this project — always check).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/memory_graph.rs src-tauri/src/lib.rs
git commit -m "feat(memory-graph): add memory_graph_list_nodes/list_edges (whole-graph enumeration, capped)"
```

---

## Task 2: TypeScript — `listAllNodes` / `listAllEdges`

**Files:**
- Modify: `src/services/memoryGraphService.ts`
- Test: `src/test/services/memoryGraphService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/services/memoryGraphService.test.ts`, as a new `describe` block inside the outer `describe('memoryGraphService', ...)`, after the existing `describe('queryRelatedDeep', ...)` block:

```ts
  describe('listAllNodes', () => {
    it('returns the nodes array from the backend', async () => {
      const nodes = [{ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 123 }];
      invoke.mockResolvedValue(nodes);
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual(nodes);
      expect(invoke).toHaveBeenCalledWith('memory_graph_list_nodes', { limit: 500 });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { listAllNodes } = await import('../../services/memoryGraphService');
      const result = await listAllNodes(500);
      expect(result).toEqual([]);
    });
  });

  describe('listAllEdges', () => {
    it('returns the edges array from the backend', async () => {
      const edges = [{
        id: 'edge-1', fromNodeId: 'a', toNodeId: 'b', edgeType: 'mentions',
        confidence: 'verified', createdBy: 'jose', createdEvent: null, createdAtMs: 123
      }];
      invoke.mockResolvedValue(edges);
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual(edges);
      expect(invoke).toHaveBeenCalledWith('memory_graph_list_edges', { limit: 1000 });
    });

    it('returns an empty array instead of throwing when invoke fails', async () => {
      invoke.mockRejectedValue(new Error('not in tauri'));
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual([]);
    });

    it('returns an empty array if the backend returns something non-array', async () => {
      invoke.mockResolvedValue(null);
      const { listAllEdges } = await import('../../services/memoryGraphService');
      const result = await listAllEdges(1000);
      expect(result).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts -t "listAll"`
Expected: FAIL — `listAllNodes is not a function` / `listAllEdges is not a function`

- [ ] **Step 3: Add `GraphNode`, `listAllNodes`, and `listAllEdges`**

In `src/services/memoryGraphService.ts`, add after the `GraphEdgeWithDepth` interface:

```ts
export interface GraphNode {
  id: string;
  nodeType: string;
  refId: string;
  createdAtMs: number;
}
```

Add at the end of the file, after `queryRelatedDeep`:

```ts
/**
 * Fetches up to `limit` nodes, most recently created first. Every other
 * query function in this file starts from a single node id -- this and
 * `listAllEdges` are the only way to see the whole graph.
 */
export async function listAllNodes(limit: number): Promise<GraphNode[]> {
  try {
    const rows = await invoke<GraphNode[]>('memory_graph_list_nodes', { limit });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Fetches up to `limit` edges, most recently created first.
 */
export async function listAllEdges(limit: number): Promise<GraphEdge[]> {
  try {
    const rows = await invoke<GraphEdge[]>('memory_graph_list_edges', { limit });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/services/memoryGraphService.test.ts`
Expected: all tests in the file PASS (11 pre-existing + 6 new = 17)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/services/memoryGraphService.ts src/test/services/memoryGraphService.test.ts
git commit -m "feat(memory-graph): add listAllNodes/listAllEdges"
```

---

## Task 3: Add `react-force-graph-3d` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run: `npm install react-force-graph-3d@^1.29.1`
Expected: `package.json`'s `dependencies` gains `"react-force-graph-3d": "^1.29.1"`, `package-lock.json` updates accordingly.

- [ ] **Step 2: Verify the install didn't break anything**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, 0 new lint warnings.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(memory-graph): add react-force-graph-3d dependency"
```

---

## Task 4: `Modal.tsx` — add a `full` size variant

**Files:**
- Modify: `src/components/ui/Modal.tsx`
- Test: `src/test/ui/Modal.test.tsx` (create if it does not already exist — check first)

The 3D graph viewer needs real screen space to be worth rendering (rotating/
zooming in a `max-w-2xl` box would undersell it) — none of Modal's existing
`sm`/`md`/`lg` sizes provide that. Extending the primitive's own size map is
the correct fix, not building a second modal mechanism for this one case.

- [ ] **Step 1: Check whether `src/test/ui/Modal.test.tsx` already exists**

Run: `ls src/test/ui/Modal.test.tsx 2>&1 || echo "does not exist"`

If it exists, read it first and add the new test into its existing
structure using its established conventions. If it does not exist, create
it fresh with just this one test (do not attempt to cover every existing
Modal behavior retroactively — that's out of scope for this task):

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from '../../components/ui/Modal';

describe('Modal size="full"', () => {
  it('renders without the max-w constraint classes used by sm/md/lg', () => {
    render(
      <Modal open onClose={() => {}} size="full" title="Test">
        <div>content</div>
      </Modal>
    );
    const dialog = screen.getByText('Test').closest('div.relative');
    expect(dialog?.className).not.toMatch(/max-w-(sm|lg|2xl)/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/ui/Modal.test.tsx`
Expected: FAIL — TypeScript error or runtime error, since `size="full"` is not
a valid `ModalProps['size']` value yet and `sizeClasses` has no `full` key
(an unrecognized key falls through to `undefined`, which does not match the
"not `max-w-*`" assertion cleanly — this will fail rather than silently pass).

- [ ] **Step 3: Add the `full` size variant**

In `src/components/ui/Modal.tsx`, change:

```tsx
interface ModalProps { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; }
const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
```

to:

```tsx
interface ModalProps { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'full'; }
const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', full: 'max-w-[95vw] h-[90vh]' };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/ui/Modal.test.tsx`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx src/test/ui/Modal.test.tsx
git commit -m "feat(ui): add Modal size=\"full\" variant for the memory graph viewer"
```

---

## Task 5: `MemoryGraphViewer.tsx` — data fetching and empty state

**Files:**
- Create: `src/components/MemoryGraphViewer.tsx`
- Test: `src/test/memoryGraphViewer.test.tsx`

This task builds the component's data-fetching shell and empty state.
`react-force-graph-3d`'s actual WebGL rendering is not meaningfully
unit-testable (per the spec) — this and the following tasks mock
`react-force-graph-3d` itself and test the data flow and interaction logic
around it, not the rendering.

- [ ] **Step 1: Write the failing tests**

Create `src/test/memoryGraphViewer.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockForceGraph3D = vi.fn((props: any) => (
  <div data-testid="force-graph-3d" data-graph-data={JSON.stringify(props.graphData)} />
));

vi.mock('react-force-graph-3d', () => ({
  default: (props: any) => mockForceGraph3D(props)
}));

vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn()
}));

import { listAllNodes, listAllEdges } from '../services/memoryGraphService';
import { MemoryGraphViewer } from '../components/MemoryGraphViewer';

describe('MemoryGraphViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when there are no nodes', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    expect(await screen.findByText(/no memory graph data yet/i)).toBeInTheDocument();
  });

  it('fetches nodes and edges on mount and passes them to ForceGraph3D', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([
      { id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'memory_item:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(screen.getByTestId('force-graph-3d')).toBeInTheDocument());
    const graphData = JSON.parse(screen.getByTestId('force-graph-3d').getAttribute('data-graph-data') || '{}');
    expect(graphData.nodes).toHaveLength(2);
    expect(graphData.links).toEqual([
      { source: 'memory_item:a', target: 'memory_item:b', id: 'edge-1', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);
  });

  it('requests 500 nodes and 1000 edges', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(listAllNodes).toHaveBeenCalledWith(500));
    expect(listAllEdges).toHaveBeenCalledWith(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: FAIL — `Cannot find module '../components/MemoryGraphViewer'`

- [ ] **Step 3: Write the component's data-fetching shell**

Create `src/components/MemoryGraphViewer.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { listAllNodes, listAllEdges, type GraphNode, type GraphEdge } from '../services/memoryGraphService';

const NODE_LIMIT = 500;
const EDGE_LIMIT = 1000;

interface MemoryGraphViewerProps {
  size: 'compact' | 'full';
}

interface ForceGraphNode {
  id: string;
  nodeType: string;
  refId: string;
  createdAtMs: number;
}

interface ForceGraphLink {
  source: string;
  target: string;
  id: string;
  edgeType: string;
  confidence: string;
  createdBy: string;
  createdEvent: string | null;
  createdAtMs: number;
}

function toGraphData(nodes: GraphNode[], edges: GraphEdge[]): { nodes: ForceGraphNode[]; links: ForceGraphLink[] } {
  return {
    nodes: nodes.map((n) => ({ id: n.id, nodeType: n.nodeType, refId: n.refId, createdAtMs: n.createdAtMs })),
    links: edges.map((e) => ({
      source: e.fromNodeId,
      target: e.toNodeId,
      id: e.id,
      edgeType: e.edgeType,
      confidence: e.confidence,
      createdBy: e.createdBy,
      createdEvent: e.createdEvent,
      createdAtMs: e.createdAtMs
    }))
  };
}

export function MemoryGraphViewer({ size }: MemoryGraphViewerProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listAllNodes(NODE_LIMIT), listAllEdges(EDGE_LIMIT)]).then(([nodeRows, edgeRows]) => {
      if (cancelled) return;
      setNodes(nodeRows);
      setEdges(edgeRows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (!loading && nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-[var(--text-3)]">
        No memory graph data yet.
      </div>
    );
  }

  const graphData = toGraphData(nodes, edges);
  const height = size === 'full' ? window.innerHeight * 0.8 : 240;

  return (
    <div className={size === 'full' ? 'h-full w-full' : 'h-60 w-full'}>
      <ForceGraph3D graphData={graphData} height={height} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: all 3 tests PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/MemoryGraphViewer.tsx src/test/memoryGraphViewer.test.tsx
git commit -m "feat(memory-graph): add MemoryGraphViewer data-fetching shell + empty state"
```

---

## Task 6: `MemoryGraphViewer.tsx` — node coloring by type

**Files:**
- Modify: `src/components/MemoryGraphViewer.tsx`
- Test: `src/test/memoryGraphViewer.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/test/memoryGraphViewer.test.tsx`, inside the existing `describe('MemoryGraphViewer', ...)` block:

```tsx
  it('colors nodes by node type, with a fallback for unmapped types', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'research_report:b', nodeType: 'research_report', refId: 'b', createdAtMs: 100 },
      { id: 'mystery:c', nodeType: 'some_future_type', refId: 'c', createdAtMs: 100 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);

    render(<MemoryGraphViewer size="compact" />);

    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());
    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    expect(typeof props.nodeColor).toBe('function');
    expect(props.nodeColor({ nodeType: 'memory_item' })).toBe(NODE_TYPE_COLORS.memory_item);
    expect(props.nodeColor({ nodeType: 'research_report' })).toBe(NODE_TYPE_COLORS.research_report);
    expect(props.nodeColor({ nodeType: 'some_future_type' })).toBe(NODE_TYPE_COLORS.default);
  });
```

Add the import at the top of the test file, alongside the existing named imports:

```tsx
import { MemoryGraphViewer, NODE_TYPE_COLORS } from '../components/MemoryGraphViewer';
```

(Replace the existing `import { MemoryGraphViewer } from '../components/MemoryGraphViewer';` line with this one — `NODE_TYPE_COLORS` needs to be exported for the test to reference the real color values instead of hardcoding a second copy of them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx -t "colors nodes"`
Expected: FAIL — `NODE_TYPE_COLORS` is not exported, `props.nodeColor` is `undefined`

- [ ] **Step 3: Add `NODE_TYPE_COLORS` and the `nodeColor` prop**

In `src/components/MemoryGraphViewer.tsx`, add after the `EDGE_LIMIT` constant:

```tsx
export const NODE_TYPE_COLORS: Record<string, string> = {
  memory_item: '#6366f1',
  boardroom_message: '#f59e0b',
  research_report: '#06b6d4',
  source: '#84cc16',
  receipt: '#ec4899',
  packet: '#8b5cf6',
  default: '#71717a'
};

function colorForNodeType(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] || NODE_TYPE_COLORS.default;
}
```

Change the `<ForceGraph3D graphData={graphData} height={height} />` line to:

```tsx
      <ForceGraph3D
        graphData={graphData}
        height={height}
        nodeColor={(node: ForceGraphNode) => colorForNodeType(node.nodeType)}
      />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: all 4 tests PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/MemoryGraphViewer.tsx src/test/memoryGraphViewer.test.tsx
git commit -m "feat(memory-graph): color MemoryGraphViewer nodes by node_type"
```

---

## Task 7: `MemoryGraphViewer.tsx` — click-to-select detail panel with connection navigation

**Files:**
- Modify: `src/components/MemoryGraphViewer.tsx`
- Test: `src/test/memoryGraphViewer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/memoryGraphViewer.test.tsx`, inside `describe('MemoryGraphViewer', ...)`:

```tsx
  it('opens a detail panel with the node fields and its direct connections when a node is clicked', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'memory_item:b', nodeType: 'memory_item', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(queryRelated).mockResolvedValue([
      { id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'memory_item:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }
    ]);

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());

    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    props.onNodeClick({ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 });

    expect(await screen.findByText('memory_item')).toBeInTheDocument();
    expect(await screen.findByText(/mentions/i)).toBeInTheDocument();
    expect(queryRelated).toHaveBeenCalledWith('memory_item:a');
  });

  it('selects the other node when a listed connection is clicked, without re-fetching graph data', async () => {
    vi.mocked(listAllNodes).mockResolvedValue([
      { id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 },
      { id: 'research_report:b', nodeType: 'research_report', refId: 'b', createdAtMs: 200 }
    ]);
    vi.mocked(listAllEdges).mockResolvedValue([]);
    vi.mocked(queryRelated).mockImplementation(async (nodeId: string) => {
      if (nodeId === 'memory_item:a') {
        return [{ id: 'edge-1', fromNodeId: 'memory_item:a', toNodeId: 'research_report:b', edgeType: 'mentions', confidence: 'verified', createdBy: 'echo', createdEvent: null, createdAtMs: 150 }];
      }
      return [];
    });

    render(<MemoryGraphViewer size="compact" />);
    await waitFor(() => expect(mockForceGraph3D).toHaveBeenCalled());

    const props = mockForceGraph3D.mock.calls[mockForceGraph3D.mock.calls.length - 1][0];
    props.onNodeClick({ id: 'memory_item:a', nodeType: 'memory_item', refId: 'a', createdAtMs: 100 });
    await screen.findByText(/mentions/i);

    const connectionButton = await screen.findByRole('button', { name: /research_report:b/i });
    connectionButton.click();

    expect(await screen.findByText('research_report')).toBeInTheDocument();
    expect(listAllNodes).toHaveBeenCalledTimes(1);
    expect(listAllEdges).toHaveBeenCalledTimes(1);
  });
```

Add `queryRelated` to the mocked import at the top of the test file — change:

```tsx
vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn()
}));

import { listAllNodes, listAllEdges } from '../services/memoryGraphService';
```

to:

```tsx
vi.mock('../services/memoryGraphService', () => ({
  listAllNodes: vi.fn(),
  listAllEdges: vi.fn(),
  queryRelated: vi.fn()
}));

import { listAllNodes, listAllEdges, queryRelated } from '../services/memoryGraphService';
```

(The mock already declared `queryRelated: vi.fn()` in Task 5 — this just also imports it into the test file so these two new tests can call `vi.mocked(queryRelated)`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx -t "detail panel"`
Expected: FAIL — `props.onNodeClick` is `undefined`, no detail panel renders

- [ ] **Step 3: Add selection state, the detail panel, and connection navigation**

In `src/components/MemoryGraphViewer.tsx`, add the import:

```tsx
import { listAllNodes, listAllEdges, queryRelated, type GraphNode, type GraphEdge } from '../services/memoryGraphService';
```

Add state and a fetch-on-select effect inside the component, after the existing `useEffect`:

```tsx
  const [selectedNode, setSelectedNode] = useState<ForceGraphNode | null>(null);
  const [connections, setConnections] = useState<GraphEdge[]>([]);

  useEffect(() => {
    if (!selectedNode) {
      setConnections([]);
      return;
    }
    let cancelled = false;
    queryRelated(selectedNode.id).then((edges) => {
      if (!cancelled) setConnections(edges);
    });
    return () => { cancelled = true; };
  }, [selectedNode]);

  function selectNodeById(nodeId: string) {
    const found = nodes.find((n) => n.id === nodeId);
    if (found) setSelectedNode({ id: found.id, nodeType: found.nodeType, refId: found.refId, createdAtMs: found.createdAtMs });
  }
```

Replace the component's return statement (the one Task 6 last modified —
still just a `<div>` wrapping `<ForceGraph3D>`, no click handler or detail
panel yet) with this full version, which adds `onNodeClick` to
`ForceGraph3D` **and** the detail panel in one change:

```tsx
  return (
    <div className={size === 'full' ? 'h-full w-full flex gap-4' : 'h-60 w-full flex gap-4'}>
      <div className={size === 'full' ? 'flex-1' : 'flex-1 h-60'}>
        <ForceGraph3D
          graphData={graphData}
          height={height}
          nodeColor={(node: ForceGraphNode) => colorForNodeType(node.nodeType)}
          onNodeClick={(node: ForceGraphNode) => setSelectedNode(node)}
        />
      </div>
      {selectedNode && (
        <div className="w-56 shrink-0 overflow-y-auto text-sm text-[var(--text-2)] space-y-2">
          <p className="font-semibold">{selectedNode.nodeType}</p>
          <p className="text-xs text-[var(--text-3)]">{selectedNode.refId}</p>
          <p className="text-xs text-[var(--text-3)]">{new Date(selectedNode.createdAtMs).toLocaleString()}</p>
          <div className="pt-2 border-t border-[var(--border)] space-y-1">
            <p className="section-label">Connections</p>
            {connections.length === 0 && <p className="text-xs text-[var(--text-3)]">None</p>}
            {connections.map((edge) => {
              const otherId = edge.fromNodeId === selectedNode.id ? edge.toNodeId : edge.fromNodeId;
              return (
                <button
                  key={edge.id}
                  onClick={() => selectNodeById(otherId)}
                  className="block w-full text-left text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
                >
                  {edge.edgeType} → {otherId}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
```

This replaces the component's return statement as it stood after Task 6
(a `<div>` wrapping `<ForceGraph3D>` with `nodeColor` but no click handler)
— the empty-state `return` earlier in the function is unaffected.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/memoryGraphViewer.test.tsx`
Expected: all 6 tests PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/MemoryGraphViewer.tsx src/test/memoryGraphViewer.test.tsx
git commit -m "feat(memory-graph): add click-to-select detail panel with connection navigation"
```

---

## Task 8: Wire into `SettingsView.tsx` and `RightPanel.tsx`

**Files:**
- Modify: `src/components/SettingsView.tsx:1443-1447`
- Modify: `src/components/RightPanel.tsx`

- [ ] **Step 1: Add the compact viewer to `SettingsView.tsx`'s memory section**

In `src/components/SettingsView.tsx`, find the import block near the top of the
file and add:

```tsx
import { MemoryGraphViewer } from './MemoryGraphViewer';
```

Find this existing section (around line 1443):

```tsx
      <section className="space-y-4">
        <SectionHeader icon={Activity} label="Echo Memory Timeline" />
        <ChromaDbStatus />
        <EchoTimeline />
      </section>
```

Add a new section directly after it:

```tsx
      <section className="space-y-4">
        <SectionHeader icon={Activity} label="Echo Memory Timeline" />
        <ChromaDbStatus />
        <EchoTimeline />
      </section>
      <section className="space-y-4">
        <SectionHeader icon={Database} label="Memory Knowledge Graph" />
        <MemoryGraphViewer size="compact" />
        <button
          onClick={() => setGraphModalOpen(true)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          Expand to fullscreen →
        </button>
      </section>
```

Add the modal state near the top of the `SettingsView` component function
(alongside its other `useState` declarations):

```tsx
  const [graphModalOpen, setGraphModalOpen] = useState(false);
```

Add the `Modal` import at the top of the file:

```tsx
import { Modal } from './ui/Modal';
```

`SettingsView`'s own closing brace is at line 1586, right after its final
returned JSX (verified directly — `PluginMarketplacePanel`, a separate
component, starts at line 1588). The exact end of the function currently
reads:

```tsx
      <AccBridgeSettings />
      <McpServerInfo />
    </div>
  )}
      </div>
    </div>
  );
}
```

Change it to add the modal as a sibling just before the final `</div>` /
`);`:

```tsx
      <AccBridgeSettings />
      <McpServerInfo />
    </div>
  )}
      </div>
      <Modal open={graphModalOpen} onClose={() => setGraphModalOpen(false)} size="full" title="Memory Knowledge Graph">
        <MemoryGraphViewer size="full" />
      </Modal>
    </div>
  );
}
```

(This overlays regardless of which settings section is currently active,
since it's a sibling of the tab content rather than nested inside any one
section's conditional block.)

- [ ] **Step 2: Verify the app still builds and typechecks**

Run: `npx tsc --noEmit`
Expected: 0 errors. Both `Database` and `Activity` are already present in
`SettingsView.tsx`'s existing `lucide-react` import line (verified directly,
not assumed) — no icon-import change needed for this step.

- [ ] **Step 3: Add the entry-point link to `RightPanel.tsx`**

In `src/components/RightPanel.tsx`, add to the existing `lucide-react` import
line (currently `import { Activity, Bot, ChevronLeft, ChevronRight, Cpu, RefreshCw, Shield } from 'lucide-react';`):

```tsx
import { Activity, Bot, ChevronLeft, ChevronRight, Cpu, Network, RefreshCw, Shield } from 'lucide-react';
```

Add these imports alongside the existing component imports:

```tsx
import { MemoryGraphViewer } from './MemoryGraphViewer';
import { Modal } from './ui/Modal';
```

Add state near the component's other `useState` declarations:

```tsx
  const [graphModalOpen, setGraphModalOpen] = useState(false);
```

Find the Security section (around line 295-299, the `<div className="mt-3 pt-3 border-t ...">` containing the "Security" `section-label`) and add a new block directly after it, still inside the `{activeTab === 'system' && (` branch:

```tsx
          <div className="mt-3 pt-3 border-t border-[var(--border)] px-3">
            <button
              onClick={() => setGraphModalOpen(true)}
              className="flex items-center gap-2 text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
            >
              <Network className="w-3.5 h-3.5" />
              View memory graph →
            </button>
          </div>
```

`RightPanel`'s entire return value is one `<aside>...</aside>` (verified
directly — the component runs from line 122 to the file's end at line 407).
The exact end currently reads:

```tsx
      {activeTab === 'agents' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <AgentDock companions={(agentDockCompanions as never[]) ?? []} embedded />
          <div className="border-t border-[var(--border)] pt-3">
            <p className="section-label mb-2">Live Activity</p>
            <AgentStatusStrip useAutoFeed compact={false} />
          </div>
        </div>
      )}
    </aside>
  );
}
```

The modal must render as a **sibling of `<aside>`**, not inside it (it's a
fixed-position overlay, not part of the sidebar's own layout box). Change
the component's return statement to wrap `<aside>` and `<Modal>` in a
fragment:

```tsx
      {activeTab === 'agents' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <AgentDock companions={(agentDockCompanions as never[]) ?? []} embedded />
          <div className="border-t border-[var(--border)] pt-3">
            <p className="section-label mb-2">Live Activity</p>
            <AgentStatusStrip useAutoFeed compact={false} />
          </div>
        </div>
      )}
    </aside>
    <Modal open={graphModalOpen} onClose={() => setGraphModalOpen(false)} size="full" title="Memory Knowledge Graph">
      <MemoryGraphViewer size="full" />
    </Modal>
    </>
  );
}
```

This second change also requires wrapping the **start** of the return
statement in the same fragment. `RightPanel`'s return statement is at line
235, currently:

```tsx
  return (
    <aside className="w-72 bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden">
```

Change to:

```tsx
  return (
    <>
    <aside className="w-72 bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden">
```

matching the closing `</>` added at the end of the return statement above.

- [ ] **Step 4: Verify the app still builds and typechecks**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errors, 0 new lint warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsView.tsx src/components/RightPanel.tsx
git commit -m "feat(memory-graph): wire MemoryGraphViewer into SettingsView (compact) and RightPanel (link to full)"
```

---

## Task 9: Full verification pass + docs

**Files:**
- Modify: `CLAUDE.md` (add a new "Do Not Duplicate" row)

- [ ] **Step 1: Run the full Rust test + lint suite**

Run (from `src-tauri/`):
```bash
cargo check
cargo test
cargo clippy -- -D warnings
cargo fmt --all -- --check
```
Expected: all green. If the full `cargo test` gets killed mid-compile on this
dev machine (the same pre-existing environment constraint hit on every prior
task in this project), fall back to `cargo test memory_graph::` plus the
whole-crate `clippy`/`fmt` checks, and let CI confirm the full suite — same
pattern as every previous phase.

- [ ] **Step 2: Run the affected JS/TS test files together**

Run:
```bash
npx vitest run src/test/services/memoryGraphService.test.ts src/test/memoryGraphViewer.test.tsx src/test/ui/Modal.test.tsx
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
Expected: clean, or report exactly which counts it flags as stale (the new
Rust commands/tests will likely shift the Tauri-command-count and
unit-test-count claims in README.md/ARCHITECTURE.md/AGENTS.md, same as every
prior phase) — fix each flagged line to the number the script reports as
correct, then re-run until clean.

- [ ] **Step 5: Add a CLAUDE.md "Do Not Duplicate" row**

Find the existing "Memory knowledge graph service" row in CLAUDE.md and add
a new row directly after it:

```
| Memory graph visual viewer | `src/components/MemoryGraphViewer.tsx` — 3D force-directed graph (`react-force-graph-3d`) over the whole memory knowledge graph (`listAllNodes`/`listAllEdges`, capped 500/1000). `compact`/`full` size modes, one component not two renderers — compact lives in `SettingsView.tsx`'s Memory section next to `EchoTimeline`, full opens in `Modal`'s new `size="full"` variant, reachable from both `SettingsView.tsx` and `RightPanel.tsx`. Nodes colored by `node_type` (`NODE_TYPE_COLORS`), not by agent — `memory_nodes` has no `created_by` field, only edges do. Clicking a node opens a detail panel listing its direct connections (via the existing one-hop `queryRelated`), clicking a listed connection selects that node without re-fetching graph data. See `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-visual-viewer-design.md`. |
```

Run `npm run verify:dnd-coverage` to confirm it still passes clean.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md ARCHITECTURE.md AGENTS.md
git commit -m "docs: document MemoryGraphViewer in the Do Not Duplicate table, refresh doc counts"
```
