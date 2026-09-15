# Phase 2 — Miya Studio Re-skin Spec

## Scope

Re-skin `MiyaStudio.tsx` (1726 lines, the single largest remaining hardcoded-color file in the app — 91 real color-class occurrences, verified via direct grep, not estimated). Everything lives in one file: the main `MiyaStudio` component (tab shell, header, generation handlers) plus 9 internal helper components defined below it (`ProductionPipelineMatrix`, `ExportPackageReadiness`, `LocalGenerationPanel`, `PipelineInputs`, `BrandKitEditor`, `OutputPanels`, `YouTubePublishHandoffPanel`, `CapCutExportHandoffPanel`, `Field`). Same direct spec-and-build recipe as the previous 4 re-skins this session — no new mockup round.

**Real distribution (grep-verified):** `LocalGenerationPanel` alone accounts for 57 of the 91 refs — it's the ComfyUI/Runway local-media-generation panel, by far the densest single section. The rest are spread thinly across the main shell header/tabs (8), `ProductionPipelineMatrix` (7), and the 5 remaining handoff/output helpers (1-8 each).

**Explicitly out of scope:** any change to generation logic, ComfyUI/Runway wiring, pipeline state machine, or the export-packet/handoff behavior. Visual-only.

## Color mapping (all tokens confirmed real in `tokens.css` during this session's earlier passes)

| Old (hardcoded) | New (token) | Notes |
|---|---|---|
| `fuchsia-*` (text/border/bg, all shades) | `var(--agent-miya)` / `var(--agent-miya)/NN` opacity variants | Miya already has a reserved per-agent identity token (`--agent-miya`), same pattern as Hector's page using `--agent-hector`. This is the single biggest mechanical substitution in the file. |
| `zinc-900`/`zinc-900/NN` (panel backgrounds) | `var(--surface-1)` | Card/section backgrounds |
| `zinc-900/70` (form input backgrounds specifically) | `var(--surface-2)` | Slightly lighter than card backgrounds, matching the input-vs-card distinction already used elsewhere (e.g. Content Studio's `GeneratorForm`) |
| `zinc-800` (button backgrounds, progress-bar track) | `var(--surface-2)` | |
| `zinc-950` (deepest nesting, e.g. media preview well) | `var(--surface-0)` | |
| `zinc-100`/`zinc-200`/`zinc-300` (primary/secondary text) | `var(--text-1)` / `var(--text-2)` | |
| `zinc-400`/`zinc-500`/`zinc-600`/`zinc-700` (tertiary/quaternary text, dividers) | `var(--text-3)` / `var(--text-4)` | |
| `amber-*` (warning banners, interrupted-job callouts, "not connected" status) | `var(--warning)` / `var(--warning-dim)` | Matches the established pattern from every prior re-skin this session |
| `emerald-*` (success states, "wired"/done status) | `var(--success)` / `var(--success-dim)` | |
| `red-*` (error states — note: this file uses `red-*`, not `rose-*` like earlier pages) | `var(--error)` | Same semantic, different literal Tailwind family — still maps to the one real error token |
| `indigo-*` (the pipeline matrix's *third*, neutral-informational status badge — "template/package foundation active", distinct from the amber/emerald two-state pattern) | `var(--accent)` / `var(--accent-dim)` / `var(--accent-border)` | No dedicated "info" token exists in `tokens.css`; `--accent` is this app's established default interactive/informational color (same role it plays on Mission Control, Content Studio, Voice) — reusing it here rather than inventing a new token. |
| `bg-gradient-to-r from-fuchsia-600 to-pink-500` (Runway progress-bar fill) | `bg-[var(--agent-miya)]` (flat) | Same gradient-drop decision as Content Studio's header and Voice's header — no other re-skinned surface in this app uses a two-tone gradient, so this one-off shouldn't either. |

## Test coverage

`src/test/miyaStudioEmptyInputGuard.test.jsx` already exists (4 real tests, covering the default "Script Studio" tab's empty-input validation guard) — reused as the primary regression guard, not replaced. Per the proportional-effort precedent (Content Studio, Voice), no exhaustive new test suite is written for every tab/sub-component; this is a styling-only pass over an already-partially-tested file. One addition: a light smoke test confirming all 6 studio tabs render their labels and are clickable (the existing test never exercises tab-switching), since `MiyaStudio.tsx` shares the same `AnimatePresence mode="wait"` tab-switch pattern already found to need `findByText`/`waitFor` (not `getByText`) in jsdom — discovered during the Hector Desk re-skin, documented in `bug-log.md` #9.

## Explicitly open / deferred

- No layout or `Zone` adoption in this pass — same reasoning as Content Studio: this file's helper components are tightly composed inline (tab content, side-by-side grids), not independent Zone-able panels like Hector's 5 sub-components.
- Full behavioral test coverage for every tab/generation path — real, separate effort, not attempted here.
