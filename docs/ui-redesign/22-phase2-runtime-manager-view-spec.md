# Phase 2 — Runtime Manager View Re-skin Spec

## Scope

Re-skin `RuntimeManagerView.tsx` (826 lines, 85 real hardcoded color refs). Existing test coverage (`src/test/RuntimeManagerView.test.tsx`, 2 tests) reused as the regression guard. Same recipe as the previous 8 re-skins, with one real scope carve-out — same class of finding as `ConnectorSetupPanel.tsx`.

## Real finding: `TOOL_META`'s per-tool identity colors are already half-migrated, and the rest is deliberate — not leftover

`TOOL_META` (the config object mapping each of the ~14 real runtime tools to an icon/category/color) already uses `--agent-*` tokens for every tool that's conceptually owned by a specific agent (Hector, Maria, Marcus, Nova) — a real, already-completed partial tokenization from before this pass. The remaining 6 tools that aren't agent-specific (`voice-os`, `mcp-server`, `alphonso-bridge`, `chromadb`, `openHands`, `n8n`) still use distinct hardcoded colors (cyan/purple/violet/emerald/cyan/orange) for the same reason `ConnectorSetupPanel.tsx`'s per-connector palette exists: visually telling apart many real, distinct items in one list. **These 6 are excluded from this re-skin, matching the `ConnectorSetupPanel.tsx` precedent exactly** — collapsing them to a shared token would make this list inconsistent with itself (8 already-distinct agent colors sitting next to 6 suddenly-uniform ones would look like a bug, not a fix).

## What IS in scope: genuine action/state chrome, verified as tool-agnostic

Everything in `ToolCard`, `StatusDot`, `ProgressBar`, `PrereqPanel`, `LiveLogPanel`, and `ModulesPanel` that isn't `meta.color`/`meta.bg` — verified by reading each site's real code, not assumed:
- The Install/Start/Stop buttons and the autostart toggle use flat hardcoded colors (`violet`/`emerald`/`red`) regardless of which tool's card they're rendered in — real generic action chrome, not tied to `TOOL_META` at all.
- `ProgressBar` takes only a `pct` prop, no tool/color info — its fill color is genuinely tool-agnostic.
- `StatusDot`'s running/installing/idle states are real semantic states.

## Color mapping (scope: everything except `TOOL_META`'s 6 non-agent tool colors)

| Old (hardcoded) | New (token) | Role |
|---|---|---|
| `zinc-*` (all shades) | `--text-1` through `--text-4` / `--surface-1`/`--surface-2` | Standard brightness convention |
| `emerald-*` (StatusDot running, Start button) | `--success` / `--success-dim` | Positive/go states |
| `red-*` (Stop button) | `--error` / `--error-dim` | Matches Voice's identical "Stop" button precedent |
| `amber-*` (StatusDot installing, PrereqPanel missing-prereqs banner) | `--warning` / `--warning-dim` | |
| `violet-*` used for the Install button, `ProgressBar`'s fill, and the autostart-on toggle (all 3 are flat/tool-agnostic per the finding above) | `--accent` (Install button, progress fill — primary/in-progress actions) or `--success` (autostart-on toggle — matches this session's established "on/enabled toggle = success" precedent from Operator Dashboard and Voice) | Same literal old color mapping to two different tokens depending on real role, not literal hex reuse — consistent with this session's role-based mapping approach throughout |

## Test coverage

`src/test/RuntimeManagerView.test.tsx` (2 tests, pre-existing) reused as the regression guard.

## Explicitly open / deferred

- `TOOL_META`'s 6 non-agent-tied tool colors — intentionally out of scope, matching the `ConnectorSetupPanel.tsx` precedent.
- No `Zone` adoption — matches every non-Hector page.
