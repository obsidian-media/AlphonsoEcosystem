# Memory Knowledge Graph — Design Spec

**Date:** 2026-09-03
**Status:** Approved for planning (pending user sign-off on this doc)
**Owner:** Echo (schema + service maintenance)

## Problem

Alphonso's memory today is flat. `unifiedMemoryService.ts` stores items, ChromaDB
does vector similarity search, and Boardroom's `findCrossThreadContext`
approximates "relatedness" with plain keyword overlap across threads. None of
this captures *why* two things are connected — only that they share words or
embedding proximity. No agent can ask "what led to this decision" or "what's
directly related to this task" and get a real, traceable answer.

## Goals (this spec)

- Every agent can query relationships (`queryRelated(nodeId)`) from day one,
  even while only a small number of subsystems are writing into the graph.
- Replace Boardroom's keyword-overlap heuristic with something principled,
  without having to migrate it on day one.
- No new dependency, no new database engine — extend the app's existing
  local-first SQLite/durable-store conventions.

## Non-goals (this spec, deferred to later phases — see Roadmap)

- A visual graph viewer (Phase 3).
- Automated/inferred edge generation (Phase 3).
- Multi-hop traversal queries (Phase 2).
- Retention/pruning enforcement (Phase 4).

## Prior Art Considered (and rejected)

Researched before committing to a plain-SQLite approach, since reinventing a
graph engine badly would be worse than not having one:

- **GraphLite / CozoDB** — real embedded (no-server) graph engines, but both
  are newer Rust projects with their own query languages (GQL / Datalog).
  Bundling either would mean a new dependency and a new query language to
  maintain for a problem that doesn't yet need a purpose-built engine.
- **Neo4j-backed options** (GraphZep, Neo4j Labs agent-memory) — require a
  running server or hosted service. Incompatible with this app's
  local-first/zero-cost posture; rejected outright.
- **Opinionated agent-memory frameworks** (agent-memory, Cognee, AgentOS) —
  would compete with `unifiedMemoryService.ts`/ChromaDB, which already own
  memory storage and semantic search here, rather than complement them.

**Decision:** plain SQLite tables via the existing `kv_store.rs`/
`durableStore.js` dual-write pattern. SQLite's native `WITH RECURSIVE`
support is the mechanism for Phase 2's multi-hop traversal — no new engine
needed to get there. Revisit only if real-world graph size makes recursive
CTEs a measured performance problem, not preemptively.

One idea borrowed without the dependency: GraphZep's model treats edges as
having a temporal validity window rather than being permanently static —
folded into Phase 4 (Governance) alongside retention, not built now.

## Architecture

### Schema (open-ended from day one)

Two SQLite tables, reached through the existing `kv_store.rs` Rust commands
(mirroring how every other durable table in this app is exposed):

```
memory_nodes
  id            TEXT PRIMARY KEY
  node_type     TEXT   -- free-form: 'memory_item' | 'boardroom_thread' | ...
                        -- (not a hardcoded enum — future phases add types
                        -- without a migration)
  ref_id        TEXT   -- id into the owning source table (e.g. the memory
                        -- item id, or the boardroom thread/message id)
  created_at    INTEGER

memory_edges
  id            TEXT PRIMARY KEY
  from_node_id  TEXT   -- FK -> memory_nodes.id
  to_node_id    TEXT   -- FK -> memory_nodes.id
  edge_type     TEXT   -- free-form: 'informed_by' | 'supersedes' | 'mentions' | ...
  confidence    TEXT   -- one of trustModel.ts's existing TRUST_STATES values
                        -- (verified/inferred/pending/user_confirmed/etc.) —
                        -- do not invent a second status vocabulary
  created_by    TEXT   -- provenance: which agent id wrote this edge
  created_event TEXT   -- provenance: what triggered it (e.g. a packet id,
                        -- a boardroom message id) — audit-trail discipline,
                        -- same convention agentAuditService.js already uses
  created_at    INTEGER
```

`node_type`/`edge_type` being free-form strings (not an enum) is the whole
reason Phase 2+ writers can be added later without a schema migration — the
table shape never has to change, only what's written into it.

### Service: `src/services/memoryGraphService.ts`

New, dedicated file — not folded into `unifiedMemoryService.ts`. This
codebase's own "Do Not Duplicate" convention favors one obvious file per
concern over growing an already-large service; "a graph of relationships
between things" is conceptually distinct from "a store of memory items,"
even though Echo owns both.

Public API (Phase 1 scope):

```ts
addNode(nodeType: string, refId: string): Promise<string>  // returns node id
addEdge(fromNodeId: string, toNodeId: string, edgeType: string, opts: {
  confidence: TrustState;   // from trustModel.ts
  createdBy: string;        // agent id
  createdEvent?: string;
}): Promise<string>          // returns edge id
queryRelated(nodeId: string): Promise<GraphEdge[]>  // one-hop neighbors only, Phase 1
```

`queryRelated` is deliberately one-hop only in Phase 1 — with only two
writers and no historical data, there's nothing deep enough to traverse yet.
Multi-hop (`WITH RECURSIVE`) is a Phase 2 addition to this same function's
implementation, not a new function or a schema change.

### Writers (Phase 1 — exactly two)

- `unifiedMemoryService.ts` — writes a `memory_item` node whenever a memory
  item is created; writes edges only where a real relationship is already
  known at write time (e.g. "this memory item is about the same task as
  that one").
- `boardroomThreadService.ts` — writes `boardroom_thread`/`boardroom_message`
  nodes and edges at the moments a real relationship is already known (e.g.
  an `@mention` chain hop, or a message referencing an earlier thread) —
  this is the direct replacement path for `findCrossThreadContext`'s
  keyword-overlap heuristic, though that replacement itself is not required
  to happen in Phase 1.

Edges are **manual/explicit only** in Phase 1 — a writer only calls
`addEdge` at a moment it already knows a relationship is real. No inference,
no background job. This keeps the graph small but trustworthy; automated
edge-suggestion is deferred to Phase 3, where it can be validated against
real accumulated data instead of guessed against an empty graph.

### Readers (Phase 1 — every agent, unconditionally)

`queryRelated(nodeId)` is exported for any agent's service layer to call,
regardless of how many writers currently populate the graph. This is
deliberate: read access being wide from day one is nearly free, and
retrofitting it later (once call sites assume a narrower contract) would not
be.

## Roadmap

**Phase 1 — Foundation** *(this spec)*
Schema (open-ended), two writers (`unifiedMemoryService.ts`,
`boardroomThreadService.ts`), manual edges only, one-hop reads, every agent
can read. No UI.

**Phase 2 — Expansion**
Additional writers opt in as they're ready (tasks/receipts, files, connector
calls, skill packs — anything the open-ended schema already supports).
`queryRelated` gains multi-hop traversal via SQLite `WITH RECURSIVE`. Edges
remain manual — by this point there's enough real graph density to validate
an inference pass against, which is what Phase 3 does.

**Phase 3 — Intelligence & Visualization** — **CLOSED**
Automated/inferred edge-suggestion turns on, checked against the real graph
built in Phases 1–2 rather than guessed from nothing. A browsable, node-link
visual graph viewer ships here — **nodes colored by authoring agent**,
reusing the existing per-agent color convention already defined in
`AgentActivityLog.tsx`'s `AGENT_COLORS` map (do not invent a second one).
The `created_by` provenance field added in Phase 1 is what makes this
possible without extra plumbing — it was added specifically so this would
be "read a field that already exists," not "add tracking retroactively."

Shipped in two halves, each with its own design doc: the visual viewer
(`docs/superpowers/specs/2026-09-03-memory-knowledge-graph-visual-viewer-design.md`)
— nodes ended up colored by `node_type`, not authoring agent, since
`memory_nodes` has no `created_by` field (only edges do); and the inferred
edges half (`docs/superpowers/specs/2026-09-04-memory-knowledge-graph-inferred-edges-design.md`)
— pure structural link prediction (common-neighbor + shared-`created_event`),
not content-based, auto-written with `confidence: 'inferred'` rather than a
separate review queue. Both deviations from this section's original
aspirational text are deliberate design decisions made during each half's
own brainstorm, not drift.

**Phase 4 — Governance**
Retention/pruning tied into Echo's existing retention-tier logic (the same
discipline that already caps `crashLogService.js`'s and `agentAuditService.js`'s
rings at 100 entries) — without it, the graph only ever grows. Also where
GraphZep's temporal-validity-window idea (borrowed from the prior-art
research, not the dependency) would land: edges can express "this was true
until X," not just "this is true."

## Testing

- Phase 1: unit tests for `memoryGraphService.ts` (`addNode`/`addEdge`/
  `queryRelated`) against an in-memory/mock of the `kv_store.rs` Tauri
  commands, following the existing pattern used by other durable-store
  service tests in `src/test/`.
- Integration: a test confirming `unifiedMemoryService.ts` and
  `boardroomThreadService.ts` actually call the writer API at the intended
  moments (not just that the API works in isolation).
- No new Rust-side test surface beyond whatever `kv_store.rs` already covers
  for generic table read/write, unless the two new tables need dedicated
  Rust commands rather than reusing existing generic ones (an implementation
  detail to confirm during planning, not this spec).

## Open Questions Deferred to Planning

- Whether `memory_nodes`/`memory_edges` need dedicated Tauri commands or can
  reuse `kv_store.rs`'s existing generic `kv_set`/`kv_get` surface with a
  structured key scheme.
- Exact `edge_type` vocabulary for Phase 1 (`informed_by`, `supersedes`,
  `mentions` were used as illustrative examples throughout brainstorming,
  not a finalized list).
