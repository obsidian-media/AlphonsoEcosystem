# Phone app phase 3 part B (Teams, Skills, Settings, Connectors; desktop Approvals page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The desktop gets an Approvals page in Settings; a paired phone can see and run teams, see skills, see and switch approvals, models and notifications (Face ID for anything that asks less), and see connectors and switch them on or off.

**Architecture:** One settings writer feeds the running desktop app's settings state, used by the phone's calls. New mirrored stores (`settings`, `teams`, `skills`, `connectors`) and calls (`phase3bCalls.ts`) follow part A's pattern; the phone gets four more pages under More.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Capacitor phone app.

**Spec:** `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase3b-design.md`

## Global Constraints

- Part A's rules: sealed messages, the computer decides, keys never cross the relay, no hardcoded names, addresses or model lists, the snapshot carries every store in one message under 4 MB, a phone call waits at most 30 s.
- Nothing secret reaches the phone (`clean()` in the mirror); no key, token or price is typed on the phone.
- "Asks less" needs `lock.confirm(…, { strict: true })` on the phone and `confirmed: true` in the call, else the computer refuses with `NEEDS_CONFIRM` = "Confirm with Face ID or your fingerprint on the phone first.": Approval Mode on→off, an effect switch on→off, Zero-Cost Mode on→off, paid models off→on, monthly cap raised, an agent switched to a paid model.
- Locked effects (`LOCKED_EFFECTS`: spend, publish_or_send, delete) can't be switched off from anywhere.
- A change carries the value it was based on; a different current value → refused with `STALE` (part A's line) and the latest.
- Docs in the same commit as the code (CLAUDE.md rows, CHANGELOG, `docs/PHONE.md`, generated map, doc counts).

## Review Focus

1. The desktop app open while the phone changes a setting: the desktop's next save must not put the old value back → test in Task 1.
2. A phone change that asks less sent without `confirmed` (a modified or old phone) → refused by the computer → test in Task 4.
3. A locked effect sent as off → refused, stays on → test in Task 4.
4. A model the computer doesn't list (typed, or removed since) → refused → test in Task 4.
5. A team run that takes minutes → the phone gets an answer when it starts → test in Task 4.

---

### Task 1: One settings writer the running app follows

**Files:** Create `src/services/settingsWriter.ts`; Modify `src/contexts/SettingsContext.jsx`; Test `src/test/services/settingsWriter.test.tsx`

**Interfaces — Produces:** `readAppSettings(): Record<string, any>`; `applySettingsPatch(patch: Record<string, unknown>): Record<string, any>` (deep-merges `effectApprovals`, `paidModels`, `phoneNotify`; writes `alphonso_settings`; dispatches `SETTINGS_PATCH_EVENT = 'alphonso:settings-patch'` with the patch); `SettingsProvider` merges the same patch into its state on that event.

- [ ] Failing tests: a patch updates storage keeping other keys; with `SettingsProvider` rendered, a patch shows in `useSettings().settings` and the provider's next save keeps it (change another setting through the context, then storage still has the patched value); nested `effectApprovals` merge keeps the other effects.
- [ ] Run → FAIL. Implement. Run → PASS with `src/test/contexts` and SettingsView tests. Commit `feat(settings): one writer the running app follows`.

### Task 2: The desktop Approvals page

**Files:** Modify `src/components/SettingsView.tsx` (new `{ id: 'approvals', label: 'Approvals', Icon: ShieldCheck }` after General; move Approval Mode + `EffectApprovalsTable`, `PaidModelsPanel`, the OpenRouter free-limit choice, waiting-request expiry and `JoseTelegramPanel` into it, unchanged), `src/test/settingsPathsInMessages.test.js` (Approvals is now a real tab: the test checks every "Settings → X" in screen text names a tab in `SETTINGS_SECTIONS`), comments changed in 9eb7ef3 back to "Settings → Approvals", `docs/governance/DEFERRED_WORK.md` (entry closed); Test `src/test/SettingsView.smoke.test.jsx`

- [ ] Failing tests: the Approvals section shows Approval Mode, each "Ask before: …" switch, Allow paid models, the expiry field and Jose on Telegram; General shows none of them; a screen text naming a tab that doesn't exist fails the guard.
- [ ] Run → FAIL. Move the panels. Run SettingsView tests and the guard → PASS. Commit `feat(settings): an Approvals page`, with docs (CLAUDE.md "Settings → General table" row → Approvals, USER_MANUAL if it names the place).

### Task 3: Mirror part B to the phone

**Files:** Create `src/services/phone/phase3bMirror.ts`; Modify `phoneProtocol.ts` (`MirroredStore` + `'settings' | 'teams' | 'skills' | 'connectors'`), `phoneMirror.ts` (polled like part A), `phoneNotifications.ts` (`phoneNotify.boardroomEscalations !== false` gates `checkBoardroom`); Test `src/test/services/phone/phase3bMirror.test.ts`

**Interfaces — Produces:**
- `settingsMirrorData(): PhoneSettings` = `{ approvalMode, effectApprovals: Record<JoseEffect, boolean>, lockedEffects: JoseEffect[], paidModels: { allowed, monthlyCapUsd, monthSpendUsd }, waitingExpiryDays, zeroCostMode, showModelThinking, phoneNotify: Record<string, boolean>, agents: Array<{ id, name, provider, model }>, modelChoices: Array<{ provider, model, label, paid: boolean }> }` (choices from what the computer's Settings offers: installed Ollama chat models (`isChatModel`), set-up cloud providers' lists, OpenRouter's free models, the paid model when allowed; read async, cached by the mirror's poll).
- `teamsMirrorData(): Array<{ id, name, job, steps: Array<{ stepId, agent, actionType, needs }>, problems: string[] }>` (user templates that are teams, `templateProblems`).
- `skillsMirrorData(): { skills: Array<{ agent, name, useWhen, builtIn, stats: string }>, refused: Array<{ file, reason }> }` (`statsLine(skillStats(...))`).
- `connectorsMirrorData(): Array<{ id, name, status, enabled, needsKeys: boolean, lastCheck: { atMs: number; ok: boolean; checked: 'live' | 'key_only' } | null }>` (`deriveConnectorStatus`, the auth profile's `enabled`, the Health Monitor's last saved result if it keeps one (find where `checkConnectorHealth` results are stored; if nowhere, keep the latest per connector when a check runs); no key values or names of saved keys).

- [ ] Failing tests: no secret-named field or key value in `JSON.stringify(mirrorSnapshots())` with keys saved; locked effects listed; a model choice for each installed chat model and none for an embedding model; a team with a problem lists it; Boardroom escalations off → no notice.
- [ ] Run → FAIL. Implement. Run `src/test/services/phone` → PASS. Commit `feat(phone): mirror settings, teams, skills and connectors`.

### Task 4: The phone's part-B calls

**Files:** Create `src/services/phone/phase3bCalls.ts`; Modify `phoneProtocol.ts`, `phoneCalls.ts`; Test `src/test/services/phone/phase3bCalls.test.ts`

**Interfaces — Consumes:** `applySettingsPatch` (Task 1), `settingsMirrorData` (Task 3). **Produces** `PHASE3B_CALLS`:
- `'settings.set'` `{ setting: SettingPath, value, base, confirmed? }` where `SettingPath` is one of `approvalMode`, `effect:<JoseEffect>`, `paidModels.allowed`, `paidModels.monthlyCapUsd`, `waitingExpiryDays`, `zeroCostMode`, `showModelThinking`, `notify:<kind>`; any other path refused. Returns `{ ok, latest: PhoneSettings }`.
- `'agent.setModel'` `{ agentId, provider, model, base, confirmed? }` → `setAgentProvider` when `{provider, model}` is in `modelChoices`.
- `'team.run'` `{ id, text }` → `runTeam(id, text, { source: 'phone', …settings })`, answering when the request starts (part A's `project.start` pattern).
- `'connector.setEnabled'` `{ id, enabled, base }` → `updateConnectorAuthProfile(id, { enabled })`.

- [ ] Failing tests: each happy path; asks-less without `confirmed` → `NEEDS_CONFIRM` and nothing changed; asks-more without it → applied; `effect:spend` off → refused; unknown path → refused; stale `base` → `STALE` with latest; a model not offered → refused; a team run that never ends answers with its request id.
- [ ] Run → FAIL. Implement. Run → PASS. Commit `feat(phone): settings, model, team and connector calls`.

### Task 5: Phone data for part B

**Files:** Modify `src/services/phone/remoteData.ts`; Test `remoteData.test.ts`
**Produces:** `MoreData` gains `settings(): PhoneSettings | null`, `teams()`, `skills()`, `connectors()`, empty until the computer sends them.
- [ ] Failing test: snapshots show; empty before. Implement. PASS. Commit `feat(phone): part B data on the phone`.

### Task 6: The phone screens

**Files:** Create `src/mobile/screens/Teams.tsx`, `Skills.tsx`, `PhoneSettings.tsx`, `Connectors.tsx`; Modify `More.tsx` (seven entries, "On your computer for now" removed); Test `src/test/mobile/phase3bScreens.test.tsx`

- [ ] Failing tests: Teams lists steps and problems, Run sends `team.run` with the typed job (disabled when the team has problems); Skills shows each agent's skills with the stats line and refused files; Settings: switching Approval Mode off calls `lock.confirm(…, { strict: true })` then `settings.set` with `confirmed: true`, a refused lock sends nothing, switching it on sends without asking, a locked effect's switch is shown on and disabled, the model picker lists only `modelChoices`; Connectors: on/off sends `connector.setEnabled`, "Set up on your computer" for `needsKeys` and not set up; all four show the offline line and disable switches offline.
- [ ] Run → FAIL. Implement (one column, thumb-sized switches; labels from `EFFECT_LABELS`, `AGENT_NAMES`). PASS; `cd mobile && npm run typecheck`. Commit `feat(phone): Teams, Skills, Settings and Connectors screens`, with docs (CLAUDE.md, CHANGELOG, `docs/PHONE.md`).

### Task 7: Over the real relay

- [ ] Extend `phoneEndToEnd.test.js`: Zero-Cost Mode off from the phone is refused without `confirmed` and applied with it; a team run from the phone starts a request. Commit `test(phone): part B over the real relay`.
