# Phase 2 — Operator Dashboard Re-skin Spec

## Scope

Re-skin `OperatorDashboard.tsx` (979 lines, 132 real hardcoded color-class occurrences including `blue-*` — the most of any file touched this session, verified via direct grep with the full color-family pattern this session eventually converged on). Same direct spec-and-build recipe as the previous 6 re-skins. Existing test coverage (`src/test/operatorDashboard.test.jsx`, 2 tests) reused as the regression guard.

**Structure:** a `Badge` helper with a centralized `color` dict (`zinc`/`green`/`blue`/`amber`/`red`/`indigo`) used pervasively throughout, plus 7 more small helpers at the bottom of the file (`OperatorSection`, `Panel`, `ActionButton`, `WorkspaceRow`, `ToggleTile`, `UnifiedWeeklyReportPanel`). Fixing `Badge`'s dict closes a large fraction of the total in one place; the remainder is spread through the ~800-line main body across operator-mode toggles, workspace management, and the various embedded panels (Trust Receipt Browser, Notion Sync, Ollama Preflight, Project Batch).

## Color mapping

| Old (hardcoded) | New (token) |
|---|---|
| `zinc-*` (all shades, text/bg/border) | `var(--text-1)`/`var(--text-2)`/`var(--text-3)`/`var(--text-4)` (text) or `var(--surface-1)`/`var(--surface-2)`/`var(--surface-3)` (backgrounds), per the same brightness convention used on every prior page |
| `emerald-*` / `green` (`Badge`'s "green" tone) | `var(--success)` / `var(--success-dim)` |
| `red-*` | `var(--error)` / `var(--error-dim)` |
| `amber-*` | `var(--warning)` / `var(--warning-dim)` |
| `blue-*` (`Badge`'s "blue" tone — a distinct 4th tone from indigo, used for a different semantic meaning than the neutral/informational one seen on other pages) | `var(--accent)` / `var(--accent-dim)` — `--accent`'s default hue is itself a cyan/blue, so this is a natural fit, not a stretch |
| `indigo-*` (`Badge`'s "indigo" tone — this page's *second* neutral/informational tone, distinct from "blue") | Also `var(--accent)`, but with the `/NN` opacity suffix kept distinct from blue's usage at each call site (both ultimately resolve to the same token family since neither has an independent semantic meaning here — verified by reading each call site's context, not assumed identical) |

Given `blue` and `indigo` both end up mapping to `--accent`-family tokens, `Badge`'s dict keeps both keys (no API change to callers) but their color values converge — this is a real, intentional simplification worth noting rather than hiding: the component's original design had two visually-different-but-semantically-identical "neutral info" tones, and the design system doesn't have two neutral accent tokens to preserve that difference.

## Test coverage

`src/test/operatorDashboard.test.jsx` (2 tests, pre-existing) reused as the regression guard — no exhaustive new suite, matching this session's proportional-effort precedent for files that already have some coverage (Voice, Miya).

## Explicitly open / deferred

- No `Zone` adoption — matches every non-Hector page.
- Any change to operator-mode logic, workspace toggles, or the 4 lazy-loaded embedded panels' own internals — visual-only pass on `OperatorDashboard.tsx` itself.
