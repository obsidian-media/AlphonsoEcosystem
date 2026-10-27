# Agent roles Part C1 (pages and data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects runs real Jose requests, Agent Pairing becomes Teams (with every saved template visible), each step's skill result is recorded and shown, old data keeps working, the simulated workshop and unused files go to the archive, and the three failing content-factory desktop specs pass.

**Architecture:** Projects and Teams are thin pages over the existing Jose entry points (`submitToJose()` with a fixed template, `submitStepsToJose()` with a team's steps) and the existing request store; no new execution path. Skill results are a small store written from the engine's existing `recordStepOutcomes()` and review-verdict spots. Archiving moves files with `git mv` into `archive/MIGHTBEUSEDLATER/`.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, WebdriverIO desktop specs (`e2e-desktop/`), Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-26-agent-roles-part-c-design.md` (C1 section), building on the Part C section of `docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md`.

## Global Constraints

- Alphonso is used by other people: nothing of the owner's built in (no TapCash preset, no owner folders, names or keys).
- Every agent step goes through Jose (`submitToJose()` / `submitStepsToJose()`); do NOT call `createJoseCommandRoute` / `runJoseCommandExecutionPipeline` from a new caller (`src/test/joseEntryPoints.test.js`).
- One permission table: team steps use only task types the agent owns (`taskTypesFor()`, `checkPlan(steps, { taskTypes: true })`).
- Nothing is changed silently: a template or waiting plan that breaks the rules shows its problem and can't run.
- Removing a file needs the owner (R14): only the files listed in Task 7 move, to `archive/MIGHTBEUSEDLATER/`, with a line each in `MIGHTBEUSEDLATER.md`. A file found to have a real caller stays, with a ledger ruling.
- Plain words in every screen string; no em dashes in new UI copy.
- Docs change in the same commits as code (CLAUDE.md rows, Ground Truth, CHANGELOG, DEFERRED_WORK, counts).
- Line endings: new files LF; edit each existing file in its own style (check the HEAD blob's CR count).
- Never `git add -A` (the owner's untracked `.serena/` and `brag-output/` stay out).

## Review Focus

1. A project started while Jose's model is down: the planner falls back to the "Build an app" template unchanged, and the project still gets a request (test in Task 1).
2. A request resumed after an approval: its steps' outcomes are not counted twice (upsert by request and step, test in Task 5).
3. "use team launch" in another case, or a name that is a prefix of two teams: case-insensitive exact match first, else "Which team: …" (test in Task 3).
4. An old saved pair naming something that isn't an agent (the old route table had `comfyui`): not offered as a team, and dropped (test in Task 3).
5. A saved template with no steps, or an empty request text when you press Run: refused with a plain reason, nothing submitted (test in Task 3).

---

### Task 1: A project starts a real request

**Files:**
- Create: `src/services/projects/projectStore.ts`
- Modify: `src/services/jose/josePlanner.ts` (`PlanOptions.templateId`), `src/services/jose/submitToJose.ts` (`SubmitToJoseInput.templateId`, passed to the planner)
- Test: `src/test/services/projects/projectStore.test.ts`, `src/test/services/jose/josePlanner.test.ts` (extend)

**Interfaces:**
- Produces:
  - `PlanOptions.templateId?: string` / `SubmitToJoseInput.templateId?: string`: that template is the starting point (instead of `scoreTemplateFit()`), also for the fallback.
  - `interface ProjectIntake { name: string; description: string; stack: string; deadline: string; type: string; features: string; constraints: string; risks: string; priority: 'low' | 'medium' | 'high' }`
  - `interface SavedProject { id: string; name: string; intake: ProjectIntake; runs: { requestId: string; atMs: number }[]; createdAtMs: number }` in `alphonso_projects_v2`, 50 kept (newest first).
  - `intakeText(intake: ProjectIntake): string`: "Build <name>: <description>." then one line each for the filled fields ("Stack: …", "Features: …", "Must not: …", "Risks: …", "Deadline: …", "Priority: …"); empty fields left out.
  - `listProjects(): SavedProject[]`, `getProject(id): SavedProject | null`, `saveProject(intake, id?): SavedProject`, `deleteProject(id): void`
  - `startProject(id: string, opts?: { settings?: any }): Promise<{ ok: boolean; requestId?: string; reason?: string }>`: refuses an empty name or description (`PROJECT_NEEDS_TEXT` = "Give the project a name and a description first."), calls `submitToJose({ text: intakeText(intake), source: 'user', templateId: 'build_app', endpoint, zeroCostMode })`, saves the run's request id (`result.requestId`, or the plan-first `requestId`).

- [ ] **Step 1: Write the failing tests**: `intakeText` leaves empty fields out; `startProject` passes `templateId: 'build_app'` and the text to a mocked `submitToJose`, saves the returned request id as a run (two starts → two runs); empty description → `PROJECT_NEEDS_TEXT`, nothing submitted; 51 projects → 50 kept. Planner: with `templateId: 'build_app'` the prompt's starting point is that template even when the text fits another; with the model throwing, the plan is the template unchanged (`source: 'template'`, `templateId: 'build_app'`) (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run src/test/services/projects src/test/services/jose/josePlanner.test.ts` — Expected: FAIL (module missing; template not forced).
- [ ] **Step 3: Implement** the store and the `templateId` option (`getTemplate(templateId)` before `scoreTemplateFit()`).
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): a project starts a real Jose request from the Build an app template`

### Task 2: The Projects page

**Files:**
- Create: `src/components/projects/ProjectsPage.tsx`
- Modify: `src/App.tsx` (`activeTab === 'project_execution'` renders `ProjectsPage`; lazy import mapping per `appLazyImports.test.js`), `src/components/MissionControlHome.tsx` (card copy "Open Projects", detail "Start a project and follow its real steps")
- Test: `src/test/components/projects/ProjectsPage.test.tsx`

**Interfaces:**
- Consumes: Task 1; `getJoseRequest`, `JosePlanMap`, `JoseStepOutput`, `approveRequestStep`, `rejectRequestStep`, `closingSummary`.
- Produces: `ProjectsPage({ onOpenJoseBoard?: (requestId: string) => void })` with test ids `projects-intake`, `projects-start`, `projects-list`, and tabs Plan / Steps / Approval / Results for the selected project's latest run (refreshed every 2 s while it runs). Approval lists the run's `waiting_approval` steps with "Approve and carry on" and "Reject"; Results shows `closingSummary(request)` and is disabled (`aria-disabled`) while any step waits.

- [ ] **Step 1: Write the failing tests**: no preset button or TapCash text; filling name and description and pressing Start calls `startProject`; the Steps tab lists the seeded request's steps; Approval's button calls `approveRequestStep(requestId, stepId)`; Results is disabled while a step waits and shows the summary when done; "Open on the board" calls `onOpenJoseBoard(requestId)`.
- [ ] **Step 2: Run** `npx vitest run src/test/components/projects src/test/appLazyImports.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the page and the App route (App passes its existing `onOpenJoseBoard`).
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(projects): Work → Projects shows a project's real steps, approvals and results`

### Task 3: Teams (service)

**Files:**
- Create: `src/services/jose/teams.ts`
- Modify: `src/services/jose/joseDecision.ts` (a team request is planned by rule), `src/services/jose/submitToJose.ts` (a team request runs the team first)
- Test: `src/test/services/jose/teams.test.ts`, `src/test/services/jose/joseDecision.test.ts` (extend)

**Interfaces:**
- Consumes: `saveUserTemplate`, `listUserTemplates`, `deleteUserTemplate`, `checkPlan`, `taskTypesFor`, `submitStepsToJose`, `agentName`.
- Produces:
  - `interface TeamMember { agent: string; actionType: string; instruction: string; needs: string[] }`
  - `teamSteps(members: TeamMember[]): PlanStep[]` (step ids `<agent>`, then `<agent>-2`…; effects from `inferEffects()`)
  - `templateProblems(template: JoseTemplate): string[]` (no steps → "This template has no steps."; else `checkPlan(steps, { taskTypes: true }).problems`, each rewritten in plain words where it names a task type owned by another agent: "Gives Hector's research to Nova.")
  - `saveTeam(input: { name: string; job: string; members: TeamMember[] }, id?: string): { ok: true; template: JoseTemplate } | { ok: false; problems: string[] }` (refuses with problems; `kind: 'normal'`; `requestText` = the job)
  - `findTeam(name: string): JoseTemplate | { ambiguous: string[] } | null` (case-insensitive exact name first, else names starting with it; several → `ambiguous`)
  - `parseTeamRequest(text: string): { name: string; rest: string } | null` ("/team <name> <rest>", "use team <name> to <rest>", "use team <name>: <rest>")
  - `runTeam(templateId: string, text: string, opts: { source: string; endpoint?: string; zeroCostMode?: boolean }): Promise<any>` (empty text → `{ ok: false, reason: TEAM_NEEDS_TEXT }` = "Say what the team should do."; problems → `{ ok: false, reason: 'plan_rejected', problems }`; else `submitStepsToJose({ text, source, steps, label: TEAM_LABEL(name) })`, `TEAM_LABEL = (n) => \`Steps set by your team ${n}.\``)
  - `TEAM_NOT_FOUND(names: string[])` = "No team called that. Your teams: A, B." (or "You have no teams yet: make one on the Teams page.")
  - Old pairs: `oldPairOffers(): { id: string; agents: [string, string]; job: string; note: string }[]` (reads `alphonso_agent_pairs_v1`; a pair naming a non-agent is dropped from storage and not offered), `dismissOldPair(id)`, `takeOldPair(id)` (removes it and returns its offer for the builder).
  - `decideJoseRoute`: `parseTeamRequest(text)` → `{ route: 'plan', source: 'rule' }`. `submitToJose`: before planning, a team request runs `runTeam()`; an unknown or ambiguous name returns `{ ok: false, reason: TEAM_NOT_FOUND(...) }` / "Which team: A, B?".

- [ ] **Step 1: Write the failing tests**: `teamSteps` ids and needs; `saveTeam` refuses a member with a task type another agent owns, with the plain problem; `templateProblems` on a zero-step template (Review Focus 5) and on a template giving `research_report` to nova; `findTeam` case-insensitive, prefix, ambiguous (Review Focus 3); `parseTeamRequest` for the three forms and `null` for "use the team's notes"; `runTeam` with empty text refuses and submits nothing (Review Focus 5), with a bad template refuses, else calls `submitStepsToJose` with `TEAM_LABEL`; `oldPairOffers` drops a `comfyui` pair (Review Focus 4) and offers a jose/miya one with its trigger as the job; `dismissOldPair` removes it; `decideJoseRoute('use team Launch to post the news')` plans by rule.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/teams.test.ts src/test/services/jose/joseDecision.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `teams.ts` and the two hooks.
- [ ] **Step 4: Run** the same plus `src/test/services/jose` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(teams): teams as checked templates, run by name from Chat`

### Task 4: The Teams page

**Files:**
- Create: `src/components/teams/TeamsPage.tsx`, `src/components/teams/TeamBuilder.tsx`
- Modify: `src/components/EcosystemHub.tsx` (the `pairings` tab renders `TeamsPage`, label "Teams"), `src/components/Sidebar.tsx` (`pairings` label "Teams"), `src/components/MissionControlHome.tsx` (card "Teams", "Make a team of agents for a kind of job")
- Test: `src/test/components/teams/TeamsPage.test.tsx`; update `src/test/sidebarSpaces*.test.*`, `src/test/ecosystemHub.test.jsx`, `src/test/MissionControlHome*.test.*` for the new labels

**Interfaces:**
- Consumes: Task 3.
- Produces: test ids `teams-new`, `team-builder`, `teams-templates`, `team-problems-<id>`, `team-run-<id>`, `team-delete-<id>`, `old-pair-<id>`. The builder: name, job, agents (each with a task-type select from `taskTypesFor(agent)` and an instruction), needs in the picked order, editable; Save disabled while `saveTeam` would refuse, with the problems shown live. The list: every user template with agents, saved date, problems (Run disabled while there are any), Run (asks for the request text, then `runTeam`, then "Open on the board"), Edit, Delete (asks first).

- [ ] **Step 1: Write the failing tests**: build and save a two-agent team, it appears in the list; a template with a problem shows it and Run is disabled; Run with text calls `runTeam`; Delete asks then removes; an old pair shows "Make this a team" and Dismiss; sidebar and hub say "Teams".
- [ ] **Step 2: Run** `npx vitest run src/test/components/teams src/test/ecosystemHub.test.jsx src/test/sidebarSpaces.test.jsx src/test/components/MissionControlHome.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(teams): the Teams page lists every saved template, builds teams and offers old pairs once`

### Task 5: Skill results

**Files:**
- Create: `src/services/skills/skillOutcomes.ts`
- Modify: `src/services/joseExecutionEngineService.ts` (`recordStepOutcomes()` records each finished step; the verdict spot records the reviewed step's verdict; `rejectRequestStep()` records `rejected`), `src/services/skills/skillUse.ts` (`skillLastUsed()` reads the outcomes, seeded once from `alphonso_skill_last_used_v1`), `src/components/skills/SkillsPage.tsx`
- Test: `src/test/services/skills/skillOutcomes.test.ts`, `src/test/components/skills/SkillsPage.test.tsx` (extend), `src/test/services/jose/joseStepGraphPipeline.test.js` (extend)

**Interfaces:**
- Produces:
  - `interface SkillOutcome { requestId: string; stepId: string; atMs: number; agent: string; skill: string | null; actionType: string; model: string | null; outcome: 'done' | 'failed' | 'setup_needed' | 'rejected'; verdict?: 'pass' | 'fix' }` in `alphonso_skill_outcomes_v1`, 1,000 kept.
  - `recordStepOutcome(o: Omit<SkillOutcome, 'atMs'>, nowMs?): void` (upsert by `requestId` + `stepId`, Review Focus 2), `recordReviewVerdict(requestId, reviewedStepId, verdict): void`, `skillStats(agent, skill): { used: number; reviewed: number; passed: number; lastUsedMs: number | null }`, `statsLine(stats): string` ("Used 12 times · 9 of 10 reviews passed · last used today" / "Not used yet"; no "reviews" part when none was reviewed).
  - Only `done`, `failed`, `setup_needed` are recorded from `recordStepOutcomes()`; `waiting_approval` and `not_run` are not.

- [ ] **Step 1: Write the failing tests**: recording the same step twice keeps one record with the later outcome; a review verdict lands on the reviewed step; `statsLine` wording for 0, reviewed and unreviewed; 1,001 records → 1,000; seeding from the old last-used key once; a pipeline run with a Maria review of Hector's step records both steps and Hector's verdict; Skills page shows the line.
- [ ] **Step 2: Run** `npx vitest run src/test/services/skills src/test/components/skills src/test/services/jose/joseStepGraphPipeline.test.js src/test/coachEngineService.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): record each step's result and show it per skill`

### Task 6: Old data

**Files:**
- Modify: `src/components/jose/JoseRequestsBoard.tsx` (a waiting plan shows `checkPlan(steps, { taskTypes: true })` problems up front and disables "Run this plan")
- Test: `src/test/components/jose/JoseRequestsBoard.test.tsx` (extend), `src/test/services/jose/oldData.test.ts` (create)

**Interfaces:**
- Consumes: `checkPlan`, `toCurrentOwners`, `templateProblems` (Task 3).
- Produces: test id `jose-plan-problems`.

- [ ] **Step 1: Write the failing tests**: a saved request, step outputs and a content project from before Part C load unchanged; a resumed request with a moved task type (`runtime_assemble_video`) is moved to Miya with its change-log line; a waiting plan giving `research_report` to nova shows the problem and Run is disabled; a saved template with a moved task type is shown fixed by `toCurrentOwners()` when listed, without being rewritten in storage.
- [ ] **Step 2: Run** `npx vitest run src/test/services/jose/oldData.test.ts src/test/components/jose/JoseRequestsBoard.test.tsx` — Expected: FAIL (board shows no problems up front).
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(jose): a waiting plan that breaks the rules says so before you run it`

### Task 7: Archive

**Files:**
- Move to `archive/MIGHTBEUSEDLATER/` (with their tests, `git mv`): `src/components/projectExecution/`, `src/components/agentWorkshop/`, `src/components/agents/AgentDock.tsx`, `AgentCard.tsx`, `AgentCapabilityMatrix.tsx`, `AgentProfilePanel.tsx`, `src/components/audit/MarcusAuditPanel.tsx`, `src/components/research/HectorResearchPanel.tsx`, `src/components/AgentPairingView.tsx`; services `agentWorkshop/` except `accBridgeService.js`, `projectExecution/projectDnaService.js`, `projectExecution/projectExecutionService.js`, `audit/marcusAuditService.js`, `systemHealth/systemHealthService.js`, `agentPairingConstants.ts`, `agentPairingExecutionService.ts`, `agentPairingRegistryService.ts`, `sentinelGateService.ts`, `mariaWeeklyReportService.ts`, `codingAgentService.ts`, `novaFeedbackService.ts`
- Modify: `src/components/EcosystemHub.tsx` (the Workshop tab goes: its panels received empty data and a no-op setter), `archive/MIGHTBEUSEDLATER/MIGHTBEUSEDLATER.md`, `CLAUDE.md` rows, `docs/DO_NOT_DUPLICATE.generated.md`
- Test: `src/test/ecosystemHub.test.jsx`; `npm run verify:dnd-coverage`, `npm run verify:dnd-map`

**Interfaces:** none produced.

- [ ] **Step 1: Check callers**: for each file, `grep` its name across `src` (not `src/test`, not the moved set). Expected: no caller outside the moved set; `workshopSessionService.js` and `approvalService.js` are not moved. A file with a real caller stays, ruled in the ledger.
- [ ] **Step 2: Move** the files and their tests; remove the Workshop tab; add a line per file to `MIGHTBEUSEDLATER.md` (what it did, why it's archived, what to check before bringing it back).
- [ ] **Step 3: Run** `npx tsc --noEmit -p . && npm run lint && npx vitest run src/test/ecosystemHub.test.jsx src/test/appLazyImports.test.js && npm run generate:dnd-map && npm run verify:dnd-coverage` — Expected: clean.
- [ ] **Step 4: Commit** `chore(archive): the simulated workshop, Agent Pairing and four unused services move to the archive`

### Task 8: The three content-factory desktop specs

**Files:**
- Modify: whatever the cause is in (app or spec); the commit says which and why.
- Test: `e2e-desktop/specs/content-video.e2e.mjs`, `content-carousel.e2e.mjs`, `content-publish.e2e.mjs`

**Interfaces:** none.

- [ ] **Step 1: Reproduce**: build (`npm run tauri build -- --debug --no-bundle`) and run each spec. Expected: the failures recorded in the spec (video: "Choose an output folder in Settings first."; carousel: "Cover" not shown; publish: "Scheduled" not shown).
- [ ] **Step 2: Find the cause** with superpowers:systematic-debugging (where the step's `settings` come from, and whether the saved `outputFolder` reaches them; what Carousel Studio and the Posts list render with the seeded data). Write a failing unit test for an app bug before fixing it.
- [ ] **Step 3: Fix**; rebuild; run the three specs. Expected: all checks pass.
- [ ] **Step 4: Commit** `fix(content): the content-factory desktop specs pass again` (body: the cause)

### Task 9: Desktop specs and docs

**Files:**
- Create: `e2e-desktop/specs/projects.e2e.mjs`, `e2e-desktop/specs/teams.e2e.mjs`
- Move: `e2e-desktop/specs/project-execution.e2e.mjs` to the archive (it tests the simulated page)
- Modify: `CLAUDE.md` (rows: Projects, Teams, Skill results, Agent Workshop/Project Execution and Agent pairing rows marked archived, desktop-suite row and counts), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.48), `docs/USER_MANUAL.md` (Projects, Teams), `docs/AGENT_GUIDE.md` (teams, skill results), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (Part A's Projects/Teams/learning line closed; what C1 leaves), counts in README/AGENTS/ARCHITECTURE/CLAUDE and `scripts/verify-doc-counts.mjs`, the spec's status line

- [ ] **Step 1: Write the specs** (deny unexpected approval windows; `showPlanFirst: 'never'`; `qwen2.5:7b` when installed): projects — a project with a name and description starts a request whose Steps tab lists Jose's planned steps, its Approval tab shows any waiting step, and Results is locked until none waits; teams — a team of Hector (`research_report`) and Alphonso (`assistant_write`) is built and saved, "use team <name> to write two lines about tea" in Chat makes a request labelled "Steps set by your team <name>." with those two steps, and a seeded template giving `research_report` to nova shows its problem with Run disabled.
- [ ] **Step 2: Build and run** both, plus `agent-roles`, `agent-skills` and `jose-board`. Expected: all pass.
- [ ] **Step 3: Docs**, then `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map`, `npm run verify:dnd-coverage`, `npx tsc --noEmit -p .`, `npm run lint`, full `npm test`. Expected: all clean.
- [ ] **Step 4: Commit** `test(part-c1): the real app's Projects and Teams` and `docs(part-c1): Projects, Teams and skill results`
