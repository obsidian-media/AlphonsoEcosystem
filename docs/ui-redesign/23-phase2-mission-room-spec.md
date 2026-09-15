# Phase 2 — Mission Room Re-skin Spec

## Scope

Re-skin `MissionRoom.tsx` (520 lines, 65 real hardcoded color refs). Existing test coverage (`src/test/components/MissionRoomKanbanStatus.test.tsx`) reused as the regression guard. Same recipe as the previous 10 re-skins, with a real per-agent-palette carve-out (a third one this session) — plus a genuine, previously-undiscovered bug found and fixed along the way.

## Real finding #1: `MISSION_ROOM_AGENTS` is the stale, never-fully-built 11-seat roster (Kairo included) — not the real 9-agent system

`missionRoomService.ts`'s `MISSION_ROOM_AGENTS` includes a `kairo` entry ("Backend engineering — systems, APIs, data, reliability, scaling") — confirmed, this is the same aspirational 11-seat design (`BOARDROOM_MODEL_REGISTRY.md`/`BOARDROOM_ROLES.md`) that CLAUDE.md already documents as never actually built, just left in place with correction banners on the real Boardroom pages. `MissionRoom.tsx`'s agent color palette is keyed to this legacy 11-agent roster's own `accent` field, not the real 9-agent `--agent-*` token set — remapping to `--agent-hector`/`--agent-miya`/etc. would be incorrect here, since e.g. this file's "Miya" accent (`pink`) has no defined relationship to the real `--agent-miya` token's actual hue, and `kairo` has no real per-agent token at all. **This per-agent palette is deliberately excluded from full-token consolidation**, matching the `ConnectorSetupPanel.tsx`/`RuntimeManagerView.tsx` precedent — it's real, intentional multi-agent visual differentiation for this specific (legacy) roster, not leftover chrome.

## Real finding #2 (a genuine bug, not just a re-skin nicety): `agentTone()` only handles 4 of the roster's 9 distinct accent values

`MISSION_ROOM_AGENTS` defines 9 distinct `accent` values across its 11 entries (`emerald` ×2, `cyan`, `amber`, `violet`, `pink`, `orange`, `blue`, `red`, `fuchsia`, `sky`). `agentTone()` only has explicit branches for `emerald`/`amber`/`fuchsia`/`sky` — every other value (`cyan`, `violet`, `pink`, `orange`, `blue`, `red`, meaning Alphonso, Hector, Miya, Marcus, Echo, and Sentinel) silently falls through to the generic `cyan` default. In a UI whose entire purpose is showing each agent with a distinct visual identity, 6 of 11 agents currently render visually identical (cyan) instead of distinct — defeating the feature. **Fixed as part of this pass**: `agentTone()` extended to handle all 9 real accent values with their own distinct color, restoring the differentiation this component was always meant to have. This is a real, previously-undiscovered functional bug, not a styling preference — flagged and fixed, not silently left broken.

## What IS in scope: `statusTone`/`riskTone` and all generic structural chrome

`statusTone(status)` (task kanban status: todo/doing/review/approved/blocked) and `riskTone(riskLevel)` (high/medium/low) are genuine semantic state indicators, not per-agent branding — these map cleanly onto `--success`/`--warning`/`--error`/`--accent`/`--text-*` per the same convention used on every other page's status dicts this session (Orchestrator's `TrustBadge`, Operator's `Badge`, etc.). Every other `zinc-*` structural/text color throughout `AgentCard`, `MessageBubble`, `TaskCard`, and the main `MissionRoom` shell is also in scope.

## Color mapping (structural/semantic chrome only — `agentTone`'s palette is excluded)

| Old (hardcoded) | New (token) |
|---|---|
| `zinc-*` (all shades) | `--text-1` through `--text-4` / `--surface-1`/`--surface-2` |
| `statusTone`'s `approved` (emerald) | `--success` / `--success-dim` |
| `statusTone`'s `blocked` (red) | `--error` / `--error-dim` |
| `statusTone`'s `doing` (amber) | `--warning` / `--warning-dim` |
| `statusTone`'s `review` (cyan) and default `todo` state | `--accent` / `--accent-dim` (todo/review are both "in progress, not yet a final state" — matches this session's established "neutral in-progress → accent" convention) |
| `riskTone`'s `high` (red) / `medium` (amber) / default-low (emerald) | `--error` / `--warning` / `--success` respectively |

## Test coverage

`src/test/components/MissionRoomKanbanStatus.test.tsx` (1 test, pre-existing) reused as the regression guard — specifically covers `statusTone`'s kanban-status rendering, so it's a direct guard against the mapping above breaking anything.

## Explicitly open / deferred

- `agentTone()`'s 9-color per-agent palette values themselves — intentionally kept as distinct hardcoded colors (not tokenized), matching the `ConnectorSetupPanel.tsx`/`RuntimeManagerView.tsx` precedent. Only the *coverage bug* (5 missing branches) is fixed, not the color choices themselves.
- Whether `MissionRoom.tsx`'s legacy 11-agent (including fictional Kairo) roster should eventually be reconciled with the real 9-agent system — a real, separate product decision, not something to resolve inside a visual re-skin.
- No `Zone` adoption — matches every non-Hector page.
