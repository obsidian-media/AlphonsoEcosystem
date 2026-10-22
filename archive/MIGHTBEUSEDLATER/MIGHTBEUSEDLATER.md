# Archived Code — Might Be Used Later

This folder holds source files that were removed from the active codebase
but preserved rather than permanently discarded, per `REPO_RULES.md`'s
R14 (no file deletion without direct Shayan approval). Files land here when
their removal is functionally correct but the deletion itself either wasn't
explicitly approved first, or is being kept as a reference in case similar
functionality is wanted again later.

**These files are not imported, not built, not tested, and not part of the
app.** They exist purely as a reference so nobody has to rebuild the same
thing from scratch if a similar need comes up. Do not resurrect them by
simply moving them back into `src/` — check first whether the reason they
were retired still holds (see each entry below), and treat any restoration
as new work requiring its own review, not a revert.

---

## OnboardingWizard.tsx (+ 2 test files)

- **Archived:** 2026-09-08
- **Originally removed in:** commit `c6d5921`, "feat(setup): add Install
  Queue, Activation Sequence, wire Launch; retire OnboardingWizard"
  (branch `feat/smart-installer-bundling`, PR #233)
- **Files:** `OnboardingWizard.tsx`, `OnboardingWizard.test.jsx` (was
  `src/test/OnboardingWizard.test.jsx`), `OnboardingWizard.test.tsx` (was
  `src/test/components/OnboardingWizard.test.tsx`)
- **Why it was removed:** `OnboardingWizard.tsx` was the in-app first-run
  flow (6 steps: Ollama check, model picker, approval-mode decision,
  connect-a-channel, advanced-services check, ready) that gated
  `App.tsx`'s render via a `showOnboarding`/`alphonso_onboarding_complete_v1`
  flag. It was replaced end-to-end by `SetupFlow.tsx` and the `setup/`
  screen family (`SystemScan`, `IntentSelection`, `RecommendedSetup`,
  `AgentGrid`, `InstallQueue`, `ActivationSequence`) — see
  `docs/superpowers/specs/2026-09-07-smart-installer-design.md` for the
  full design rationale. Every one of the wizard's 6 steps already had (or
  now has) a standalone permanent home elsewhere in the app for "change
  this later" (Runtime Hub, `SettingsView.tsx`'s `settings.approvalMode`
  toggle, `ConnectorSetupPanel.tsx`) — confirmed directly before removing
  it, not assumed. `useAppShellState.js`'s gating flag was renamed
  `showSetup`/`alphonso_setup_complete_v1`, with the legacy flag migrated
  forward on read (`isSetupComplete()` in `setupFlowService.ts`) so
  existing installs aren't forced back through a first-run flow.
- **Why archived instead of just deleted:** the deletion happened without
  first asking for explicit approval, which R14 requires regardless of how
  clearly obsolete a file looks ("ask first, even if the file looks
  obsolete... this rule is strict"). Restoring the files here — out of the
  active build, but not gone — satisfies both the "don't force a silent
  reversal" instinct and R14's actual requirement going forward.
- **If you're considering resurrecting this:** don't, without checking
  whether `SetupFlow.tsx` still fully covers its role first. If it does
  (the expected case — this is why it was retired), there's nothing to
  gain by bringing this back. If some future redesign removes `SetupFlow`
  without a direct replacement, this is what the old flow looked like,
  not a template to copy blindly — check current `runtimeManagerService.ts`
  API surface first, since several functions it called
  (`checkOllama`, `pullOllamaModel` signatures, etc.) may have changed
  since 2026-09-07.

---

## BoardroomView.tsx (+ 1 test file)

- **Archived:** 2026-10-21, with the owner's approval ("move those three actions into the Boardroom chat, then remove Legacy Tab")
- **Files:** `BoardroomView.tsx` (was `src/components/BoardroomView.tsx`), `boardroomView.test.jsx` (was `src/test/boardroomView.test.jsx`)
- **What it was:** the original session-style Boardroom (pick agents and a topic, "Convene Session"), shown as the "Boardroom Legacy" tab next to the group chat (`BoardroomChatView.tsx`) that replaced it on 2026-07-10.
- **Why it was removed:** two Boardrooms side by side, and the owner decided Boardroom is the group chat (QA Q2, Bug 45). Its agent "discussion" was mostly scripted rather than model replies.
- **What moved, and what did not:** its three actions now live on every Boardroom thread: Conclude (Maria's governance review), Distribute (Marcus) and Creative brief (Miya via Jose). Two behaviours were deliberately not carried over because they were untrue: Conclude showed a random "Maria risk score" (`Math.random()*40+20`; Maria's audit returns a risk level, not a number), and Distribute always toasted "sent via Marcus" although it gave Marcus no destination, so nothing was sent. Old sessions are imported into threads by `migrateLegacySessions()`, which now picks up every session not yet imported, not just those that existed on its first run.
- **Before restoring:** don't. Extend the thread actions in `BoardroomChatView.tsx` instead.
