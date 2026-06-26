# ALPHONSO — CLAUDE CODE AUTONOMOUS SPRINT
**Agent:** Claude Code
**Branch:** `claudecode-sprint`
**Orchestrator:** Claude Code Orchestrator instance (reviews and merges after completion)
**Baseline:** v2.3.3 — `D:\AgentDevWork\repos\AlphonsoEcosystem`

---

## READ FIRST — MANDATORY

Before touching any file:
1. `docs/ALPHONSO_GROUND_TRUTH.md` — single source of truth
2. `CLAUDE.md` — do-not-duplicate list, build commands, architecture rules
3. `ALPHONSOAUDIT25.06.2026.md` — audit context
4. `AlphonsoJuneComplitionSprint.md` — sprint context
5. `AlphonsoBeastSprint.md` — Agent OS architecture vision (50 features)
6. `AlphonsoBeastSprint3.md` — Core specs (Module manifest, Runtime API, Memory schema, Sandbox, Policy DSL, A2A)

---

## YOUR MISSION

You own three workstreams:

1. **Agent OS Foundations** — Implement the core specs from `AlphonsoBeastSprint3.md`: Module manifest system, Runtime API skeleton, Memory schema migration, Policy DSL loader, enhanced A2A protocol. These are NEW files layered on top of the existing system — you do NOT replace existing services.

2. **Observability & Reliability** — Phase 4 improvements from `AlphonsoJuneComplitionSprint.md`: watchdog, retry, error surface, bundle check, timeout fixes.

3. **Agent Capabilities & Polish** — Phase 5 + Phase 6 from `AlphonsoJuneComplitionSprint.md`: Boardroom multi-agent logic, daily scheduler presets, Telegram /boardroom command, keyboard shortcuts, dark mode, export, documentation.

**No TS migration. No bug fixes to existing connector/runtime files.** Other agents own those.

---

## YOUR BRANCH

```bash
git checkout -b claudecode-sprint
git push -u origin claudecode-sprint
```

Work exclusively on `claudecode-sprint`. Never push to `main`.

---

## FILE OWNERSHIP (you OWN these)

**New files you create:**
- `modules/` directory (new) and all files within
- `src/services/moduleRegistryService.ts` (new)
- `src/services/runtimeApiService.ts` (new)
- `src/services/policyDslService.ts` (new)
- `src/services/a2aProtocolService.ts` (new)
- `policy.yaml` (new, in repo root)
- `src/components/KeyboardShortcutsModal.tsx` (new)
- `docs/WORKFLOW_NODES.md` (new)
- `docs/RELEASE_CHECKLIST.md` (new, if OpenCode hasn't created it)
- `CONTRIBUTING.md` (new)
- `docs/PHASE_SPRINT_VERIFICATION.md` (new)

**Existing files you modify:**
- `src/components/BoardroomView.tsx` — add multi-agent session logic (this component exists but has no real session logic)
- `src/components/TopBar.tsx` — add dark/light mode toggle + keyboard shortcut button
- `src/components/AgentPerformanceView.tsx` — add dead-letter queue section + CSV/JSON export
- `src/services/voiceOsService.js` — add health-check watchdog
- `src/services/hectorResearchService.js` — add retry + exponential backoff
- `src/services/joseSchedulerService.js` — add cron validation + 5 new SCHEDULE_PRESETS
- `src/services/chromaDbService.js` — add write error surface
- `src/services/connectors/n8nConnector.js` — add request timeouts
- `src/services/agentBusService.js` — add sendAgentMessage / getAgentMessages / clearAgentMessages
- `src/services/telegramCompanionService.js` — add /boardroom command
- `src/services/unifiedMemoryService.js` — add namespace eviction
- `.github/workflows/ci.yml` — add bundle size check step
- `src/styles/tokens.css` — add `[data-theme="light"]` overrides if not present
- `docs/ALPHONSO_GROUND_TRUTH.md` — update after all your work
- `CLAUDE.md` — update after all your work
- `docs/CHANGELOG.md` — update after all your work
- `README.md` — update to v2.4.0

**Do NOT touch:**
- `src-tauri/src/runtime_manager.rs` — OpenCode owns
- `src-tauri/src/lib.rs` — OpenCode owns (except if you need a new Tauri command for Module OS, in which case add a NEW command only)
- `voice/backend/` — OpenCode owns
- `bridge/server.js`, `mcp-server/server.js`, `gateway/` — OpenCode owns
- `src/components/ConnectorSetupPanel.jsx` and `ConnectorHealthPanel.jsx` and `ModelSwitcher.jsx` — OpenCode owns
- `src/test/` — Cline owns test files (you can add tests for NEW services you create, but not for existing services)

---

## HOW TO OPERATE

**Fully autonomous.** Create subagents for parallel work. Execute directly when sequential. Token-saving mode ON.

Suggested parallelism:
- Run **Agent OS foundations** (F-01 through F-06) sequentially (they build on each other)
- Run **Observability tasks** (O-01 through O-08) as parallel subagents
- Run **Agent Capabilities** (A-01 through A-10) — some parallel, some sequential (Boardroom depends on A2A enhancements)
- Run **Polish & Docs** (P-01 through P-08) as parallel subagents after capabilities

After ALL tasks:
1. Update all docs (GROUND_TRUTH, CLAUDE.md, CHANGELOG, README)
2. Run full verification suite
3. Commit everything to `claudecode-sprint`
4. Push branch

**Verification after every task:**
- `npm run typecheck` — 0 errors
- `npm run test` — all 1983+ pass
- `npm run lint` — clean

---

## SECTION F — AGENT OS FOUNDATIONS

These must be done sequentially (each builds on the previous).

**F-01** Create Module directory structure and manifest spec
- Create `modules/` directory in repo root
- Create `modules/README.md` with a brief explanation of the module system
- Create the example module from `AlphonsoBeastSprint3.md`:
  - `modules/alphonso.researcher.web_monitor/module.toml`
  - `modules/alphonso.researcher.web_monitor/system_prompt.md`
  - `modules/alphonso.researcher.web_monitor/tools/main.js` (stub: console.log placeholder)
  - `modules/alphonso.researcher.web_monitor/metrics.json`
- Create `modules/alphonso.researcher.web_monitor/tests/test_cases.json` (empty array `[]`)
- Validation: files exist; `module.toml` is valid TOML syntax

**F-02** Create Module Registry Service
- File: `src/services/moduleRegistryService.ts`
- Implement:
  ```typescript
  interface ModuleManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    capabilities: string[];
    models: string[];
    schedules: string[];
    entrypoint: string;
    ui?: string;
    policy?: { tags: string[] };
  }
  
  interface ModuleRecord {
    manifest: ModuleManifest;
    status: 'enabled' | 'disabled' | 'error';
    installedAt: string;
    lastRun?: string;
    errorCount: number;
  }
  ```
- Functions:
  - `installModule(path: string): Promise<{ success: boolean; error?: string }>` — reads module.toml, validates required fields, stores in localStorage `alphonso_modules_v1`
  - `enableModule(id: string): void`
  - `disableModule(id: string): void`
  - `listModules(): ModuleRecord[]`
  - `getModule(id: string): ModuleRecord | null`
  - `uninstallModule(id: string): void`
- Storage: `durableGet/Set` from `src/lib/durableStore.js`
- Validation: `npm run typecheck` 0 errors; `npm run test` passes

**F-03** Create Policy DSL Service
- File: `src/services/policyDslService.ts`
- File: `policy.yaml` (in repo root — use the exact YAML from `AlphonsoBeastSprint3.md` Section 5.2)
- Implement:
  ```typescript
  interface PolicyRule {
    id: string;
    description: string;
    match: Record<string, string>;
    effect: 'allow' | 'deny' | 'require_consent';
  }
  
  interface PolicyResult {
    allowed: boolean;
    effect: 'allow' | 'deny' | 'require_consent';
    ruleId?: string;
    reason?: string;
  }
  ```
- Functions:
  - `loadPolicy(): PolicyRule[]` — loads from hardcoded rules array (since we cannot read YAML files in the browser runtime, embed the rules as TypeScript constants parsed from policy.yaml at build time — or just define the rules as a const array directly in the service)
  - `evaluateAction(action: string, context: Record<string, string>): PolicyResult` — evaluates a proposed action against all rules, returns first matching rule's effect
  - `getPolicyRules(): PolicyRule[]`
- The existing `policyEnforcementService` handles Alphonso-level policy. This new service handles Module-level policy (separate concern, do not merge them).
- Validation: `npm run typecheck` 0 errors

**F-04** Create Runtime API Service
- File: `src/services/runtimeApiService.ts`
- This is a client-side service that calls the Alphonso Bridge (port 4444) to manage modules
- Implement endpoints matching `AlphonsoBeastSprint3.md` Section 2.2:
  - `listModules(): Promise<ModuleRecord[]>` — `GET /modules` (falls back to `moduleRegistryService.listModules()` if bridge is offline)
  - `runModule(id: string, context: object): Promise<{ runId: string }>` — `POST /modules/run`
  - `getRunStatus(runId: string): Promise<{ status: string; logs: string[] }>` — `GET /runs/:runId`
  - `publishEvent(type: string, payload: object): Promise<void>` — `POST /events/publish`
- All calls include a 10-second AbortController timeout
- All calls catch errors and return a `{ error: string }` result instead of throwing
- Validation: `npm run typecheck` 0 errors

**F-05** Create A2A Protocol Service
- File: `src/services/a2aProtocolService.ts`
- Implement the A2A protocol from `AlphonsoBeastSprint3.md` Section 6 as a local in-process service (not HTTP — uses `agentBusService` for message passing)
- Interfaces:
  ```typescript
  interface A2ATask {
    delegateId: string;
    fromAgent: string;
    toAgent: string;
    task: string;
    context: {
      workspaceId?: string;
      sessionId?: string;
      documents?: string[];
      metadata?: Record<string, unknown>;
    };
    requirements?: {
      capabilities?: string[];
      maxTokens?: number;
    };
    status: 'pending' | 'accepted' | 'running' | 'completed' | 'failed';
    result?: unknown;
    logs: string[];
    createdAt: string;
    completedAt?: string;
  }
  ```
- Functions:
  - `delegate(from: string, to: string, task: string, context: object, requirements?: object): A2ATask` — creates a delegation record, sends via `agentBusService.sendAgentMessage`, stores in localStorage `alphonso_a2a_tasks_v1`
  - `getTaskStatus(delegateId: string): A2ATask | null`
  - `updateTaskResult(delegateId: string, result: unknown, logs: string[]): void`
  - `listActiveTasks(): A2ATask[]`
  - `listTasksByAgent(agentId: string): A2ATask[]`
- Validation: `npm run typecheck` 0 errors

**F-06** Enhance agentBusService with full A2A messaging
- File: `src/services/agentBusService.js`
- Add:
  - `sendAgentMessage(fromAgent, toAgent, message, context)` — stores in a per-agent ring buffer (50 messages per agent), key: `alphonso_agent_messages_${toAgent}`
  - `getAgentMessages(toAgent)` — returns array of messages for that agent
  - `clearAgentMessages(toAgent)` — clears the ring buffer
  - `subscribeToMessages(toAgent, callback)` — polls every 2s and calls callback when new messages arrive; returns unsubscribe function
- Validation: `npm run test` passes (you may add `src/test/agentBusService.test.js` for your new functions only)

---

## SECTION O — OBSERVABILITY & RELIABILITY

These are independent — run as parallel subagents.

**O-01** Add Voice OS sidecar health-check watchdog
- File: `src/services/voiceOsService.js`
- After `startVoiceServer()` resolves, start a `setInterval` every 30 seconds
- Interval: call `getVoiceServerStatus()`. If result is `'stopped'` or throws, emit `window.dispatchEvent(new CustomEvent('alphonso:toast', { detail: { type: 'error', message: 'Voice OS offline — restarting...' } }))` then call `startVoiceServer()` once
- Export `stopVoiceWatchdog()` that clears the interval
- Validation: `npm run test` passes; `npm run lint` clean

**O-02** Add retry + exponential backoff to Hector RSS fetch
- File: `src/services/hectorResearchService.js`
- Create a local `fetchWithRetry(url, options, maxRetries = 3)` function with delays: 500ms, 1000ms, 2000ms between attempts
- Wrap each `fetch(rssUrl)` call in `fetchWithRetry`
- On each retry: call `crashLogService.logError('hector_rss_retry', { url, attempt })`
- Validation: `npm run test` passes

**O-03** Add cron expression validation to joseSchedulerService
- File: `src/services/joseSchedulerService.js`
- Before storing any schedule, validate the cron expression
- Implement a simple validator: cron must have 5 space-separated fields; each field must match `(\d+|\*|\*/\d+)` (simplified, not exhaustive, but catches obviously wrong expressions)
- `createSchedule(params)`: if cron invalid, return `{ success: false, error: 'Invalid cron expression: must have 5 fields (minute hour day month weekday)' }`
- Also add 5 new `SCHEDULE_PRESETS` entries:
  - `nova_daily_scan`: `{ cron: '0 9 * * *', label: 'Nova Daily Opportunity Scan', handler: 'nova_scan' }`
  - `sentinel_daily_summary`: `{ cron: '0 8 * * *', label: 'Sentinel Daily Threat Summary', handler: 'sentinel_summary' }`
  - `echo_nightly_consolidation`: `{ cron: '0 2 * * *', label: 'Echo Nightly Memory Consolidation', handler: 'echo_consolidate' }`
  - `hector_morning_briefing`: `{ cron: '0 7 * * *', label: 'Hector Morning Research Briefing', handler: 'hector_brief' }`
  - `maria_weekly_audit`: `{ cron: '0 9 * * 1', label: 'Maria Weekly Governance Audit', handler: 'maria_audit' }`
- In the scheduler's tick handler: when a preset fires, dispatch `window.dispatchEvent(new CustomEvent('alphonso:agent_activity', { detail: { agent: handlerAgent, message: `${label} triggered`, timestamp: new Date().toISOString() } }))`
- Validation: `npm run test` passes

**O-04** Add ChromaDB write error surface
- File: `src/services/chromaDbService.js`
- Wrap `addMemoryToChroma` in try/catch; on error: call `crashLogService.logError('chroma_write_error', { error: e.message, collection })`
- Add internal ring buffer (max 10) of write errors: `const writeErrors = []`
- Export `getChromaWriteErrors()` returning the last 10 errors
- Validation: `npm run test` passes

**O-05** Add n8n connector request timeouts
- File: `src/services/connectors/n8nConnector.js`
- `triggerN8nWebhook`: wrap fetch in `AbortController` with 15-second timeout; catch `AbortError` and return `{ success: false, error: 'n8n webhook timeout (15s)' }`
- `listN8nWorkflows`: 10-second timeout; same catch pattern
- `isN8nHealthy`: 5-second timeout
- Validation: `npm run test` passes

**O-06** Add namespace eviction to unifiedMemoryService
- File: `src/services/unifiedMemoryService.js`
- Read the current implementation first
- Each namespace has a max size (default 500 for `shared`, 700 for `miya`, 1500 for `ecosystem`, 2000 for `workflow`)
- On any write that would exceed the namespace limit: remove the oldest entry by `createdAt` or array position before inserting the new one
- Add `getNamespaceCount(namespace: string): number` export
- Validation: `npm run test` passes

**O-07** Add bundle size check to CI
- File: `.github/workflows/ci.yml`
- Read the current workflow YAML first
- After the `npm run build` step, add:
  ```yaml
  - name: Check bundle size
    run: |
      TOTAL=$(du -sb dist/assets/ | awk '{print $1}')
      echo "Total bundle size: $TOTAL bytes"
      if [ "$TOTAL" -gt "10485760" ]; then
        echo "Bundle exceeds 10MB limit ($TOTAL bytes)"
        exit 1
      fi
      LARGEST=$(find dist/assets -name "*.js" -printf "%s\n" | sort -n | tail -1)
      if [ "$LARGEST" -gt "2097152" ]; then
        echo "Single JS chunk exceeds 2MB limit ($LARGEST bytes)"
        exit 1
      fi
  ```
- Validation: YAML is syntactically valid; `git diff` shows the addition

**O-08** Add Dead Letter Queue section to AgentPerformanceView
- File: `src/components/AgentPerformanceView.tsx`
- Add a "Dead Letter Queue" section below the per-agent metrics:
  - Show count from `getDeadLetterCount()` (from orchestrationQueueService — check if this export exists; if not, read the service and add the export there too)
  - Show oldest entry timestamp if any entries exist
  - "Retry All" button that calls `retryDeadLetter()` and shows a toast on completion
- Validation: `npm run typecheck` 0 errors; `npm run test` passes

---

## SECTION A — AGENT CAPABILITIES

**A-01** Implement Boardroom multi-agent session logic
- File: `src/components/BoardroomView.tsx`
- Read the current file first — it likely has a placeholder UI
- Implement a full session model:
  ```typescript
  interface BoardroomMessage {
    agentId: string;
    agentName: string;
    content: string;
    timestamp: string;
    type: 'response' | 'briefing' | 'conclusion';
  }
  
  interface BoardroomSession {
    sessionId: string;
    topic: string;
    participants: string[];
    messages: BoardroomMessage[];
    status: 'idle' | 'active' | 'concluded';
    mariaScore?: number;
    conclusion?: string;
    createdAt: string;
  }
  ```
- UI requirements:
  - Topic input field
  - Checkbox list for selecting participant agents (all 9 available)
  - "Convene Session" button
  - Session timeline showing each agent's response
  - Hector briefing card at the top (sky-tinted) — auto-triggered on convene
  - "Conclude Session" button → summarizes via Echo memory synthesis, shows Maria risk score (ScoreRing SVG), saves to `unifiedMemoryService` under `boardroom` namespace
  - If Maria score > 70: show warning and require explicit "I understand the risk" confirmation before saving
  - "Distribute Summary" button (appears after Maria approval) → calls `marcusExecutionService` to dispatch to Slack if configured
- On convene: route topic through `joseCommandRouterService` with `{ boardroom: true }` flag; collect each participant agent's response via `agentBusService` or direct service calls
- Persist sessions in localStorage `alphonso_boardroom_sessions_v1`
- Validation: `npm run typecheck` 0 errors; component renders; `npm run test` passes (add a render test)

**A-02** Wire Hector briefing into Boardroom
- File: `src/components/BoardroomView.tsx` (continuation of A-01)
- When "Convene Session" is clicked: before routing to agents, call `hectorResearchService` with the topic
- Display Hector's briefing card first in the session thread (sky/blue tinted, top 3 sources or empty sources message)
- This is sequential within A-01 — do it as part of the same task

**A-03** Add Miya creative brief generation from Boardroom
- File: `src/components/BoardroomView.tsx`
- In concluded sessions: add a "Generate Creative Brief" button
- On click: pass session conclusion text to the Miya agent via `joseCommandRouterService` with `{ agent: 'miya', task: 'creative_brief' }` or directly call the Miya service if it exists (`miyaCreativeService.js` or equivalent — check first)
- Display result in a modal with "Save to Memory" button → saves to `unifiedMemoryService` under `miya` namespace
- Validation: button renders in concluded state; `npm run typecheck` 0 errors

**A-04** Add Nova proactive scan preset (already partly done in O-03 — wire the handler)
- File: `src/services/joseSchedulerService.js`
- The `nova_daily_scan` preset was added in O-03. Wire the `handler: 'nova_scan'` execution:
- When the scheduler fires `nova_scan`: call `novaAnalysisService.analyzeOpportunity(context)` where context comes from recent `unifiedMemoryService` entries
- Call `saveOpportunityScore(result)` 
- If score > 75: dispatch `alphonso:toast` with "Nova found a high-value opportunity — check the Nova panel"
- Validation: `npm run test` passes

**A-05** Add Sentinel daily summary handler
- File: `src/services/joseSchedulerService.js`
- Wire `handler: 'sentinel_summary'`: call `sentinelSecurityService.runQuickScan()`, format summary, dispatch via `appendAgentActivity` for Sentinel agent
- Validation: `npm run test` passes

**A-06** Add Echo nightly consolidation handler
- File: `src/services/joseSchedulerService.js`
- Wire `handler: 'echo_consolidate'`: call `echoMemoryService` synthesis on memories older than 7 days in `unifiedMemoryService`; archive low-confidence entries (confidence < 0.3)
- Validation: `npm run test` passes

**A-07** Add /boardroom Telegram command
- File: `src/services/telegramCompanionService.js`
- Add command `/boardroom <topic>` (command #22)
- Handler: create a BoardroomSession with all 9 agents on the given topic, run it (simplified: call Jose router with the topic), collect conclusion, reply via Telegram with the summary
- Update the `/help` command text to include `/boardroom`
- Validation: `npm run test` passes; `/help` text updated

**A-08** Add /hector_morning_briefing handler
- File: `src/services/joseSchedulerService.js`
- Wire `handler: 'hector_brief'`: call `hectorResearchService.fetchRssSources()`, format top 5 items, dispatch as Hector agent activity
- Validation: `npm run test` passes

**A-09** Add /maria_weekly_audit handler
- File: `src/services/joseSchedulerService.js`
- Wire `handler: 'maria_audit'`: call `mariaAuditService` with a summary of last week's orchestration receipts from `orchestrationReceiptService`; log result as Maria agent activity; if risk > 60 dispatch a toast
- Validation: `npm run test` passes

**A-10** Add module registry to Runtime Hub UI
- File: `src/components/RuntimeManagerView.jsx` (currently .jsx — Cline is migrating this to .tsx; coordinate: do your work on the .tsx version if Cline has already migrated it, otherwise do it on the .jsx and note it for Orchestrator)
- Add a "Modules" tab to RuntimeManagerView alongside the existing tool management
- Tab content: list of installed modules from `moduleRegistryService.listModules()`
- Each row shows: module name, version, status dot, last run, capabilities
- "Install Module" button: opens a file picker → calls `moduleRegistryService.installModule(path)`
- "Enable / Disable" toggle per module
- Validation: tab renders; `npm run typecheck` 0 errors (if .tsx)

---

## SECTION P — POLISH & DOCUMENTATION

Run as parallel subagents.

**P-01** Add dark/light mode toggle
- File: `src/styles/tokens.css`
- Read the current file — OKLCH tokens should be under `:root`. Add `[data-theme="light"]` overrides if needed (or `[data-theme="dark"]` if light is default)
- File: `src/components/TopBar.tsx`
- Add a sun/moon icon button (use Lucide `Sun` and `Moon` icons)
- On click: toggle `document.documentElement.setAttribute('data-theme', theme)` between `'dark'` and `'light'`
- Persist preference in localStorage `alphonso_theme_v1`
- On mount: restore from localStorage
- Validation: `npm run typecheck` 0 errors; `npm run test` passes

**P-02** Add keyboard shortcuts reference modal
- File: `src/components/KeyboardShortcutsModal.tsx` (new)
- Modal triggered by: `Ctrl+?` global keydown listener (add in `App.tsx` or `TopBar.tsx`)
- Also add a `?` or keyboard icon button in `TopBar.tsx`
- Shortcuts to document:
  - `Ctrl+?` — Open shortcuts
  - `Ctrl+J` — Jump to Chat view
  - `Ctrl+B` — Open Boardroom
  - `Ctrl+R` — Open Runtime Manager
  - `Ctrl+K` — (reserved, show as "Command palette — coming soon")
- Wire the shortcuts: `Ctrl+J`, `Ctrl+B`, `Ctrl+R` should call the sidebar navigation handlers
- Validation: `npm run typecheck` 0 errors; modal renders on Ctrl+?

**P-03** Add agent performance metrics export
- File: `src/components/AgentPerformanceView.tsx`
- Add "Export CSV" and "Export JSON" buttons
- CSV: rows of `agent, timestamp, status, latencyMs`
- JSON: array of receipt objects
- Use `URL.createObjectURL(new Blob([content], { type: 'text/csv' }))` + `<a download>` click
- Validation: `npm run typecheck` 0 errors; buttons present

**P-04** Create CONTRIBUTING.md
- File: `CONTRIBUTING.md` (repo root)
- Sections:
  - Development setup (prerequisites, clone, npm install, tauri dev)
  - Branch strategy (feature branches, phase branches, PR required for main)
  - PR checklist: `npm run verify:app` must pass, new components must be .tsx, new tests required
  - Commit message format: `feat(scope): description` / `fix(scope): description`
  - Test requirements: all 1983+ must pass, no coverage regressions
  - TypeScript requirement: all new components must be .tsx with prop interfaces
- Validation: file exists and is readable

**P-05** Create docs/WORKFLOW_NODES.md
- File: `docs/WORKFLOW_NODES.md`
- First, read `src/components/WorkflowBuilderView.jsx` (or .tsx after Cline's migration) to identify all 9 node types
- Document each: name, description, inputs, outputs, example use case
- Validation: file exists; covers all node types found in the component

**P-06** Add Playwright multi-agent pipeline E2E test
- File: `e2e/multiagent.spec.js` (new)
- Test: open app (`baseURL: 'http://localhost:5173'`) → find chat input → type a command → submit → wait for Jose agent activity to appear in the activity feed → confirm at least one agent entry in the activity log
- Requirements: `npm run dev` on :5173, Ollama running with a model
- Import Playwright test utilities from `@playwright/test` (already installed per CLAUDE.md)
- Validation: file is syntactically valid; `npm run test:e2e` runs (may skip if Ollama not available in CI — add `test.skip(!!process.env.CI, 'Requires Ollama')`)

**P-07** Update README.md to v2.4.0
- File: `README.md`
- Update version badge/number to v2.4.0
- Add Boardroom multi-agent sessions to feature list
- Add Module System (Agent OS foundations) to architecture overview
- Add daily scheduler presets to automation section
- Keep it concise — update existing content, don't add new sections unless clearly missing

**P-08** Full documentation update
- Files: `docs/ALPHONSO_GROUND_TRUTH.md`, `CLAUDE.md`, `docs/CHANGELOG.md`
- GROUND_TRUTH: update version to v2.4.0, add all new services (moduleRegistryService, runtimeApiService, policyDslService, a2aProtocolService), add Boardroom session model, add module system to architecture, update test count
- CLAUDE.md: add all new services to "Do Not Duplicate" table; update "Last verified" line to v2.4.0
- CHANGELOG.md: add v2.4.0 release notes with sections: Agent OS Foundations, Observability, Agent Capabilities, Polish

---

## FINAL VERIFICATION

Run all of these and confirm they pass:

```bash
npm run verify:app        # lint + typecheck + test + build — ALL must pass
npm run test:coverage     # check coverage (Cline targets ≥50%; your additions should not regress it)
npm run test:e2e          # Playwright E2E — skip if Ollama not running
cargo check               # from src-tauri/
cargo clippy -- -D warnings  # from src-tauri/ — zero warnings
```

Document results in `docs/PHASE_SPRINT_VERIFICATION.md`.

---

## COMPLETION CHECKLIST

Before pushing `claudecode-sprint`:

- [ ] `npm run verify:app` passes
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run test` — all 1983+ pass + new tests from your additions
- [ ] `modules/` directory created with example module
- [ ] `moduleRegistryService.ts` created and works
- [ ] `policyDslService.ts` created
- [ ] `runtimeApiService.ts` created
- [ ] `a2aProtocolService.ts` created
- [ ] `agentBusService.js` extended with A2A messaging
- [ ] `policy.yaml` in repo root
- [ ] Boardroom multi-agent session logic implemented
- [ ] 5 SCHEDULE_PRESETS added + all 5 handlers wired
- [ ] /boardroom Telegram command added (22 total commands)
- [ ] Dark mode toggle in TopBar
- [ ] Keyboard shortcuts modal
- [ ] Agent performance CSV/JSON export
- [ ] Bundle size check in CI
- [ ] Voice OS watchdog in voiceOsService
- [ ] Hector retry + exponential backoff
- [ ] ChromaDB error surface
- [ ] n8n timeouts
- [ ] Unified memory namespace eviction
- [ ] CONTRIBUTING.md created
- [ ] docs/WORKFLOW_NODES.md created
- [ ] README.md updated to v2.4.0
- [ ] GROUND_TRUTH, CLAUDE.md, CHANGELOG all updated
- [ ] All committed and pushed to `claudecode-sprint`

---

## RETURN MESSAGE TO ORCHESTRATOR

When done, report:
1. All tasks completed / any blockers
2. New service file count
3. New test count (from your additions)
4. Any files that conflict with opencode-sprint or cline-sprint changes
5. `npm run verify:app` result
6. The branch is pushed and ready for Orchestrator review

**Branch:** `claudecode-sprint` → Orchestrator will review and merge.
