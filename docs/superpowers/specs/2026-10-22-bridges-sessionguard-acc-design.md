# Bridges: SessionGuard and ACC — design (owner decisions, 2026-10-22)

Status: **agreed with the owner. Phase 1 done 2026-10-22 (batch 14); phases 2–4 not built.** The decisions are the owner's
answers to QA questions Q27–Q31 (`docs/qa/DESKTOP_QA_COVERAGE.md`). Build in
phases, one PR each, with the owner's review between phases.

## Why

Two of the owner's other apps were meant to work with Alphonso:

- **SessionGuard** (`github.com/Thatisshayan/sessionguard`): local-first
  session intelligence for live casino/slot sessions. It reads the game from
  the screen (OCR), turns it into spin events, and detects risky patterns
  (tilt, chasing losses, bet escalation, cold runs). Coach Mode was meant to
  be Alphonso's side of this: Alphonso coaching the player during a live
  session.
- **ACC, Agent Command Center** (`github.com/Thatisshayan/ACC`): the owner's
  job/outreach/content automation system (`localhost:4000`, Railway). It
  already has a receiver for Alphonso packets (`docs/ALPHONSO_BRIDGE_RECEIVER.md`
  in that repo).

Coach Mode drifted: the 2026-07-23 Session Coach plan forbade any SessionGuard
connection and pointed the coach at how the user runs AI agents. The
gambling-shaped parts of the UI stayed, connected to nothing (Spins/Net/Stretch
tiles that are always 0, "Pause 60 s" that pauses nothing, "End session" that
ends nothing).

## Decisions

| Topic | Decision |
|---|---|
| Optional | Alphonso works fully without either app. A bridge's features appear only when that bridge is connected. |
| Where | A **Bridges** section in Settings lists SessionGuard and ACC: not found / found / connected, setup, and a Test button. ACC's settings move there from Connectors. |
| Coach Mode | The **player is coached** during a live gambling session. Coach Mode (sidebar entry and window) appears only when SessionGuard is connected. |
| Data | Alphonso connects to **SessionGuard's live feed** (its `/ws/{scope}` websocket) and receives spins and alerts. |
| Wording | **SessionGuard detects** the pattern; **an Alphonso agent words** the coaching. |
| Where shown | A **floating window over the game** (the existing always-on-top Coach window, mini mode, corner snap). |
| Hard stop | **Pause 60 s:** a cooldown over the game that can't be dismissed early. **End session:** ends the session in SessionGuard and shows a summary (time played, net, patterns seen). **Continue anyway:** recorded, so later coaching knows a warning was overridden. |
| SessionGuard sign-in | **Sign in once from Alphonso** (Settings → Bridges → SessionGuard: username and password). Alphonso keeps only the refresh token, in the OS keychain, never the password, and renews the 60-minute access token itself. No change to SessionGuard. |
| Agent-operations coach | The current coach (11 detectors about approvals, failures, the dead-letter queue…) stays **as its own feature**, renamed, without the gambling leftovers. |

## SessionGuard facts this design relies on (read from its repo, 2026-10-22)

- Backend: FastAPI on `127.0.0.1:8000`; auth is PBKDF2 + JWT (access token
  60 min, refresh 30 days).
- Live feed: `WS /ws/{scope}`; the token comes as `?token=` or an
  `Authorization` header; no or invalid token closes with 4401; `scope=global`
  needs an admin (4403 otherwise); a numeric scope needs access to that
  session. Messages: `{"type": "alert|insight|job|live_event|ping", "data": …}`.
- Coach: `GET /coach/{run_id}` (session access), `POST /coach/{run_id}/reset`
  (admin), `GET /coach-status`. Its engine (`engines/live_coach_engine.py`)
  fires every 3 spins with 8 detectors, NVIDIA/Ollama/rule fallback.
- To confirm when building: the login endpoint's exact path and body, how a
  session is ended through the API, and how a live session's id is found.

## ACC facts this design relies on

- `POST /api/alphonso-bridge`, `GET /api/alphonso-bridge/status`,
  `GET /api/alphonso-bridge/packets`, all with `Authorization: Bearer
  <ALPHONSO_BRIDGE_TOKEN>`; `401 unauthorized` for a wrong token,
  `503 setup_required` when ACC has no token configured.
- Packet kinds: `content_job`, `task`, `result`, `approval`, `memory`.
- Alphonso's side exists: `src/services/agentWorkshop/accBridgeService.js`
  and the `alphonso_bridge_send_packet` / `alphonso_bridge_status` backend
  commands; Content Studio shows its status.

## Phases

1. **Bridges section + ACC audit.** Move ACC's settings into Bridges; test the
   whole round trip against a running ACC (status, a `content_job`, the three
   truth states); fix what doesn't match. **Done 2026-10-22:** found and fixed
   QA Bugs 64 (backend ignored Settings) and 65 (the bridge was never turned
   on); Bug 66 (ACC accepts unknown kinds) is on ACC's side.
2. **SessionGuard connection.** Sign-in flow, keychain storage, token renewal,
   live-feed client, found/connected status, Test button.
3. **Coach Mode = gambling coach.** Show Coach Mode only when SessionGuard is
   connected; turn live alerts into coaching worded by an Alphonso agent; real
   Spins/Net/Stretch; the hard stop as decided.
4. **Agent-operations coach.** Rename it, remove the gambling leftovers, keep
   its settings.

## Open questions (ask the owner, don't assume)

- Which Alphonso agent words the gambling coaching (Alphonso himself, or a new
  "Coach" persona)? Spoken aloud by Voice OS as well, or text only?
- The new name for the agent-operations coach.
- Should a serious alert also reach the phone (Telegram/WhatsApp)?
