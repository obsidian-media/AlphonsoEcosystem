# Phase 2 — Connector Setup Panel Re-skin Spec

## Scope

Re-skin `ConnectorSetupPanel.tsx` (1043 lines) — but with a real, deliberate scope carve-out found during the color audit, described below. Existing test coverage (`src/test/ConnectorSetupPanel.test.jsx`) reused as the regression guard.

## Real finding that changes this file's scope: the per-connector color palette is intentional, not leftover chrome

Unlike every other file re-skinned this session, `ConnectorSetupPanel.tsx` deliberately assigns a **different hardcoded color to each of ~20 real external connectors** via `CredentialSection`'s `borderColor`/`bgColor`/`accentColor` props (GitHub=violet, Slack=green, Discord=indigo, Notion=pink, ClickUp=purple, WhatsApp=emerald, YouTube=red, Qwen=yellow, Brave=orange, Tavily=sky, NVIDIA=lime, Gemini=blue, etc. — verified directly against all 21 real call sites, not assumed) plus a standalone inline Telegram section using its own `sky-*` branding outside that shared component. This is the same kind of deliberate multi-color visual differentiation this session already decided to leave untouched on Mission Control's Quick Launch cards (3 different hardcoded hues for 3 different destinations) — except here it's real product/brand differentiation across ~20 distinct external services in one long list, which is a stronger case for preservation, not a weaker one. Collapsing all of these to a single `--accent` token would be a real design regression: it would make a list whose whole point is "quickly tell which connector this is" visually uniform.

**Decision: exclude the `CredentialSection` call-site color props (all ~21 of them) and the standalone Telegram section's `sky-*` branding from this re-skin entirely.** They are correctly scoped out, not overlooked — verified line-by-line during spec-writing, not silently skipped.

## What IS in scope: genuine structural/semantic chrome

Everything else in the file that isn't part of the deliberate per-connector palette: the shared structural pieces of `CredentialSection`/`ConnectorCard`/`PlaceholderConnectorBanner` (labels, hints, form input styling — NOT the color props passed into them), the connector status-badge dict (`configured`/`local_only`/`not_configured`/`error` — genuine semantic states, not brand colors), and the entire "Transport Testing" panel at the bottom of the file (simulate/poll/outbound-send controls, connector audit log) — real UI chrome using `zinc-*`/`emerald-*`/`red-*`/`amber-*`/`teal-*`/`indigo-*`/`cyan-*` that has nothing to do with connector branding and should be tokenized like every other page.

## Color mapping (structural chrome only)

| Old (hardcoded) | New (token) |
|---|---|
| `zinc-*` (all shades) | `--text-1` through `--text-4` (text) / `--surface-1`/`--surface-2` (backgrounds), standard brightness convention |
| `emerald-*` (success/configured/live states) | `--success` / `--success-dim` |
| `red-*` (error states) | `--error` / `--error-dim` |
| `amber-*` (warning/pending/"Coming Soon" states) | `--warning` / `--warning-dim` |
| `slate-*` (the status dict's "local_only" tone — a real 4th distinct state from configured/not_configured/error) | `--accent` — no dedicated 4th semantic token exists for "runs locally, not a live external connection," and `--accent` already serves this "neutral distinct state" role on every other page this session |
| `teal-*`/`indigo-*`/`cyan-*` (Transport Testing panel's action-button accents — generic UI chrome, not connector branding, since this panel operates on whichever connector is currently selected via a dropdown) | `--accent` / `--accent-dim` for the primary actions; `--success`/`--warning` where a button's real function is success/danger-toned (e.g. "Live Proof" → success, "Disable Auth" → warning) |

## Test coverage

`src/test/ConnectorSetupPanel.test.jsx` (pre-existing) reused as the regression guard — run before and after to confirm the excluded palette lines produce zero diffs there and the fixed structural chrome doesn't break existing assertions.

## Explicitly open / deferred

- The per-connector brand color palette (both `CredentialSection` props and the Telegram section) — intentionally out of scope, not a gap.
- No `Zone` adoption — matches every non-Hector page.
