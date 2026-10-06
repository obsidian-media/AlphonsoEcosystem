# Memory Knowledge Graph — Phase 4 (Governance): Retention & Pruning — Design Spec

**Date:** 2026-10-06
**Status:** Design decisions recorded 2026-10-06 (see "Decisions" below); no code until the final review of this spec and a separate implementation plan
**Owner:** Echo (retention discipline), `memory_graph.rs` / `memoryGraphService.ts` (mechanism)
**Parent:** `docs/superpowers/specs/2026-09-03-memory-knowledge-graph-design.md` (roadmap, Phase 4)
**Register:** `docs/governance/DEFERRED_WORK.md` (2026-09-04 entry, "Phase 4 … open, deferred, not started")

## Problem

`memory_nodes` and `memory_edges` only ever grow. Nothing deletes a row. Seven
writers feed the graph (every pipeline receipt, every Maria audit, every
Boardroom message, every Hector report and each of its sources, every unified
memory item) and the inference scheduler adds edges on top, every 30 minutes and
on every write. Left alone, the graph will eventually hit the viewer's caps
(500 nodes / 1000 edges), after which the 3D viewer silently shows an arbitrary
slice, and `queryRelatedDeep` gets slower as the recursive CTE scans more rows.

The graph's *content* (`ref_id` targets) already has retention: `unifiedMemoryService.js`
expires items by category TTL (`TTL_CONFIG`) and Echo classifies entries as
`permanent` / `standard_180d` / `ephemeral_7d`. The graph does not follow it, so
nodes can point at memory items that were already deleted.

## Verified facts about the current graph

- Schema (`src-tauri/src/memory_graph.rs`): `memory_nodes(id, node_type, ref_id,
  created_at)`; `memory_edges(id, from_node_id, to_node_id, edge_type, confidence,
  created_by, created_event, created_at)`. **No foreign key, no deleted/valid-until
  column, no index on `created_at`.**
- Node types written today: `memory_item`, `packet`, `receipt`, `boardroom_message`,
  `research_report`, `source`.
- Edge confidence values in use: manual writers pass a trust state;
  inference writes `'inferred'`.
- Node ids are deterministic (`<node_type>:<ref_id>`) and `INSERT` is idempotent, so
  re-adding a pruned node later is safe.
- Nodes carry **no author** (`created_by` exists only on edges).

## Goals

1. Bound graph size without losing anything the user would miss.
2. Reuse the app's existing retention vocabulary rather than invent a second one.
3. Never leave a dangling edge, and never delete the only connection that makes a
   permanent memory reachable.
4. Make every deletion explainable and, for anything non-trivial, reversible or at
   least reviewable.

## Non-goals

- Changing how edges are created or inferred.
- Pruning the underlying memory items (their own TTL already does that).
- A new storage engine.

## Proposed design

### 1. Retention is derived from the thing a node points to, not stored on the node

Add no retention column to nodes. Instead, a node's retention class is resolved at
prune time from its `node_type` and, for `memory_item`, from the item's own
`retentionPolicy`:

| Node type | Class | Rule |
|---|---|---|
| `memory_item` | follows the item | `permanent` → keep; `standard_180d` → 180 d; `ephemeral_7d` → 7 d; if the item no longer exists → orphan (see §3) |
| `receipt`, `packet` | follows the packet | 90 d after last edge activity, unless any edge touches a kept node |
| `boardroom_message` | follows the thread | 180 d; threads the user marked escalated/acknowledged stay |
| `research_report` | 180 d | `source` nodes belong to a report and age with it |
| `source` | follows its report(s) | pruned only when no surviving report cites it |

Rationale: keeps one source of truth for "how long do we keep this", and a
`permanent` memory can never lose its node.

### 2. Edges age separately from nodes

- **Inferred edges** (`confidence = 'inferred'`) expire after **30 days** unless
  re-confirmed. They are guesses; they should be cheap to drop and cheap to
  regenerate (the scheduler will propose them again if still structurally true).
- **Manual/verified edges** are never pruned on their own; they go only when an
  endpoint node is pruned.
- Re-confirmation = the inference run proposing the same edge again refreshes a
  `last_seen_at`-style timestamp instead of inserting a duplicate.

### 3. Orphans and dangling edges

- After any node deletion, delete edges whose endpoint no longer exists (single SQL
  statement, same transaction).
- A node whose `ref_id` target no longer exists (memory item expired by its own
  TTL) is an *orphan*: it is pruned on the next pass, not kept as a ghost.

### 4. Protection rules (checked before every deletion)

A node is never pruned if any of these hold:
- it has a `permanent` class (above);
- it is within one hop of a `permanent` node via a non-inferred edge (keeps the
  provenance chain of a decision intact);
- it was touched (read via `queryRelated*` or viewer selection) within the last 14
  days — requires the small `last_accessed_at` addition below, **or** is dropped
  from v1 if we decide the added write cost is not worth it (open question 4).

### 5. Mechanism

- New Rust command `memory_graph_prune(policy)` that takes the thresholds as
  arguments (so tests can pass tiny windows) and runs entirely in **one SQLite
  transaction**: select candidates → apply protection rules → delete edges → delete
  nodes → delete dangling edges. Returns `{ nodesRemoved, edgesRemoved, kept:
  {protected, withinWindow}, dryRun }`.
- A `dryRun: true` mode that returns the same report without deleting.
- TS wrapper `pruneMemoryGraph()` in `memoryGraphService.ts`; Echo owns the policy
  constants (next to `RETENTION_RULES`), the Rust side only executes numbers.
- Scheduler: reuse `memoryGraphInferenceService.ts`'s timer rather than adding a
  second one — run a prune pass once a day, after the inference run, never during a
  burst of writes.
- Audit: one `appendConnectorAudit`-style record per pass (counts only, no content)
  so the Activity tab can show "pruned 12 nodes / 31 edges".

### 6. Schema changes (additive, migration-safe)

- `memory_edges.last_seen_at INTEGER` (nullable; `NULL` = use `created_at`).
- `memory_nodes.last_accessed_at INTEGER` (nullable) — only if open question 4 is
  answered yes.
- Indexes on `memory_nodes(created_at)` and `memory_edges(created_at)`.
- Done with `ALTER TABLE … ADD COLUMN` inside `ensure_memory_graph_tables`, guarded by
  a `PRAGMA table_info` check, following the repo's existing KV/schema-migration
  pattern (T11), so older databases upgrade in place.

### 7. Temporal validity windows ("true until X")

The parent roadmap also mentions GraphZep-style validity windows. **Recommend
deferring that half.** It changes the read model (every query needs an "as of"
filter) and no current writer has a meaningful "ended" event. Retention alone solves
the unbounded-growth problem. Track it separately as Phase 4b so this phase stays
small and shippable.

## Safety

- Pruning is destructive. Defaults must be conservative: first release ships
  **dry-run only in the UI** (a "Preview cleanup" button in the Memory section of
  Settings that shows the report), with real deletion enabled by an explicit
  "Clean up now" action and the daily automatic pass behind a setting that defaults
  **off** until a release has run clean for a while.
- No deletion path may touch memory items themselves, only graph rows.
- A prune that would remove more than 50% of nodes aborts and reports instead
  (guards against a bad threshold or a clock problem).

## Testing

- Rust: in-memory SQLite tests for each rule — permanent kept, one-hop provenance
  kept, ephemeral expired, inferred edge expired, manual edge kept, orphan removed,
  dangling edge removed, >50% abort, `dryRun` deletes nothing, idempotent second run.
- TS: wrapper + scheduler wiring (runs after inference, respects the setting,
  records the audit entry).
- No change to existing `queryRelated*` tests; add one asserting traversal still
  terminates after a prune.

## Decisions (2026-10-06, from the owner)

1. **Windows:** accepted as proposed — 7 d (`ephemeral_7d`), 90 d (receipts/packets), 180 d (`standard_180d`, boardroom messages, reports) for nodes; 30 d for inferred edges.
2. **Automation:** the daily pass ships **off by default**, and a **Preview** (dry-run report) must be available in the UI before anyone can run a real cleanup. Order of delivery: dry-run command and Preview button first, manual "Clean up now" second, the automatic daily pass (behind a setting, off) last.
3. **Provenance protection:** yes — nodes one hop from a `permanent` node via a non-inferred edge are protected.
4. **`last_accessed_at`:** yes — include it in v1 so recently viewed nodes are protected for 14 days (implement the write cheaply, e.g. throttled/batched, not one write per read).
5. **Validity windows (§7):** kept out of this phase and tracked as Phase 4b, per the original recommendation. The owner had been inclined to fold them into this spec instead; if that is still preferred, say so in review and §7 moves into scope (it adds an "as of" filter to every read path, so it would make this phase materially larger).

## Original open questions (answered above)

1. **Windows:** are 7 d / 90 d / 180 d / 30 d (inferred edges) the right numbers, or
   should anything be longer for a single-user local app?
2. **Automatic vs manual:** should the daily pass ship **off by default** (my
   recommendation, with a Preview/Clean-up button), or on?
3. **Provenance protection:** keep one-hop-from-permanent nodes (my recommendation),
   or only the permanent nodes themselves?
4. **`last_accessed_at`:** worth a write on every read to protect recently viewed
   nodes, or skip it for v1 and rely on age alone?
5. **Validity windows (§7):** defer to a Phase 4b as recommended?

## Out of scope for this PR

Spec only. Implementation gets its own plan and PR once these are answered.
