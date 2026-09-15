# Phase 2 — Content Studio Re-skin Spec

## Scope

Re-skin `ContentCatalystWorkspace.jsx` (the "Content" Work-space page) and its 4 sub-components that still carry hardcoded Tailwind colors: `GeneratorForm.jsx`, `DraftPreview.jsx`, `ContentCalendar.jsx`, `BrandSettings.jsx`. Same recipe as the Research/Hector Desk pass: direct spec-and-build, no new mockup round, reusing the already-locked token system.

**Explicitly out of scope:** `AnalyticsDashboard.jsx`, `DraftList.jsx`, `TrendResearch.jsx` — verified to already have zero hardcoded color classes, nothing to do. Any change to Content Catalyst's actual generation/publish pipeline (`contentCatalystService.js`, ACC bridge, ComfyUI/Runway wiring) — this is a visual-only pass.

## Real finding: `BrandHeader.jsx` is dead code

`grep -rn "BrandHeader"` across the entire `src/` tree returns zero import sites anywhere — it is not rendered by `ContentCatalystWorkspace.jsx` or anything else. It's also already the most token-clean of any file in this feature (only 3 stray `cyan-*` refs). **Decision: leave it untouched and unrewired in this pass** — re-skinning dead code is wasted effort, and deciding whether to wire it in, replace the shell's inline header with it, or delete it outright is a real product decision outside a visual-only re-skin's scope. Flagged in `bug-log.md`, not silently dropped.

## Color mapping

Content Catalyst isn't owned by a single agent (no `--agent-content` token exists, nor should one be invented) — its interactive/identity color is mapped to the app's shared `--accent` token, matching how Mission Control already ties its own primary interactive color to the user's chosen accent theme, rather than a fixed hardcoded hue:

| Old (hardcoded) | New (token) |
|---|---|
| `cyan-400`/`cyan-300`/`cyan-200` (text) | `var(--accent)` |
| `cyan-500/10`, `cyan-400/30` (bg/border washes) | `var(--accent-dim)` / `var(--accent-border)` |
| `zinc-950` (button text-on-accent) | `var(--surface-0)` |
| `amber-400`/`amber-500`/`amber-300` (in-progress/warning banners, Publish button) | `var(--warning)` / `var(--warning-dim)` (matches the existing pattern from `ResearchReportPanel.tsx`) |
| `amber-100`/`amber-200` (warning body text) | `var(--text-2)` |
| `rose-400` (failed-status badge, shell only) | `var(--error)` |
| `zinc-200`/`zinc-400`/`zinc-500`/`zinc-600` (assorted body/label text, shell only) | `var(--text-2)`/`var(--text-3)`/`var(--text-4)` per existing brightness convention |

No `Zone` wrapping in this pass — unlike Hector's 5 independent sub-panels, these components are tightly composed inside a shared 2-column grid layout (`GeneratorForm`/`DraftPreview` side-by-side, etc.) where introducing `Zone`'s wash-only "no cards" treatment would need a real layout redesign, not a color-token swap. They keep their existing bordered-card treatment (`border-[var(--border)] bg-[var(--surface-1)]`), which is already token-correct — only the non-token accent/status colors change.

## Test coverage

None of `ContentCatalystWorkspace.jsx`, `GeneratorForm.jsx`, `DraftPreview.jsx`, or `ContentCalendar.jsx` have any existing tests (verified: `find src/test -iname "*ContentCatalyst*" -o -iname "*GeneratorForm*" -o -iname "*DraftPreview*" -o -iname "*ContentCalendar*"` returns nothing). `BrandSettings.jsx` also has none. Given this is a styling-only pass and these components have real, non-trivial existing behavior untouched by it, add one minimal smoke test per component (renders without crashing + one real interaction), not exhaustive coverage — consistent with the proportional-effort precedent set for Hector's re-skin.

## Explicitly open / deferred

- `BrandHeader.jsx`'s dead-code status (bug-log.md, new entry) — not resolved here.
- Any layout change (`Zone` adoption, grid restructuring) — deferred, this is colors-only.
