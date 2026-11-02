# Alphonso phone app, phase 3 part B: Teams, Skills, Settings and Connectors

**Status:** approved by the owner on 2026-11-02.
Builds on `2026-11-02-alphonso-mobile-phase3a-design.md` (part A: Memory, Projects, Boardroom).

## Why

Phase 3 brings the rest of Alphonso to the phone so the old Swift companion can retire (part C).
Part B adds the remaining pages under More. While planning it the owner found that the approval
switches are hard to find on the desktop (they sit at the bottom of Settings → General, and old
notes called them "Settings → Approvals", a page that doesn't exist). The owner chose to fix that
in this same pass rather than detour from the phone work (2026-11-02): the desktop gets an
Approvals page of its own, and the phone's Settings uses the same grouping.

## Goals (owner, 2026-11-02)

### On the phone (More)

1. **Teams: see and run.** Each saved team with its agents and steps in order; Run one with a job
   typed on the phone. The run is an ordinary request on the Requests board.
2. **Skills: see each agent's skills.** What each skill is for and its record ("Used 12 times ·
   9 of 10 reviews passed · last used today"), and skill files the computer refused, with why.
3. **Settings: see and switch, no keys or passwords** (owner, earlier), three groups:
   - **Approvals:** Approval Mode, the "Ask before" switch per kind of action, Allow paid models
     on/off and its monthly cap, how many days waiting requests last.
   - **Zero-Cost Mode and models:** Zero-Cost Mode, the model each agent uses, Show model thinking.
   - **Notifications:** which notifications this phone gets.
4. **Connectors: status and on/off.** Each connector: set up or not, its last health check, and its
   on/off switch. One that needs keys says "Set up on your computer".

### On the desktop

5. **An Approvals page in Settings**, with everything about asking and spending, moved out of
   General: Approval Mode and its switch table, Allow paid models (provider, model, prices, monthly
   cap), what happens when OpenRouter's free limit runs out, how long waiting requests last, and
   Jose on Telegram. Every message, guide and comment that points to these points to the new page.

## Non-goals (part B)

- Building, editing or deleting teams on the phone; reading, writing or importing skills on the
  phone (owner chose see-and-run / see only).
- Any key, password, token or price list typed on the phone; connector setup.
- A connector "Check now" on the phone (status only, plus on/off).
- Settings sections not listed above (Runtime, Bridges, Memory, Knowledge, Appearance, Coach,
  Plugins, Logs, Backup) on the phone.
- Retiring the Swift app and the store listings (part C).

## Anti-goals

- **Stale data that looks current**, as in part A: every screen shows the offline line and turns
  its switches off while the computer is unreachable.
- **A phone that quietly lowers the guard.** See "Face ID" below.
- **Two places that disagree.** The phone shows and changes the computer's own settings; nothing is
  stored on the phone as a second copy that could drift.
- **Cramped desktop screens** on the phone: phone-shaped pages, thumb-sized switches.

## Decisions

### Owner's

- **Face ID or the fingerprint for anything that asks less:** turning Approval Mode off, turning an
  "Ask before" switch off, turning Zero-Cost Mode off, turning Allow paid models on, or raising the
  monthly cap. Changes that make Alphonso ask more or spend less need nothing extra. Uses the
  strict check (a phone with no passcode can't confirm), like approving a spend.
- **Locked effects stay locked:** spend, publish or send, and delete always ask, on both.
- The desktop's Approvals page holds everything about asking and spending (goal 5).

### My calls (the owner can change any)

- **The computer checks too.** The phone sends which way a switch goes; the computer refuses a
  change that asks less unless the phone says it confirmed (the same trust as part A's reveal and
  phase 1's locked approvals: the phone holds the lock, the computer refuses anything the phone
  marks as not confirmed).
- **A paid model for an agent counts as "asks less":** switching an agent to a paid model from the
  phone needs Face ID or the fingerprint, like turning Allow paid models on.
- **Models are chosen from lists, never typed:** the phone offers what the computer offers on its
  own Settings (installed Ollama chat models, the cloud providers set up, OpenRouter's free
  models), sent by the computer.
- **Changing the same thing on both** keeps phase 2's rule: a change carries the value it was
  based on, and is refused with the latest if the computer changed it meanwhile.
- **One settings writer.** The phone's changes go through the same function the desktop's
  Settings uses to save (so its listeners, the policy gate and the effect approvals read the new
  value at once); no second path writes `alphonso_settings`.
- **Notifications:** the phone's switches are the existing `phoneNotify` settings (waiting steps,
  plans, finished, reviews) plus Boardroom escalations; per computer, not per phone.
- **Teams run** through the same function the Teams page uses (`runTeam`), with the computer's own
  Settings, answering once the run starts (part A's lesson: the phone waits only 30 s).
- **The More tab** lists Memory, Projects, Boardroom, Teams, Skills, Settings, Connectors; "On your
  computer for now" goes away.
- **Desktop page:** the Approvals page is a new Settings section beside General; General keeps
  everything else. Old links and the guides move to the new page.

## Constraints

- Phases 1–2 and part A hold: sealed messages through the relay, the computer decides, keys never
  cross the relay, plain words, no hardcoded names, addresses or model lists, the 4 MB message
  limit (the snapshot carries every store in one message), the 30 s call limit.
- Keys, tokens and secret-named fields never reach the phone (`clean()` in the mirror).
- iOS 16.4 / Android 8.0 minimums.

## Left to the builder

- Which stores carry part B (one `settings` store with approvals, models and notifications; a
  `teams`, `skills` and `connectors` store, or fewer) and their size within the snapshot budget.
- The phone screens' layout, reusing desktop pieces (`describeAgentPermissions`, `statsLine`,
  `EFFECT_LABELS`) where they fit.
- How the desktop's Settings sections are split in `SettingsView.tsx` (moving the panels as they
  are, not rewriting them).

## Checks

- Unit tests per new phone call: a change that asks less without confirmation is refused; a stale
  change is refused with the latest; a locked effect can't be switched off; a model not in the
  computer's list is refused; a team run answers when it starts.
- Desktop: the Approvals page shows every moved control; the General page no longer does; the
  existing Settings tests pass after the move; on-screen text names only pages that exist
  (`settingsPathsInMessages.test.js` widened to the new page).
- End to end over the real relay: turning Zero-Cost Mode off from the phone is refused without
  confirmation and works with it; a team run from the phone starts a request.
- The owner checks on real phones: switch Approval Mode with Face ID; change an agent's model; run a
  team; switch a connector off.
