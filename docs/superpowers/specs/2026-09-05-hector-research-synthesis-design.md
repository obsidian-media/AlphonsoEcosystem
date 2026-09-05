# Hector Research Synthesis — Design Spec

## Problem

Hector's research pipeline aggregates and truncates; it never synthesizes. Confirmed directly
against the code (`docs/governance/DEFERRED_WORK.md`'s 2026-09-05 entry has the full trace):

- `runHectorLiveResearch()` in `hectorResearchService.js` builds `verifiedFacts` as literally
  `` `Fetched ${proof.url} with HTTP ${proof.httpStatus}.` `` — a fetch-confirmation string, not
  a fact — and `inferredPoints` as one independently-truncated 220-character snippet per source,
  never combined or cross-referenced.
- `ResearchReportPanel.tsx` renders this straight through: each source is a link that opens in an
  **external browser tab**, plus an HTTP-status badge, then flat bullet lists. No narrative, no
  contradiction-resolution, no sense of what the sources collectively say.
- The only Ollama call anywhere in this pipeline (`synthesizeHectorFallbackReport()`) fires only
  when live source discovery finds **zero** sources, and its own prompt tells the model "no
  sources were found" — it asks for a guess with no source content at all, not synthesis.
- `fetch_research_sources` in `src-tauri/src/search.rs` already downloads up to 200KB per page
  and strips it to plain text — then keeps only 420 characters, which the JS layer truncates
  again to 220. The content needed for real synthesis is fetched and briefly available, then
  discarded twice before anything could use it.

`runMultiSourceResearch()` / `createResearchBrief()` (a separate, lighter-weight path used by
`ChatView.tsx`'s inline Hector briefing card and `ProjectExecutionMode.tsx`'s research brief) has
the identical shape: it merges results from up to 4 providers into one deduplicated list and
stops there.

Net effect: nothing in Hector's research subsystem takes N successfully-fetched sources' actual
content and asks an LLM (or any deterministic logic) to read them together and produce one
combined, reasoned write-up — the exact behavior a real research paper has and a search-results
page doesn't.

## Non-goals (explicitly out of scope)

- **No changes to source discovery or fetching mechanics** beyond relaxing the truncation limit.
  `discoverResearchSourcesWithFailover`, the Brave/Tavily/DeepSeek/Rust-backend provider chain in
  `runMultiSourceResearch`, and the 10-source cap in `fetch_research_sources` (`.take(10)`) are
  unchanged.
- **No changes to `synthesizeHectorFallbackReport()`'s existing zero-sources fallback behavior.**
  It still asks the model for a cautious guess when nothing was found — that's a different,
  already-correct code path, not part of this fix.
- **No new synthesis mechanism for the other 8 agents.** Maria/Echo/Sentinel/Nova/Miya/Alphonso/
  Jose already have a genuine "real content → LLM call → parsed result → deterministic fallback"
  pattern (verified during this same investigation — see the DEFERRED_WORK entry). Marcus is
  intentionally deterministic by design (governance-gated dispatch, not reasoning). Hector was the
  one outlier; this spec brings Hector's actual synthesis step up to that same standard, using
  the same shared dispatcher — it does not touch any other agent's service.
- **No UI redesign beyond what's needed for this feature.** The visual-language work happening in
  the separate `ui-redesign` worktree is unrelated; this spec only adds the depth toggle, export
  row, and "Re-synthesize" action to the existing `ResearchReportPanel.tsx`, following its current
  visual conventions, not a new design system.

## Design

### One generation, three derived views

A single new function, `synthesizeHectorResearch(researchQuestion, sources)`, added to
`hectorResearchService.js`. It asks the model for one structured JSON shape in one call — there
is no separate "brief mode" vs "structured mode" generation. The three depth levels the UI shows
(Brief / Structured / Medium) are client-side slices of this same object, never independently
generated, so they can never disagree with each other and never cost more than one LLM call per
run:

```js
// Shape returned by synthesizeHectorResearch (after parsing):
interface HectorSynthesis {
  overview: string;         // 2-4 sentences — the "Brief" view renders exactly this
  keyFindings: string[];    // grouped by theme, not by source — "Medium"/"Structured" add this
  disagreements: string[];  // "Source A claims X, Source B claims Y" prose per entry
  gaps: string[];           // what the question asked that no source actually covered
}
```

- **Brief** view: `overview` only.
- **Medium** view: `overview` + `keyFindings`, flattened, no section headers.
- **Structured** view: all four fields, rendered with real section headers (Overview / Key
  Findings / Disagreements / Gaps).

No separate `confidence` field inside this object — the existing top-level report
`confidenceLevel` (already set via the same `ollamaUsed ? INFERRED : TEMPORARY`-style pattern
Maria/Echo/Sentinel/Nova use) covers this; adding a duplicate nested field was considered during
design and dropped as redundant.

### Call sites: both flows, one shared function

- **`runHectorLiveResearch()`** (Research Desk / `ResearchReportPanel.tsx`): calls
  `synthesizeHectorResearch` once, automatically, right after the existing fetch/verify loop
  completes with at least one successful proof — same trigger point where `verifiedFacts`/
  `inferredPoints` are built today. The report gains one new top-level field alongside
  `synthesis` itself: `synthesisSourceCount` (a plain number, snapshotted at generation time). If
  the user later adds more sources to the same report, the UI exposes an explicit
  **"Re-synthesize"** action instead of auto-rerunning — it becomes visible exactly when
  `report.sources.length > report.synthesisSourceCount`, and re-running updates both `synthesis`
  and `synthesisSourceCount` together.
- **`runMultiSourceResearch()` / `createResearchBrief()`** (ChatView's inline briefing card,
  ProjectExecutionMode's research brief): calls the identical `synthesizeHectorResearch` function
  over whatever sources that path collected. The caller only ever reads `synthesis.overview` back
  out — no toggle, no export UI, no other fields rendered there. The backend logic is genuinely
  shared between both flows; only how much of the result each UI surface shows differs.

Both call sites route through `generateAgentLlmResponse('hector', ...)` — the same shared
per-agent LLM dispatcher Maria/Echo/Sentinel/Nova already use — so Hector's per-agent provider
selection (Ollama/NVIDIA/Gemini/Hermes, via `modelSelectionService.ts`) is respected automatically
with no new plumbing.

### Source-text budget: dynamic, bounded, no new fetch infrastructure needed

`fetch_research_sources` in `src-tauri/src/search.rs` already fetches up to 200KB per page and
strips HTML tags to plain text (`strip_html_tags`) — it just throws almost all of that away today
(`text.chars().take(420)`). Fix: **remove that 420-char cap** and return the full stripped text
(still bounded by the existing 200KB raw-byte fetch limit, which is unchanged) — the Rust layer's
job stays "fetch and strip," not "decide how much to keep for synthesis," since that decision
depends on how many sources came back, which the JS layer already tracks.

On the JS side, `synthesizeHectorResearch` computes a **dynamic per-source budget**: a fixed
total prompt budget of **6,000 characters** across all sources' text, divided evenly by however
many sources succeeded. Since `fetch_research_sources` already hard-caps at 10 sources
(`.take(10)`, pre-existing, unchanged), this division is naturally bounded — worst case (10
sources) is 600 chars/source, far better than today's 220; best case (2-3 sources) gives each
source 2,000-3,000 chars. This is a tunable constant, not something requiring live validation
before shipping — flagged as adjustable if real usage shows it's off.

### UI: `ResearchReportPanel.tsx`

- A three-way toggle (Brief / Structured / Medium) above the synthesis text, defaulting to
  Structured (this is the "real research paper" behavior that was the entire point of the fix).
- An export row directly below: Markdown, PDF, PowerPoint buttons. Disabled when no `synthesis`
  exists yet on the current report (matches the existing `exportReport`'s `disabled={!r}`
  pattern).
- The existing "Source Proofs" list is unchanged in content, now collapsed by default behind a
  disclosure toggle (`▸ Sources (N)`) rather than always-expanded — it's still there as
  supporting citations, just demoted from being the entire output to being backup material under
  the synthesis.
- A "Re-synthesize" action, visible only when the report's source count has grown since
  `synthesis` was last generated.

### ChatView / ProjectExecutionMode inline surfaces

No new UI. Both already render a short summary string today (`hectorBriefing`'s sky-tinted card
in `ChatView.tsx`, the research-brief panel in `ProjectExecutionMode.tsx`); they simply now
receive `synthesis.overview` instead of the old un-synthesized aggregate string as that value.

### Export: `hectorExportService.ts` (new)

Owns all three export formats, called from `ResearchReportPanel.tsx`'s export row:

- **Markdown**: extends the existing pattern already proven in `HectorResearchDesk.tsx`'s
  `exportReport()` (client-side `Blob` + `URL.createObjectURL` download, no backend call) — moved
  into the new shared service so PDF/PPTX can reuse the same content-building logic rather than
  duplicating it.
- **PDF**: via `jspdf` (new dependency — pure client-side JS, no native/Node bindings, confirmed
  browser/webview-compatible).
- **PowerPoint**: via `pptxgenjs` (new dependency — same profile, pure client-side JS).
- Both libraries are **dynamically imported** (`await import('jspdf')` /
  `await import('pptxgenjs')`) inside `hectorExportService.ts` only when an export button is
  actually clicked — not bundled into the app's main load. (jsPDF ~200KB, pptxgenjs ~500KB-1MB;
  neither is trivial, and most users will never click these buttons in a given session.)
- **Exports always contain the full structured report** (Overview, Key Findings, Disagreements,
  Gaps, plus source citations) regardless of which depth toggle happens to be selected on screen
  — an exported document is meant to be shared/archived, not a snapshot of whatever tab was open.

### Error handling

- Synthesis LLM call fails, times out, or returns unparseable JSON → fall back to **exactly
  today's current behavior** (the per-source truncated-snippet list via the existing
  `verifiedFacts`/`inferredPoints`-equivalent construction) — `confidenceLevel` stays at the
  existing `TEMPORARY`/`UNVERIFIED` values per the pattern already used elsewhere. A failure here
  never produces a broken or empty report, only a less-improved one.
- Fewer sources fetch successfully than were attempted → synthesis still runs over whatever
  succeeded; the prompt explicitly instructs the model to note thin/partial source coverage in
  `gaps` rather than presenting an over-confident report built from only 1-2 sources.
- Export triggered with no `synthesis` present → export buttons stay disabled (matches existing
  `exportReport` convention).

## Testing

- `hectorResearchService.test.js`: prompt construction (real fetched content flows in;
  per-source budget divides the 6,000-char total correctly for N=1, N=3, N=10 sources; caps
  respected); response parsing (valid JSON, fence-wrapped JSON, malformed JSON, empty response);
  fallback-on-failure produces exactly today's current shape; thin-coverage prompt wording present
  when fewer sources succeed than requested.
- `ResearchReportPanel.test.tsx`: all three toggle states render correctly from one shared
  `synthesis` fixture; "Re-synthesize" appears only once source count has grown past the count at
  last synthesis; export buttons disabled without a `synthesis` present; existing "Source Proofs"
  content unchanged, now behind a disclosure toggle.
- `hectorExportService.test.ts`: each export function produces output with the expected
  structure/sections (mock `jspdf`/`pptxgenjs`, don't generate real binaries in unit tests);
  confirms exports always include all four synthesis fields regardless of a mocked "currently
  selected toggle" input.
- `src-tauri/src/search.rs`: extend existing tests to confirm the 420-char truncation is gone
  (full stripped text returned, bounded only by the pre-existing 200KB raw-fetch limit) and the
  10-source cap (`.take(10)`) still holds.

## Files touched

- `src/services/hectorResearchService.js` — add `synthesizeHectorResearch`; wire into
  `runHectorLiveResearch` (auto + re-synthesize) and `runMultiSourceResearch`/
  `createResearchBrief`; remove `inferredPoints` construction (superseded by `keyFindings`).
- `src/services/hectorExportService.ts` (new) — Markdown/PDF/PowerPoint export, dynamic imports.
- `src/components/hector/ResearchReportPanel.tsx` — depth toggle, export row, collapsed Source
  Proofs disclosure, Re-synthesize action.
- `src/components/ChatView.tsx` — `hectorBriefing` reads `synthesis.overview` instead of the old
  aggregate string (no structural change).
- `src/components/projectExecution/ProjectExecutionMode.tsx` — research brief reads
  `synthesis.overview` (no structural change).
- `src-tauri/src/search.rs` — remove the 420-char truncation in `fetch_research_sources`.
- `package.json` — add `jspdf`, `pptxgenjs`.
- Test files listed above.

## What this does not fix (tracked separately, not silently dropped)

- `synthesizeHectorFallbackReport()`'s zero-sources-found path is untouched — still a cautious
  guess with no source content, which is the correct behavior for that specific case (nothing to
  synthesize).
- No live/manual verification that a real local Ollama model produces good `keyFindings`/
  `disagreements`/`gaps` output quality from the relaxed character budget — this needs actual
  testing against a running model once implemented, not just unit tests of the parsing/fallback
  logic.
- Dark-mode/visual-language alignment with the separate `ui-redesign` worktree's eventual Research
  room redesign is not addressed here — this spec's UI additions follow the *current* visual
  conventions of `ResearchReportPanel.tsx`, and will need re-touching whenever that redesign
  reaches the Research room (flagged to that team already, per the coordination discussion this
  spec followed from).
