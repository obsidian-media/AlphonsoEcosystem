# Phase 2 — Research / Hector Desk Spec

## Scope

Re-skin `HectorResearchDesk.tsx` and its 5 sub-panels (`SourceBoard.tsx`, `CitationPanel.tsx`, `ResearchReportPanel.tsx`, `HectorActivityLog.tsx`, `HectorApprovalHandoff.tsx`) onto the design-token system already established in Phase 1/2 (`--surface-*`, `--text-*`, `--agent-hector`, `Zone`). This is a **direct spec-and-build**, not a fresh visual-mockup session — the visual language (Zone washes, token colors, no hardcoded Tailwind palette colors) is already locked from Mission Control and applies here without new design exploration.

**Explicitly out of scope:** any change to the 3-tab structure (New Research / Reports / Live Run), any change to what data is fetched or how `hectorResearchService.js` behaves, and building Hector's actual multi-source synthesis (tracked separately, see bug-log.md #3 / `docs/governance/DEFERRED_WORK.md`'s 2026-09-05 entry). This spec only makes the current per-source shape visually honest, it does not change what Hector produces.

## Current state (verified directly against real code)

- `HectorResearchDesk.tsx`: 3-tab shell (`new`/`reports`/`live`), all styling hardcoded (`bg-zinc-900`, `text-teal-400/70`, `border-white/[0.06]`, etc.) — zero use of `var(--surface-*)`/`var(--text-*)` tokens anywhere in the file.
- `SourceBoard.tsx`: lists `report.sources` (url/type/verificationState/httpStatus/expiresAt/title/snippet) — "what Hector found."
- `CitationPanel.tsx`: lists `report.sourceProofs` (or falls back to `report.urls`) as a numbered bibliography with dateChecked/verificationState/httpStatus — "the report's citation list." Distinct purpose from `SourceBoard` despite overlapping-looking URL data; kept as two panels, not merged.
- `ResearchReportPanel.tsx`: renders `verifiedFacts`/`inferredPoints`/`joseApprovalNeeded` as flat bullet lists plus one `recommendedNextStep` line — confirmed, this is genuinely per-source/flat, never a synthesized narrative (matches bug-log.md #3 exactly).
- `HectorActivityLog.tsx`: simple reverse-chronological activity rows.
- `HectorApprovalHandoff.tsx`: static explainer + one "Send Report To Jose" button.
- **Zero test files exist for any of these 6 components.** (`hectorResearchService.test.js`/`hectorSkillIntegration.test.js`/`hectorSkillPacks.test.js`/`hectorBookmarkService.test.js` all test the *service* layer, not these UI components.)

## Visual re-skin

Every hardcoded Tailwind color class (`zinc-*`, `teal-*` used for chrome, `red-*`/`emerald-*` used for status) is replaced with the token equivalents already established in `MissionControlHome.tsx`:

| Old (hardcoded) | New (token) |
|---|---|
| `bg-zinc-900`, `bg-zinc-950/*` (page/panel backgrounds) | `bg-[var(--surface-1)]` / `bg-[var(--surface-0)]` as appropriate |
| `text-zinc-100`/`-200`/`-300` (primary/secondary text) | `text-[var(--text-1)]` / `text-[var(--text-2)]` |
| `text-zinc-500`/`-600`/`-700` (tertiary/quaternary text) | `text-[var(--text-3)]` / `text-[var(--text-4)]` |
| `border-white/[0.06]`/`[0.07]`/`[0.08]`/`[0.10]` | unchanged — already a token-agnostic neutral, kept as-is |
| `text-teal-400/70`, `text-teal-200/75`, `text-teal-300`, `text-teal-100`, `bg-teal-300` (Hector's brand accents + primary button) | `var(--agent-hector)` (the existing per-agent identity color already used by `AgentStatusStrip`) |
| `text-emerald-400`/`text-red-400` (verified/failed status) | `text-[var(--success)]` / `text-[var(--error)]` |
| `border-amber-300/15 bg-amber-500/10` (status banner) | `bg-[var(--warning-dim)]` alone, no border (`--warning-border` does not exist in `tokens.css` — verified; only `--warning`/`--warning-dim` are real tokens, matching the no-border Zone philosophy anyway) |

Each of the 5 sub-panels' outer `<section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">` wrapper is replaced with `<Zone mood="hector">` (the `hector` mood already exists in `Zone.tsx`, unused until now — this page is its first real consumer, same as Mission Control was `warm`/`cool`'s first consumer). Per `Zone`'s established "no cards" rule, this also means dropping the `border`/explicit `rounded-2xl` from these 5 wrappers — hierarchy comes from the mood wash alone, matching Mission Control's Zone sections.

The page header, tab bar, and the "New Research" tab's form card are re-skinned in place (token colors) but keep their current structural markup (`card`/`panel-flat`/`btn-primary`/`btn-ghost`/`btn-secondary` utility classes are unaffected — those are separate from the Tailwind-color hardcoding this spec targets).

## Synthesis-gap honesty fix (bug-log.md #3)

`ResearchReportPanel.tsx` gains one new element: a small notice directly under the report's title/confidence line, before the `sourceProofs` block:

> "Per-source findings below — Hector doesn't yet combine these into one written report."

Styling: a `Zone mood="cool"` inline strip (small, not a full section) — reusing the `cool` mood added for Mission Control's empty state, since this is conceptually the same "here's an honest limitation, not a bug" pattern. Exact copy may be refined at implementation time; the substance (stating plainly that this is a flat list, not a synthesis) is the fixed requirement.

## Labeling clarity (`SourceBoard` vs `CitationPanel`)

Section labels change from generic "Source Board" / "Citation Panel" to purpose-stating labels:
- `SourceBoard` → **"Discovered Sources"** (subtext already present: "No sources recorded. Hector will not invent citations." — unchanged)
- `CitationPanel` → **"Citations"** with a new one-line subhead when non-empty: "Numbered bibliography for this report's approval handoff." (only shown when `urls.length > 0`, to avoid cluttering the already-clear empty state copy)

No data/prop changes — this is copy-only.

## Test coverage (new, since none currently exists)

One test file per component, covering the minimum real behavior each one has (not exhaustive prop-matrix testing):
- `SourceBoard.test.tsx`: renders empty-state copy when no sources; renders a source row's url/type/verification when sources exist; clicking a URL calls `openExternalUrl`.
- `CitationPanel.test.tsx`: renders empty-state copy when no urls; renders numbered citations from `sourceProofs`; falls back to `report.urls` when `sourceProofs` is absent.
- `ResearchReportPanel.test.tsx`: renders the new synthesis-gap notice; renders verified facts / inferred points / approval-needed lists; renders the "no report selected" state.
- `HectorActivityLog.test.tsx`: renders empty-state copy; renders rows in reverse-chronological order.
- `HectorApprovalHandoff.test.tsx`: button disabled with no report; clicking calls `onCreateHandoff(report.id)` with a report.
- `HectorResearchDesk.test.tsx`: renders 3 tabs, switches between them, "New Research" tab creates a draft and switches to "Reports" tab (mocking `hectorResearchService.js`'s real exports, matching the mocking pattern already used in `MissionControlHome.test.tsx`).

## Explicitly open / deferred (not resolved by this spec)

- Hector's actual multi-source synthesis (bug-log.md #3) — real, separate, deferred work; this spec only adds an honest notice about the current gap.
- `SourceBoard`/`CitationPanel` potential future merge or further differentiation — left as two panels per this spec's decision; revisit only if a future redesign finds the distinction still confusing after the label fix.
- Dark-mode-only verification — same caveat as Mission Control's spec: only dark mode has been checked; light-mode token behavior for `--agent-hector`/`--warning-dim` on this page is assumed consistent with existing token definitions, not independently re-verified pixel-by-pixel.
