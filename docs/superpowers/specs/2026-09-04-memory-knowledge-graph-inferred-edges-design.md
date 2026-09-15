# Memory Knowledge Graph — Inferred Edges (Phase 3, second half)

## Context

Phases 1 (Foundation), 2 (Expansion), and Phase 3's visual viewer are all
merged to `main`. Five real writers (`unifiedMemoryService.js`,
`boardroomThreadService.ts`, `hectorResearchService.js`,
`orchestrationReceiptService.ts`, `mariaAuditService.ts`) write manual edges
only — each writer explicitly knows the edge it's creating. `queryRelated`/
`queryRelatedDeep` support one-hop and cycle-safe multi-hop reads, and
`MemoryGraphViewer.tsx` gives every user a browsable 3D view, reachable from
Settings and RightPanel.

The original roadmap (`docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md`)
described this remaining piece as: "Automated/inferred edge-suggestion turns
on, checked against the real graph built in Phases 1–2 rather than guessed
from nothing." This spec is that piece — the last deferred item of the
entire memory knowledge graph project.

**A grounding note on "real graph data":** this dev machine's local
`alphonso_memory.sqlite3` has no `memory_nodes`/`memory_edges` rows yet (the
tables are created lazily on first write, and this environment hasn't run
the live app enough to populate them). This design is grounded instead in
the actual node/edge *shapes* the 5 writers produce in code — node types
(`memory_item`, `boardroom_message`, `research_report`, `source`, `receipt`,
`packet`), edge types (`cites`, `informed_by`, `belongs_to`, `audits`,
`mentions`), and the fact that `memory_graph.rs`/`memoryGraphService.ts`
deliberately store only `{node_type, ref_id}` pairs — never raw content.
That last fact is the key architectural constraint this design respects.

## Decision: structural inference, not content-based

The graph layer was designed to never see content (see the original spec's
"Prior Art Considered" section — memory storage/semantic search stays with
`unifiedMemoryService.ts`/ChromaDB). Content-based inference (keyword/entity
matching across memory item text, research report bodies, etc.) would mean
reaching back into each writer's own storage — a real boundary crossing,
new complexity, likely a new text-similarity dependency.

**Decision: infer purely from the graph's own topology.** Two signals, both
plain SQL over the existing `memory_edges` table, no new data needed:

1. **Common-neighbor** (classic link prediction): nodes A and B aren't
   directly connected, but share a neighbor C (edges A→C and B→C, or any
   direction combination, both exist). Likely related.
2. **Shared-event**: two edges were created with the same non-null
   `created_event` value (e.g. two edges both stamped with the same
   `packetId`). Their *source* nodes are likely related even with no
   existing path between them.

Either signal alone is enough to produce a suggestion. Both are unioned,
deduplicated, and capped before writing.

## Decision: auto-write with INFERRED confidence, not a review queue

`TRUST_STATES.INFERRED` already exists in `trustModel.ts` and already has a
distinct color (blue) in `trustColor()`. Auto-writing suggested edges with
`confidence: 'inferred'` matches how trust is handled everywhere else in
this app — a label on the data, not a blocking approval gate. Building a
separate suggestion queue (pending table, approve/reject actions, review UI)
would be meaningfully more scope for a graph that's still modest in size,
and duplicates a trust-labeling mechanism that already exists.

## Decision: one bounded primitive, three callers

The user wants all three trigger modes (per-write, scheduled, on-demand)
rather than picking one. To keep the riskiest of the three (per-write) from
causing edge-spam, all three triggers call **the same bounded, atomic
primitive** with different scope and caps — there is no separate
implementation per trigger:

| Trigger | Scope | Cap | Cadence |
|---|---|---|---|
| Per-write | The 1-2 nodes just touched by `addNode`/`addEdge` | 5 new edges | Every write, fire-and-forget |
| Scheduled | Random batch of 20 nodes (no "processed" tracking — simplest thing that avoids runaway growth without new bookkeeping) | 20 new edges | Every 30 min |
| On-demand | Whatever's currently loaded in the viewer (already capped at 500 nodes by the existing viewer) | 50 new edges | User clicks "Suggest connections" |

## Architecture

One new Rust Tauri command, `memory_graph_infer_edges(scope_node_ids: Vec<String>, max_suggestions: i64)`,
does suggest-and-write as a single atomic operation inside one SQLite
transaction:

1. Run both SQL signals scoped to `scope_node_ids`.
2. Union the candidate `(from, to)` pairs.
3. Filter out any pair where a direct edge already exists in either
   direction, and any pair where `from == to`.
4. Truncate to `max_suggestions`.
5. Insert each surviving pair as `edge_type: 'related'`,
   `confidence: 'inferred'`, `created_by: 'system:inference'`,
   `created_event: NULL`.
6. Return the list of newly created edges.

Doing suggest-and-write atomically in one Rust command (rather than
"suggest in Rust, write via TS calling `addEdge` per suggestion") avoids a
race between two triggers firing near-simultaneously and both creating the
same edge — the per-write and scheduled triggers can plausibly overlap.

A single uniform `edge_type: 'related'` for all inferred edges (regardless
of which signal produced them) keeps this simple. `confidence: 'inferred'`
already carries the distinction that matters to a reader; recording which
signal fired would need a new column for no demonstrated benefit.

### Rust: `src-tauri/src/memory_graph.rs`

Both signals are built as dynamic SQL with one bound placeholder per scope
id (the standard rusqlite pattern for a variable-length `IN (...)` list —
`json_each` has no precedent anywhere in this codebase and bundled-SQLite
JSON1 availability isn't worth taking on faith; plain placeholder binding
needs no new capability and scope lists here are always small: 1-2, 20, or
at most 500 ids):

```rust
fn build_common_neighbor_sql(scope_len: usize) -> String {
  let placeholders: Vec<String> = (1..=scope_len).map(|i| format!("?{}", i)).collect();
  let list = placeholders.join(", ");
  format!(
    "SELECT DISTINCT e1.from_node_id AS a, e2.to_node_id AS b
     FROM memory_edges e1
     JOIN memory_edges e2 ON e1.to_node_id = e2.from_node_id
     WHERE e1.from_node_id != e2.to_node_id
       AND (e1.from_node_id IN ({list}) OR e2.to_node_id IN ({list}))"
  )
}

fn build_shared_event_sql(scope_len: usize) -> String {
  let placeholders: Vec<String> = (1..=scope_len).map(|i| format!("?{}", i)).collect();
  let list = placeholders.join(", ");
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
```

New function `memory_graph_infer_edges`, following this file's existing
synchronous, non-`async` command convention (see `memory_graph_add_edge`
above) and its existing `(Connection, PathBuf)`-tuple destructuring of
`open_memory_db`:

```rust
#[tauri::command]
pub fn memory_graph_infer_edges(
  app: tauri::AppHandle,
  scope_node_ids: Vec<String>,
  max_suggestions: i64,
) -> Result<Vec<GraphEdgeRow>, String> {
  let (mut conn, _) = crate::memory_store::open_memory_db(&app)?;
  ensure_memory_graph_tables(&conn)?;

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
    let params: Vec<&dyn rusqlite::ToSql> = scope_node_ids
      .iter()
      .chain(scope_node_ids.iter())
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
```

Notes matching this file's real, verified conventions (not assumptions):
`crate::now_ms()` (defined in `lib.rs:162`, not `utils.rs`'s separate
identical-but-distinct copy — `memory_graph_add_edge` already calls the
`lib.rs` one via the unqualified `crate::` path, so this matches existing
usage exactly). `open_memory_db` returns `Result<(Connection, PathBuf),
String>` already, so `?` propagates directly with no extra `.map_err`.
`conn.transaction()` (not `unchecked_transaction()`) matches the pattern
already used three times in `memory_store.rs`. The scope-id list is bound
twice per query (once for each `IN (...)` clause in the `OR`), so the
placeholder list is repeated in the params vec via `.chain()`.

### Rust: `src-tauri/src/lib.rs`

Register `memory_graph_infer_edges` in the `invoke_handler` list alongside
the other 6 `memory_graph_*` commands.

### TypeScript: `src/services/memoryGraphService.ts`

```ts
export async function inferEdges(
  scopeNodeIds: string[],
  maxSuggestions: number
): Promise<GraphEdge[]> {
  try {
    const result = await invoke<GraphEdge[]>('memory_graph_infer_edges', {
      scopeNodeIds,
      maxSuggestions
    });
    return result ?? [];
  } catch {
    return [];
  }
}
```

`addNode` and `addEdge` each gain a fire-and-forget call after their own
success path — for `addNode`, scope is `[nodeId]`; for `addEdge`, scope is
`[fromNodeId, toNodeId]`. Both use cap `5`. This lives in `addNode`/`addEdge`
themselves (not in each of the 5 writer call sites) so every current and
future writer gets incremental inference for free — the same "wide by
default" reasoning Phase 1 used for making `queryRelated` available to every
agent regardless of writer count.

```ts
// inside addNode, replacing its `return await invoke(...)` with:
const nodeId = await invoke<string>('memory_graph_add_node', { nodeType, refId });
if (nodeId) {
  inferEdges([nodeId], 5).catch(() => {});
}
return nodeId;

// inside addEdge, same pattern: capture the returned edge id, then
// fire-and-forget only if it's non-null:
const edgeId = await invoke<string>('memory_graph_add_edge', { /* ...unchanged... */ });
if (edgeId) {
  inferEdges([fromNodeId, toNodeId], 5).catch(() => {});
}
return edgeId;
```

`addEdge`'s current docstring ("Phase 1 is manual-only... no inference
happens here") becomes false the moment this ships — the plan must update
or remove that comment as part of this change, not leave it as a stale,
actively misleading claim about the function's own behavior.

### TypeScript: `src/services/memoryGraphInferenceService.ts` (new)

Mirrors `echoFileWatcherService.ts`'s existing module-level-interval-variable
pattern (`startFileWatcher`/`stopFileWatcher`) — not `sentinelSecurityService`'s
`startScheduledScans`, which instead returns a cleanup closure the caller
must hold onto; `echoFileWatcherService`'s explicit start/stop function pair
is the closer match and the one used here:

```ts
import { listAllNodes, inferEdges } from './memoryGraphService';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runScheduledInferencePass(): Promise<void> {
  const nodes = await listAllNodes(500);
  if (nodes.length === 0) return;
  const shuffled = [...nodes].sort(() => Math.random() - 0.5);
  const batch = shuffled.slice(0, 20).map((n) => n.id);
  await inferEdges(batch, 20);
}

export function startMemoryGraphInferenceScheduler(intervalMs = 30 * 60 * 1000): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runScheduledInferencePass().catch(() => {});
  }, intervalMs);
}

export function stopMemoryGraphInferenceScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
```

Wired at boot in `App.tsx`, next to `startFileWatcher`'s existing call site
(`App.tsx:446`) — same boot-effect block, same lifecycle.

### TypeScript: `src/components/MemoryGraphViewer.tsx`

- Link color: `linkColor={(link) => trustColor(link.confidence)}` — the
  same `nodeColor`-prop pattern `MemoryGraphViewer.tsx` already uses for
  nodes (`nodeColor={(node) => colorForNodeType(node.nodeType)}`), applied
  to `react-force-graph-3d`'s equivalent `linkColor` prop. Uses the edge's
  `confidence` field, already present on every `GraphEdge`. Reuses
  `trustColor()` from `trustModel.ts` — no new color logic.
- "Suggest connections" button: calls
  `inferEdges(loadedNodes.map(n => n.id), 50)`, shows a toast with the
  count of new edges found (0 is a valid, non-error result — say so
  explicitly rather than showing nothing), then re-runs the existing
  `listAllEdges` fetch to refresh the rendered graph.

## Data flow summary

```
writer calls addNode/addEdge (existing, unchanged)
        │
        ▼
memoryGraphService.ts's addNode/addEdge succeeds
        │
        ├─→ (existing) manual edge is live immediately
        │
        └─→ (new) fire-and-forget inferEdges([touched nodes], 5)
                    │
                    ▼
            memory_graph_infer_edges (Rust, one SQLite transaction)
                    │
                    ├─ SQL_INFER_COMMON_NEIGHBOR over scope
                    ├─ SQL_INFER_SHARED_EVENT over scope
                    ├─ dedup vs. existing edges + self-loops
                    ├─ cap at max_suggestions
                    └─ INSERT surviving pairs (confidence='inferred')
                    │
                    ▼
            new edges immediately visible to queryRelated/
            queryRelatedDeep/listAllEdges — same as any manual edge

(separately, on its own 30-min timer:)
runScheduledInferencePass → random 20-node batch → same Rust command

(separately, on user click in the viewer:)
"Suggest connections" button → currently-loaded nodes → same Rust command
                    │
                    ▼
            viewer refetches listAllEdges, re-renders,
            inferred links visually distinct via trustColor('inferred')
```

## Error handling

Every layer above the Rust transaction fails soft and silently, matching
the rest of this subsystem (`memoryGraphService.ts`'s existing
`addNode`/`addEdge`/`queryRelated`/etc. all catch-and-return-empty rather
than throw). A bad or slow inference pass must never break a writer's real
work, block the UI, or crash the viewer. The Rust command itself is the one
place that must be internally correct — the SQLite transaction wrapping
the whole suggest-and-insert sequence is what prevents a partial/duplicate
write if two triggers race.

## Testing

- **Rust unit tests** (`src-tauri/src/memory_graph.rs`, `#[cfg(test)] mod
  tests`): build small fixture graphs (3-5 nodes, hand-inserted edges) to
  assert: common-neighbor fires when expected and doesn't when no common
  neighbor exists; shared-event fires when `created_event` matches and
  doesn't when it's `NULL` or differs; dedup correctly rejects a pair that
  already has a direct edge in either direction; self-loops (`from == to`)
  are never proposed; `max_suggestions` truncates correctly when more
  candidates exist than the cap allows; scope filtering only considers
  pairs touching at least one node in `scope_node_ids`.
- **TS unit tests** (`src/test/services/memoryGraphService.test.ts`):
  `inferEdges` calls `invoke('memory_graph_infer_edges', ...)` with the
  right args and returns `[]` on any thrown error (matching the existing
  pattern for every other function in this file). Separate tests confirm
  `addNode`/`addEdge` call `inferEdges` with the correct scope after a
  successful write, and do NOT call it if the underlying `invoke` failed.
- **TS unit tests** (`src/test/services/memoryGraphInferenceService.test.ts`,
  new): `startMemoryGraphInferenceScheduler`/`stop...` use fake timers
  (matching how other interval-based services are already tested in this
  repo); `runScheduledInferencePass` calls `listAllNodes` then `inferEdges`
  with a batch capped at 20, and is a no-op (no `inferEdges` call) when
  `listAllNodes` returns an empty array.
- **TS component test** (`src/test/memoryGraphViewer.test.tsx`, extended):
  clicking "Suggest connections" calls `inferEdges` with the loaded node
  ids and cap 50, shows a result count (including the 0-found case), and
  triggers a `listAllEdges` refetch afterward.

## Out of scope (explicitly deferred, not silently dropped)

- Content-based inference (keyword/entity matching across node content) —
  would cross the graph layer's deliberate content-blind boundary; not
  ruled out forever, just not this pass.
- A review/approval queue for suggestions before they become real edges —
  the existing trust-labeling convention (`confidence: 'inferred'`) already
  gives consumers a way to filter/distrust these without new UI plumbing.
- "Processed" tracking for the scheduled batch (e.g. only pick nodes never
  previously scanned) — random sampling is the simplest thing that keeps
  the scheduled pass bounded without new bookkeeping; revisit only if
  random sampling proves to under-cover the graph in practice.
- Phase 4 (Governance/retention) — unrelated to this piece, already
  tracked separately in the original roadmap.
