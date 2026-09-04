# Memory Knowledge Graph — Visual Viewer Design Spec

**Date:** 2026-09-03
**Status:** Approved for planning (pending user sign-off on this doc)
**Owner:** Echo (data), new component ownership TBD at planning time
**Depends on:** Phase 1 + Phase 2 of the memory knowledge graph, both merged to `main`

## Problem

Phase 1 and Phase 2 built a real, populated graph — 6 node types
(`memory_item`, `boardroom_message`, `research_report`, `source`,
`receipt`, `packet`), 5 writers, one-hop and multi-hop query capability —
but nothing renders it. The graph is only inspectable by calling
`queryRelated`/`queryRelatedDeep` from code. This spec covers the visual
viewer half of the originally-scoped "Phase 3 (Intelligence &
Visualization)" — the automated/inferred-edges half was split out as its
own separate spec/plan cycle during brainstorming, since the two are
independent subsystems (one is backend/algorithm, one is pure frontend,
neither depends on the other existing first).

## Goals

- A real, whole-graph 3D visualization the user can rotate/zoom/explore.
- Click a node to see what it is and navigate its direct connections.
- Reachable from two places without building two graph renderers.

## Non-goals (explicitly deferred, not forgotten)

- Node-type filtering (toggle visibility per type) — deferred to a later
  pass once real usage shows whether the graph actually gets too noisy to
  read at its current small size. Revisit once density is a real problem,
  not a guessed one.
- Coloring nodes by authoring agent — the schema doesn't support it
  (`memory_nodes` has no `created_by`; only `memory_edges` does). Resolved
  during brainstorming: color by `node_type` instead, which needs no schema
  change and is arguably a clearer signal anyway ("what kind of thing is
  this" vs. "which agent touched it").
- Automated/inferred edge suggestion — the other half of the original
  Phase 3 scope, its own separate spec.
- Retention/pruning of the graph itself — still Phase 4, not built.

## Architecture

### New backend capability: list-everything queries

Every existing query function (`queryRelated`, `queryRelatedDeep`) starts
from a single node id. A whole-graph viewer needs to enumerate everything,
which nothing today provides. New Rust commands in
`src-tauri/src/memory_graph.rs`:

```rust
memory_graph_list_nodes(app, limit: i64) -> Result<Vec<GraphNodeRow>, String>
memory_graph_list_edges(app, limit: i64) -> Result<Vec<GraphEdgeRow>, String>
```

`GraphNodeRow` is a new struct (`id`, `nodeType`, `refId`, `createdAtMs`) —
`memory_nodes`' columns don't currently have a row-returning query at all;
only `memory_graph_add_node` writes to it. `GraphEdgeRow` already exists
(Phase 1) and is reused as-is.

**Capped, not unbounded** — matches this app's existing convention
(`crashLogService.js`/`agentAuditService.js` ring buffers capped at 100,
`orchestrationReceiptService.ts` capped at 3000) rather than retrofitting a
cap later once it's actually a problem. Concrete numbers: **500 nodes /
1000 edges**, most recently created first (`ORDER BY created_at DESC
LIMIT ?`). Chosen as a round, generous number for the current graph size
(5 writers, freshly populated) with real headroom before it matters —
not derived from a measured need, since there isn't one yet.

New TS functions in `memoryGraphService.ts`:

```ts
export interface GraphNode {
  id: string;
  nodeType: string;
  refId: string;
  createdAtMs: number;
}

export async function listAllNodes(limit: number): Promise<GraphNode[]>
export async function listAllEdges(limit: number): Promise<GraphEdge[]>
```

Same fail-soft convention as every other function in this file (`try`/
`catch` → empty array, never throws).

### New dependency: `react-force-graph-3d`

A real, deliberate departure from "hand-roll the SVG" (this app's usual
data-viz convention, e.g. `NovaHistoryChart.tsx`) — chosen explicitly
after comparing options during brainstorming. `react-force-graph-3d`
renders a WebGL 3D force-directed graph (physics-based layout, real
rotation/zoom) with far less code than hand-rolling both the physics
(`d3-force`) and a custom renderer would take, and produces the specific
visual style the user was after (rotating 3D node clusters), which a
hand-rolled 2D SVG version could not.

### Component: `MemoryGraphViewer.tsx`

One component, rendered in two contexts via a `size` prop:

```tsx
<MemoryGraphViewer size="compact" />   // inline preview, in Settings
<MemoryGraphViewer size="full" />      // fullscreen modal
```

- **`compact`**: fixed small height, inline in `SettingsView.tsx`'s
  Knowledge section, directly below the existing `<EchoTimeline />` (line
  ~1446) — same section, since both surfaces are "what does Alphonso
  remember." Includes an "Expand" button.
- **`full`**: rendered inside a fullscreen modal/overlay (reusing this
  app's existing `Modal` primitive from `src/components/ui/`, per
  CLAUDE.md's "Do Not Duplicate" entry for the shared UI kit — do not
  build a second modal mechanism). Opened by the compact view's "Expand"
  button, or directly via the `RightPanel` link below.

Both sizes fetch data the same way (`listAllNodes`/`listAllEdges` on
mount) and use the same click-to-select behavior — only the container
size and camera-control affordances differ.

### `RightPanel.tsx` entry point

A single link/button added to the existing `'system'` tab (where
`SentinelAllowlistPanel` and the Security section already live) —
`"View memory graph →"` — opens `MemoryGraphViewer` in `full` mode
directly. Not a second rendered graph; just a way in.

### Node coloring

By `node_type`, not by agent (see Non-goals). A `NODE_TYPE_COLORS` map,
one entry per the 6 current types, living in `MemoryGraphViewer.tsx`
itself (not `trustModel.ts` or `AgentActivityLog.tsx`'s `AGENT_COLORS` —
this is a different taxonomy, coloring *what kind of thing* a node is,
not *which agent* touched it, and conflating the two maps would be
confusing). New node types added by future writers get a fallback/default
color rather than crashing on an unmapped type.

### Click interaction

Clicking a node opens a detail panel (not just a tooltip) showing:
- `nodeType`, `refId`, `createdAtMs`.
- Its direct connections — calls `queryRelated(node.id)` (Phase 1's
  existing one-hop function, not `queryRelatedDeep`; one hop is enough
  for a "what's this connected to" glance) and lists each edge's type,
  direction, and the other endpoint.
- Clicking one of those listed connections **selects that node** in the
  already-rendered graph (highlights it, opens its own detail panel) —
  it does not re-fetch or re-render the graph, since the full capped
  graph is already loaded client-side. This keeps navigation instant and
  avoids a second data-fetching code path.

## Testing

- Rust: `memory_graph_list_nodes`/`memory_graph_list_edges` unit tests —
  respects `limit`, orders most-recent-first, empty table returns `[]`
  not an error.
- TS: `listAllNodes`/`listAllEdges` — same fail-soft pattern tests as
  every other `memoryGraphService.ts` function (mocked `invoke`,
  success/failure/non-array-response cases).
- Component: `MemoryGraphViewer.tsx` — renders with fetched data, clicking
  a node opens the detail panel with the right fields, clicking a listed
  connection selects that node, `compact`/`full` size prop changes
  container/controls as expected. `react-force-graph-3d`'s actual WebGL
  rendering is not meaningfully unit-testable — tests target the data
  flow and interaction logic around it, consistent with how this app
  already treats other canvas/WebGL-adjacent surfaces.

## Open Questions Deferred to Planning

- Exact `NODE_TYPE_COLORS` palette values (six real colors, ensuring
  contrast against both light/dark themes) — a design-polish detail, not
  an architecture decision.
- Whether `react-force-graph-3d`'s bundle size needs a dynamic
  `import()`/lazy-load treatment. Checked during self-review, not assumed:
  `App.tsx` lazy-loads its top-level views (confirmed via the existing
  `appLazyImports.test.js` regression test), but `SettingsView.tsx`'s
  internal sections do **not** lazy-load — `EchoTimeline` and everything
  else in that file loads eagerly as part of `SettingsView`'s own bundle.
  A WebGL library is a real bundle-size concern `EchoTimeline`-sized code
  isn't, so `MemoryGraphViewer.tsx` likely warrants becoming
  `SettingsView.tsx`'s first internally-lazy-loaded section rather than
  matching the file's current (fully eager) pattern — a real, scoped
  precedent-setting decision for planning to make deliberately, not
  default into.
