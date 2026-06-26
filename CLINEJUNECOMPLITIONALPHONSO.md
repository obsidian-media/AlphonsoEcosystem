# ALPHONSO — CLINE AUTONOMOUS SPRINT
**Agent:** Cline
**Branch:** `cline-sprint`
**Orchestrator:** Claude Code (reviews and merges after completion)
**Baseline:** v2.3.3 — `D:\AgentDevWork\repos\AlphonsoEcosystem`

---

## READ FIRST — MANDATORY

Before touching any file:
1. `docs/ALPHONSO_GROUND_TRUTH.md` — single source of truth
2. `CLAUDE.md` — do-not-duplicate list, build commands, architecture rules
3. `ALPHONSOAUDIT25.06.2026.md` — P0/P1 audit that generated these tasks
4. `AlphonsoJuneComplitionSprint.md` — full sprint context

---

## YOUR MISSION

You own the **TypeScript Migration + Test Coverage** workstream.

- Migrate all remaining `.jsx` component files → `.tsx` with full prop interfaces
- Raise test coverage from ~38% to ≥50%

**No bug fixes. No new features. No Rust changes.** Other agents handle those.

---

## YOUR BRANCH

```bash
git checkout -b cline-sprint
git push -u origin cline-sprint
```

Work exclusively on `cline-sprint`. Never push to `main`.

---

## FILE OWNERSHIP

**You OWN these (other agents do NOT touch them in their branches):**
- All `src/components/*.jsx` files NOT listed in OpenCode's ownership list
- All new test files (except those OpenCode listed: ecosystemHub, agentPairingView, policyEnforcementService, agentContractService)
- `tsconfig.json` (if type changes require it)

**You do NOT touch:**
- `src/components/ConnectorSetupPanel.jsx` — OpenCode owns
- `src/components/ConnectorHealthPanel.jsx` — OpenCode owns
- `src/components/ModelSwitcher.jsx` — OpenCode owns
- Any Rust files (`src-tauri/`)
- Any `voice/backend/` files
- `bridge/server.js`, `mcp-server/server.js`, `gateway/`
- Any `src/services/` files (Claude Code owns new service work)
- `src/components/BoardroomView.tsx` — Claude Code owns
- `src/components/SettingsView.tsx` — only touch if a component import is needed there (add import + render, nothing else)

---

## HOW TO OPERATE

**Fully autonomous.** Create subagents when file migrations are independent — run Batch A, B, C, D in parallel. Do not stop for questions. Only stop for: destructive git ops, secret rotation, paid API calls, pushing to main.

**Subagent strategy:** Each batch can run as a parallel subagent. Each subagent gets: a list of files to migrate, the migration rules below, and a verify command.

After ALL tasks complete:
1. Update `docs/ALPHONSO_GROUND_TRUTH.md` to reflect: total `.tsx` component count, new test count, coverage %
2. Update `CLAUDE.md` "Key Architecture Facts" — component .tsx count
3. Update `docs/CHANGELOG.md` with TypeScript migration and coverage notes
4. Commit everything to `cline-sprint`
5. Push `cline-sprint`

**Verification after every file:**
- `npm run typecheck` — must stay at 0 errors
- `npm run test` — must stay at 1983+ passing (no regressions)

---

## MIGRATION RULES (apply to every .jsx → .tsx conversion)

1. Read the `.jsx` file fully before touching it
2. Define a `Props` interface for every prop the component receives (use `interface Props { ... }`)
3. Type all `useState` hooks: `useState<Type>(initial)`
4. Type all `useRef` hooks: `useRef<HTMLElement>(null)`
5. Type all event handlers: `(e: React.ChangeEvent<HTMLInputElement>)`
6. Type all callback props: `onClose: () => void`, `onChange: (value: string) => void`
7. Remove the old `.jsx` file after creating the `.tsx` version
8. Do NOT add comments explaining the migration — just convert
9. Do NOT change logic — only add types
10. Do NOT introduce new imports or new functionality

**After each migration:** `npm run typecheck` must have 0 errors. If a file causes type errors, fix the errors — do not skip the file or add `// @ts-ignore`.

---

## BATCH A — HIGH-TRAFFIC COMPONENTS (run as parallel subagents)

Each of these is independent. Launch as parallel subagents.

**C-01** Migrate `src/components/OnboardingWizard.jsx` → `OnboardingWizard.tsx`

**C-02** Migrate `src/components/OllamaOfflineBanner.jsx` → `OllamaOfflineBanner.tsx`

**C-03** Migrate `src/components/BootStatusBanner.jsx` → `BootStatusBanner.tsx`

**C-04** Migrate `src/components/RuntimeManagerView.jsx` → `RuntimeManagerView.tsx`

**C-05** Migrate `src/components/WorkflowBuilderView.jsx` → `WorkflowBuilderView.tsx`

**C-06** Migrate `src/components/AutomationView.jsx` → `AutomationView.tsx`

**C-07** Migrate `src/components/AgentActivityLog.jsx` → `AgentActivityLog.tsx`

**C-08** Migrate `src/components/AgentDock.jsx` → `AgentDock.tsx`

**C-09** Migrate `src/components/ApprovalModal.jsx` → `ApprovalModal.tsx`

**C-10** Migrate `src/components/AgentPairingView.jsx` → `AgentPairingView.tsx`

After Batch A: run `npm run typecheck` + `npm run test` — both must pass before continuing.

---

## BATCH B — SETTINGS & DATA VIEWS (run as parallel subagents)

**C-11** Migrate `src/components/WorkspaceExportImportView.jsx` → `WorkspaceExportImportView.tsx`

**C-12** Migrate `src/components/CrashLogView.jsx` → `CrashLogView.tsx`

**C-13** Migrate `src/components/NovaHistoryChart.jsx` → `NovaHistoryChart.tsx`

**C-14** Migrate `src/components/SentinelFindingModal.jsx` → `SentinelFindingModal.tsx`

**C-15** Migrate `src/components/WhatsAppInboxPanel.jsx` → `WhatsAppInboxPanel.tsx`

**C-16** Migrate `src/components/MeetingTranscriptionPanel.jsx` → `MeetingTranscriptionPanel.tsx`

**C-17** Migrate `src/components/ConnectorStatusIndicators.jsx` → `ConnectorStatusIndicators.tsx`

**C-18** Migrate `src/components/AgentMetricsPanel.jsx` → `AgentMetricsPanel.tsx`

**C-19** Migrate `src/components/CompanionPairingPanel.jsx` → `CompanionPairingPanel.tsx`

After Batch B: run `npm run typecheck` + `npm run test`.

---

## BATCH C — CONTENT & WORKFLOW COMPONENTS (parallel subagents)

**C-20** Migrate `src/components/EcosystemHub.jsx` → `EcosystemHub.tsx` (if .jsx; check first)

**C-21** Migrate `src/components/ContentCatalystWorkspace.jsx` → `ContentCatalystWorkspace.tsx` (if .jsx)

**C-22** Migrate `src/components/WhatsAppInboxPanel.jsx` → already in Batch B, skip if done

**C-23** Glob `src/components/agentWorkshop/*.jsx` — list all files and migrate each to `.tsx`

**C-24** Glob `src/components/*.jsx` — after Batches A and B, identify any remaining `.jsx` files NOT owned by OpenCode and migrate them all

For C-24: build the list programmatically:
```bash
ls src/components/*.jsx
```
Then exclude: `ConnectorSetupPanel.jsx`, `ConnectorHealthPanel.jsx`, `ModelSwitcher.jsx`
Migrate everything else.

After Batch C: run `npm run typecheck` + `npm run test`. All `.jsx` components (except OpenCode's 3) must now be `.tsx`.

---

## BATCH D — TEST COVERAGE (run after all migrations are done)

Coverage target: `npm run test:coverage` shows ≥50% overall.

**Strategy:** Run `npm run test:coverage` first to identify which service files have 0% or low coverage. Then add tests for those first.

Each test file below is independent — run as parallel subagents.

**T-01** `src/test/orchestrationQueueService.test.js`
- Add tests for: enqueue, state transitions (new → pending → queued → dead_letter), dead-letter capping, retry, manual interrupt
- Target: 15 new tests
- Validation: all pass

**T-02** `src/test/orchestrationReceiptService.test.js`
- Add tests for: receipt creation per flow type, retrieval, 100-entry ring cap
- Target: 10 new tests

**T-03** `src/test/unifiedMemoryService.test.js`
- Add tests for: namespace filters, cross-namespace reads, migration compatibility from old services
- Target: 12 new tests

**T-04** `src/test/mariaAuditService.test.js`
- Add tests for: risk assessment, deterministic fallback, high-risk block, low-risk pass, Ollama timeout path
- Target: 10 new tests

**T-05** `src/test/echoMemoryService.test.js`
- Add tests for: synthesis, retention classification, confidence normalization, Ollama fallback
- Target: 10 new tests

**T-06** `src/test/marcusExecutionService.test.js`
- Add tests for: governance gate, GitHub dispatch path, Slack dispatch path, blocked-on-critical path
- Target: 10 new tests

**T-07** `src/test/hectorResearchService.test.js`
- Add tests for: RSS fetch, parseRssItems, Tavily fallback, Perplexity fallback
- Target: 10 new tests

**T-08** `src/test/novaAnalysisService.test.js`
- Add tests for: 4-dimension scoring, saveOpportunityScore, getOpportunityHistory 30-entry cap, Ollama fallback
- Target: 10 new tests

**T-09** `src/test/sentinelSecurityService.test.js`
- Add tests for: threat detection, secret detection, scheduled scan interval, quick scan, Ollama fallback
- Target: 12 new tests

**T-10** `src/test/pluginRegistryService.test.js`
- Add tests for: listPlugins, togglePlugin, validatePluginManifestDisk, executePluginToolRun (mock sidecar)
- Target: 8 new tests

**T-11** `src/test/pluginSigningService.test.js`
- Add tests for: keypair generation, sign, verify, verifyAndAddPlugin, trusted signer management
- Target: 10 new tests

**T-12** `src/test/workspaceExportService.test.js`
- Add tests for: exportWorkspace captures all `alphonso_*` keys, importWorkspace restores keys, round-trip integrity
- Target: 8 new tests

**T-13** `src/test/connectorRegistryService.test.js`
- Add tests for: policy gate called before send, blocked connector returns error, audit entry created on send
- Target: 10 new tests

**T-14** Component tests — `src/test/components/` (create directory if needed)
- `NotificationCenter.test.tsx` — render, add notification, clear all, colored border per type (6 tests)
- `AgentPerformanceView.test.tsx` — render with mock receipts, success/error/latency display (6 tests)
- `OnboardingWizard.test.tsx` — step progression, skip behavior (6 tests)
- `WorkflowBuilderView.test.tsx` — render, add node, save (5 tests)
- `SentinelFindingModal.test.tsx` — render, severity badge, close behavior (5 tests)

**T-15** Coverage gate check
- Run `npm run test:coverage`
- If < 50%: identify the next-lowest-coverage services and add targeted tests until threshold is met
- Document the final coverage % in your completion report

---

## COMPLETION CHECKLIST

Before pushing `cline-sprint`:

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run test` — all 1983+ pass + your new tests
- [ ] `npm run test:coverage` — ≥50%
- [ ] `npm run lint` — clean
- [ ] All `src/components/*.jsx` files migrated (except the 3 OpenCode owns)
- [ ] All `src/components/agentWorkshop/*.jsx` files migrated
- [ ] At minimum 13 new service test files added
- [ ] At minimum 5 new component test files added
- [ ] `docs/ALPHONSO_GROUND_TRUTH.md` updated: component .tsx count, test count, coverage %
- [ ] `CLAUDE.md` updated: Key Architecture Facts component count
- [ ] `docs/CHANGELOG.md` updated
- [ ] All committed and pushed to `cline-sprint`

---

## RETURN MESSAGE TO ORCHESTRATOR

When done, report:
1. Total `.tsx` component count (should be 73 total)
2. New test count (1983 + your additions)
3. Coverage % achieved
4. Any type errors you could not resolve (unlikely — report as blocker)
5. Any merge conflicts you anticipate with `main`

**Branch:** `cline-sprint` → Orchestrator will review and merge.
