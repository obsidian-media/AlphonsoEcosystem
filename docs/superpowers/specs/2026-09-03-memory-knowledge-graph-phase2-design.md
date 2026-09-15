# Memory Knowledge Graph — Phase 2 (Expansion) Design Spec

**Date:** 2026-09-03
**Status:** Approved for planning (pending user sign-off on this doc)
**Owner:** Echo (schema + service maintenance), per-writer changes owned by Hector/Jose/Maria's existing services
**Depends on:** Phase 1 (`docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md`), already merged to `main`

## Problem

Phase 1 shipped a working relationship layer with exactly two writers
(`unifiedMemoryService.js`'s `pushMemory`, `boardroomThreadService.ts`'s
`addThreadMessage`) and a one-hop-only `queryRelated`. That was deliberate —
the schema (`node_type`/`edge_type` as free-form strings) was built
open-ended specifically so more writers and deeper queries could be added
later without a migration. Phase 2 is that "later": more real relationships
get graphed, and a caller can finally ask "what's connected to this,
transitively" instead of only "what's directly next to this."

## Goals (this spec)

- Three additional writers, each wired at a real, already-known-at-write-time
  relationship (same bar Phase 1 held Boardroom to — no inference, no
  guessing).
- A new query capability, `queryRelatedDeep`, for multi-hop traversal with
  explicit, caller-chosen `maxDepth` and `direction` — no hidden defaults,
  no invisible ceiling.

## Non-goals (this spec, deferred to later phases)

- Automated/inferred edge generation (Phase 3 — needs real graph density to
  validate against, which this phase is what builds).
- The visual graph viewer (Phase 3).
- Retention/pruning (Phase 4).
- Any change to `queryRelated` (one-hop) — it is untouched in this phase.
  Its own doc comment currently says "Multi-hop traversal is a Phase 2
  addition to this same function, not a new one" — that comment is now
  **wrong** given this spec's direction and must be corrected as part of
  implementation (see Open Questions).

## Writer Survey (evidence, not assumption)

Before picking writers, the actual candidate pool was checked against real
code, not just function names — this caught a real flaw before it shipped
(see below). Agents surveyed and rejected: Coach, Sentinel, Nova, Marcus,
Miya — none has a call site where a relationship to an *already-graphed
node* is known without inference.

### 1. Hector — `hectorResearchService.js`'s `createResearchDraft`

Already has the full list of source URLs in hand when it builds a report
(`sourceUrls` parameter, `sources` array built at lines 725-737). Writes:

- A `research_report` node, `ref_id` = the report's own `report.id`
  (**not** the `memory_item` node id `createResearchDraft` already creates
  via its existing `pushMemoryItem(...)` call at line 762 — that call is
  Phase 1 wiring, untouched, and stays a separate node).
- A `source` node per source, `ref_id` = the source's `url`.
- A `cites` edge from the report node to each source node, with
  **confidence set to that source's own already-computed
  `score.confidence`** (from `scoreSourceConfidence`, line 730) rather than
  a flat default — the per-source confidence scoring already exists and is
  exactly the right signal for this edge.

### 2. Jose — `orchestrationReceiptService.ts`'s `appendOrchestrationReceipt`

Already carries `packetId`/`commandId`/`workflowId` for every receipt
(lines 91-92). Writes:

- A `receipt` node, `ref_id` = the receipt's own generated id.
- A `belongs_to` edge to a `packet` node, `ref_id` = `packetId` if present,
  else `commandId` if present, else **no edge is written** (matches Phase
  1's "only write edges where the relationship is actually known" rule —
  a receipt with neither id genuinely has nothing to point at).
- Confidence: `TRUST_STATES.VERIFIED` (a receipt definitionally belongs to
  its packet — this isn't an inference, it's a fact already in hand).

### 3. Maria — `mariaAuditService.ts`'s `runMariaGovernanceAudit`

**Corrected mid-brainstorm**: the original candidate (linking to
`priorOutputs`) was checked more closely and rejected — `priorOutputs` is
typed `Record<string, { summary?, trust?, verificationState?, ... }>`
(keyed by agent name, inline text only), not a reference to any existing
graph node. There is nothing to point an edge at. Flagging this here
explicitly so a future reader doesn't rediscover the same dead end.

The real, node-addressable relationship: `assignment.packetId`/
`assignment.commandId` (the same fields Maria's own `schema.workflowId`/
`schema.packetId` are already built from at line 196-197). Writes:

- **No new node type** — reuses the `memory_item` node Maria's own
  existing `pushMemoryItem(...)` call already creates (line 208), since her
  audit result has no other natural id of its own.
- An `audits` edge from that `memory_item` node to a `packet` node,
  `ref_id` = `assignment.packetId` if present, else `assignment.commandId`,
  else no edge written.
- Confidence: `TRUST_STATES.VERIFIED`.

**Emergent property worth naming**: Jose's `belongs_to` and Maria's
`audits` edges both target a `packet` node keyed by the same `packetId`
convention, independently, with neither writer aware of the other. A
receipt and an audit for the same packet will naturally connect through
that shared node the first time both writers fire for it — this is the
open-ended schema paying off exactly as intended, not something either
writer had to be built to know about.

## Multi-hop Query: `queryRelatedDeep`

New function in `memoryGraphService.ts`, alongside (not replacing) the
existing one-hop `queryRelated`:

```ts
export type TraversalDirection = 'forward' | 'backward' | 'both';

export interface GraphEdgeWithDepth extends GraphEdge {
  depth: number;
}

export async function queryRelatedDeep(
  nodeId: string,
  maxDepth: number,
  direction: TraversalDirection
): Promise<GraphEdgeWithDepth[]>
```

- `maxDepth` and `direction` are **required parameters, no defaults** — a
  deliberate choice made during brainstorming: every call site must state
  intent rather than inherit an invisible default.
- `direction` semantics: `'forward'` follows `from_node_id → to_node_id`
  (downstream — "what does this depend on"); `'backward'` follows
  `to_node_id → from_node_id` (upstream — "what depends on this");
  `'both'` is undirected, matching `queryRelated`'s existing one-hop
  semantics.
- **No ceiling on `maxDepth`** — an explicit design decision (not an
  oversight): the user's reasoning was that callers should be able to see
  and own the cost of their own query rather than have it silently
  clamped. Cycle protection is the actual safety mechanism (below), not a
  depth cap.
- **Cycle protection is mandatory, not optional** — real graphs can have
  cycles (a `packet` node reachable two different ways, for instance), and
  SQL `WITH RECURSIVE` needs an explicit termination guard or it can loop
  forever. The Rust implementation must track visited node ids within each
  recursive branch and refuse to revisit one, independent of `maxDepth`.
- **Depth reported, and deduplicated by shortest path**: if the same edge
  is reachable via multiple paths (only possible with `direction: 'both'`),
  it appears exactly once in the result, at the smallest `depth` value it
  was reached at — standard BFS semantics, not first-found-wins.

### Rust side

New command `memory_graph_query_related_deep(node_id, max_depth, direction)`
in `src-tauri/src/memory_graph.rs`, using `WITH RECURSIVE` against the
existing `memory_edges` table (no schema change — Phase 1's tables already
support this). Returns `Vec<GraphEdgeRowWithDepth>` — `GraphEdgeRow`'s
existing fields plus a `depth: i32`, serialized the same way (`camelCase`,
with the same `createdAtMs` rename Phase 1 required — see Phase 1's own
spec for why that rename is non-negotiable).

## Testing

- Unit tests for `queryRelatedDeep` covering: depth-1 result matches
  `queryRelated`'s existing one-hop behavior in `'both'` direction; a
  multi-hop chain returns nodes at the correct reported depth; a
  deliberately-constructed cycle terminates instead of hanging; `'forward'`
  vs `'backward'` vs `'both'` each return the expected different result
  sets over the same fixture data.
- Integration tests per writer (Hector/Jose/Maria), same pattern as Phase
  1's writer tests: mock `memoryGraphService`, assert `addNode`/`addEdge`
  are called with the right node types, ref ids, edge types, and
  confidence values at the real call sites identified above — including
  the "no edge written" case when `packetId`/`commandId` are both absent.

## Open Questions Deferred to Planning

- The exact SQL for the visited-node-tracking `WITH RECURSIVE` query
  (implementation detail, not a design decision — the requirement is fixed
  above, the SQL itself is a planning-time task).
- Correcting `queryRelated`'s stale doc comment (noted above) — small,
  but a real fix this spec surfaces, not to be silently forgotten.
- ~~Whether a `packet` node needs its own writer~~ — **resolved during spec
  review, not deferred**: checked `src-tauri/src/memory_graph.rs` directly
  — `memory_edges` has no `FOREIGN KEY` constraint against `memory_nodes`,
  so `addEdge` would succeed even without a corresponding node row.
  Nonetheless, **both Jose's and Maria's writers must call
  `addNode('packet', packetId)` before `addEdge`** (cheap, idempotent, same
  pattern Phase 1's two writers already follow) — not because the database
  requires it, but so `memory_nodes` stays a complete record instead of one
  with edges silently referencing rows that were never created.
