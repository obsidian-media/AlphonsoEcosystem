# Agent roles, Part C: Projects, Teams, learning, old data, and what the agent phases left open

> **Status (2026-10-27):** C1 (Projects, Teams, skill results, archive, old data) merged (PR 365); C2 (the 18 skills and the agent improvements, plus the folded-in leftovers) built on `feat/agent-roles-part-c2`. Originally: design, written with the owner after the Part C inspection of 2026-10-26 (code reading, three content-factory desktop specs run locally, Ollama probed). Not built yet. Builds on the Part C section of `docs/superpowers/specs/2026-10-24-agent-roles-skills-handover-design.md` (approved 2026-10-24), which is still the base; this document adds what the owner chose to fold in on 2026-10-26 and the details the inspection settled. No earlier Part C plan exists. Ships as two PRs: **C1** (pages and data) and **C2** (skills and agent improvements), one plan each.

Alphonso is used by other people, not only its owner. Every choice below is made for a user on someone else's computer: their own projects, connectors, keys, clock and drive, nothing of the owner's built in.

## Why

The 2026-10-24 spec left Part C for after the per-agent phases. Those phases are done (Hector, Nova, Maria, Sentinel, Marcus, Alphonso, Echo), and each left a few things open in `docs/governance/DEFERRED_WORK.md`. The owner asked to fold the ones that fit into Part C so it closes the gap in one go.

What the inspection found:

- **Projects is simulated.** Work → Projects (`ProjectExecutionMode.tsx`) runs `runProjectWorkshop()`, which builds fixed outputs with no model, from a built-in example (the owner's own "TapCash" project). About 15 workshop services exist only for this page. Four are used elsewhere and stay: `accBridgeService.js` (Bridges, Content Studio), `services/approval/approvalService.js` (Content Studio, the connector registry, packet execution, attention, Notion sync and others), `workshopSessionService.js` (self-development), and `systemHealthService.js`, which reads `diffProposalService.js` and `traceabilityService.js`.
- **Agent Pairing does nothing.** Saved pairs (two agents, a trigger, a note, `localStorage`) are never read. `executeAgentPairing()` marks a bus packet "executed" with no work and has no caller.
- **Saved templates can't be seen.** No screen lists them; `deleteUserTemplate()` has no caller. A template that gives work to the wrong agent only fails when it runs ("plan_rejected").
- **Skill results aren't recorded.** Only "last used" (`alphonso_skill_last_used_v1`, read by the Coach's "never used" check).
- **Hector ignores his skill.** His step records the skill and reason, but `runResearch()` uses its own prompt.
- **Small leftovers:** Chat's notice lists requests cut off when the app closed, not requests waiting for setup; Hector's "Use in a request" only copies to the clipboard; Kokoro being missing is recognised from the error's wording.
- **One request, one project.** "Update shop and blog" works in the first project named.
- **Alphonso's change can't be edited** before approving; the board preview is read-only.
- **Echo by meaning needs ChromaDB.** Ollama refuses embeddings from chat models ("This server does not support embeddings"); a dedicated embedding model is needed, and the backend has no embedding command. None is installed here.
- **Three content-factory desktop specs fail locally too, not only in CI:** `content-video.e2e.mjs` ("Choose an output folder in Settings first." although the test sets one), `content-carousel.e2e.mjs` (Carousel Studio's text not shown) and `content-publish.e2e.mjs` ("Scheduled" not shown after approval). The output folder the test saves doesn't reach the step; the cause is found in the build, not guessed here.
- **Two new skills need something that doesn't exist:** Marcus's sends can't be timed (the reminder needs it), and there is no email connector (the newsletter needs one).

## Owner decisions (2026-10-26)

1. Projects becomes a real Jose request; the simulated workshop and the TapCash example go to the archive.
2. Teams page: build a team from agents and a kind of job (saved as a template), and see every saved template with its problems, Run and Delete. A team is used by name in Chat or with Run.
3. Old saved pairs are each offered once as "Make this a team", or dismissed.
4. Skill results show on the Skills page, per skill.
5. Echo's meaning search: a small embedding model (`all-minilm`, 46 MB, Apache-2.0) downloads by itself the first time Echo searches while Ollama runs, shown with progress in Settings → Memory, with a switch to turn it off. Word search works until then and without it.
6. Any Marcus send can have a time, read from the request; the approval says when; his runner sends it then, once; it shows on the Calendar and can be cancelled.
7. The newsletter goes through n8n or a Composio mail app; no new connector. Without either, Marcus says what to set up and sends nothing.
8. Hector's "find companies or people" collects businesses and people's public work details only (name, role, company, public work page); no home addresses, private phones or personal emails. Sentinel's personal-data check runs on the list.
9. An edit to Alphonso's change is what gets written; the preview is marked "edited by you", Sentinel's code check looks at the edited version, one approval as before.
10. Two projects: one Alphonso step per project, each with its own preview, approval and lock.
11. The unused files go to `archive/MIGHTBEUSEDLATER/` with their tests: `sentinelGateService.ts`, `mariaWeeklyReportService.ts`, `codingAgentService.ts`, `novaFeedbackService.ts`, plus the workshop services only Projects used.
12. 18 new built-in skills (list below).
13. Two PRs.

## C1 — pages and data

### Projects

- Work → Projects keeps its intake (name, description, stack, deadline, type, features, constraints, risks, priority) without a preset. **Start** turns it into one request text and calls `submitToJose()` with the "Build an app" template as the starting point (`planFresh` false), `source: 'user'`, and saves the request id on the project (`alphonso_projects_v2`: `{ id, name, intake, requestId, createdAtMs }`, 50 kept). A project can be started again; each run is a new request on the same project.
- Tabs read that request: **Plan** (the map, how it was planned), **Steps** (each step's status and what it produced, through `JoseStepOutput`), **Approval** (the request's own waiting steps with Approve and carry on / Reject, through the same calls as the board), **Results** (locked while any step waits, as today). "Open on the board" links to the Requests tab.
- Alphonso's code steps use the user's own projects (Settings → Agents → Alphonso's projects); a Projects entry may name one, else the step asks which, as today.
- The workshop services used only by this page, `runProjectWorkshop()`, the TapCash preset and the page's reading of `approvalService.js` go to the archive. `approvalService.js` stays for its other callers. `systemHealthService.js` stops reading the diff-proposal and trace stores (both archived) and reports what it still knows.

### Teams

- Agent Pairing becomes **Teams** (sidebar System → Teams, the old `pairings` id kept so links and the Dashboard card still work).
- **New team:** a name, a kind of job (one line), and the agents. For each agent the builder offers only the task types it owns (`taskTypesFor()`), one step per agent, with "needs" in the order picked (editable). Saved through `saveUserTemplate()` with `matchWords` from the name and the job; `checkPlan()` with task types must pass before Save.
- **Your templates:** every saved template (teams and "Save as template" ones) with its agents, when saved, its problems from `checkPlan()` (in plain words, e.g. "Gives Hector's research to Nova"), **Run** (asks for the request text, then `submitStepsToJose()` with the template's steps and the label "Steps set by your team <name>."), **Edit** (the same builder) and **Delete** (`deleteUserTemplate()`). A template with problems can't run until fixed; nothing is changed by itself.
- **By name in Chat:** "use team Launch to …" or "/team Launch …" runs that template with the rest of the message as the request. An unknown name says so and lists the teams.
- **Old pairs:** each saved pair is shown once at the top ("Make this a team": the two agents with the pair's trigger as the job, opened in the builder; or Dismiss). The list is kept until each is handled, then removed.
- `executeAgentPairing()`, the pairing route table and the pairing view go to the archive.

### Learning

- Each finished step records `{ atMs, agent, skill, actionType, model, outcome: done | failed | setup_needed | rejected, verdict?: pass | fix }` in `alphonso_skill_outcomes_v1` (1,000 kept). A review's verdict is written onto the reviewed step's record when the review ends.
- All Agents → Skills shows beside each skill: "Used 12 times · 9 of 10 reviews passed · last used today" (or "Not used yet").
- The Coach's "never used" check reads this record. `alphonso_skill_last_used_v1` is read once to seed it, then left alone.

### Old data

- Saved requests, step outputs, templates and content projects keep loading. A moved task type is mapped when it next runs, with a change-log line (already built in Part A; covered by tests here).
- A saved template or a waiting plan that gives work to a non-owner shows its problem on the Teams page or the board and can't run until fixed.

### The three content-factory desktop specs

- Found and fixed in the build: why the output folder the spec saves doesn't reach the step, and why Carousel Studio's text and the "Scheduled" status don't show. If the app is right and the spec is out of date, the spec is fixed and the reason written in the commit. All three pass locally and in CI's desktop job.

### Archive

Moved to `archive/MIGHTBEUSEDLATER/` with their tests and a line each in `MIGHTBEUSEDLATER.md`: the workshop services used only by Projects (`agentRunnerService`, `aiReviewPolicyService`, `contentCatalystBridgeService`, `contextEngineeringService`, `diffProposalService`, `executionModeService`, `externalAgentAdapter`, `joseOrchestrationService`, `operationalModeService`, `providerAdapterService`, `traceabilityService`, `verificationChainService`, `workContractService`, `projectDnaService`, `projectExecutionService`, `marcusAuditService` and their components), the pairing files, and `sentinelGateService.ts`, `mariaWeeklyReportService.ts`, `codingAgentService.ts`, `novaFeedbackService.ts`. A file found to have a real caller during the build stays, and the plan says why.

## C2 — skills and agent improvements

### New built-in skills (18)

Each is a Markdown file in `src/skills/<agent>/`, passes `checkSkill()` (the agent's own task types, its own tools, no effect it lacks), and is written for any user.

- **Alphonso:** fix a bug from an error (read the error and the files it names, change only what fixes it, run the check); write tests (in the project's own test style, then run them); explain code (read only, plain words); summarise a document (a file the user names: main points, decisions, open questions); API and tool integration (the client code for an outside service, its key read from the project's settings or environment and never written into code, a test; facts about the service come from Hector through `HELP:`); plan and build a feature (the files and the order first, built in stages, each stage checked before the next, within his one code step; splitting work between agents stays Jose's).
- **Hector:** compare products and prices (options side by side, each price and feature with its source and date); find companies or people (decision 8).
- **Nova:** pros and cons of one decision (gains, costs, risks, what would change the answer); pricing (from Hector's findings about rivals and the value).
- **Maria:** review code (Alphonso's changed files, findings with file and line); brand voice check (the brand's tone, words to avoid and kept lessons).
- **Sentinel:** dependency check (the project's dependency files: unknown, unmaintained or risky packages); personal-data check (names with private contact details, addresses, phone numbers, ID numbers in text before it's sent or saved).
- **Marcus:** email newsletter (decision 7); follow-up reminder (a timed send, below).
- **Echo:** weekly decisions digest (this week's decisions by topic, with where each was made); project memory summary (everything decided about one project or topic, oldest first, with what replaced what).

### Timed sends (Marcus)

- `prepareMarcusSend()` reads a time from the request ("tomorrow at 9", "Friday 14:00", "in 2 hours") in the user's own time zone; an unclear time asks. `SendPreview.sendAtMs` is shown in the approval and on Telegram ("Send to Slack #team at Tue 09:00: “…”").
- After approval a timed send goes to Marcus's runner (`schedulePublish()`), sent once at its time; it shows on the Calendar (moved or cancelled like his other sends). A time in the past sends now and says so.

### Two projects (Alphonso)

- A request naming two or more of the user's projects gets one Alphonso code step per project (the planner is told; the rule plan does the same). Each step has its own preview, approval and project lock, so they can run side by side.

### Editing Alphonso's change

- On the board, each file in his preview has **Edit**; saving keeps the edited content in the step's `codePreview` (lines and first changes recomputed), marks it "edited by you", and refreshes the content check (`contentHash`). Sentinel's code check after his step reads the edited version. Commands are unchanged. One approval as before.

### Hector follows his skill

- Hector's skill instructions go into his write-up prompt (not into the search queries, which stay the request's own words).

### Echo by meaning

- New backend command `ollama_embed(model, inputs, endpoint?)` (the window is refused by an Ollama the user started). The first time Echo searches while Ollama runs and the switch is on (Settings → Memory → "Match decisions by meaning", on by default), `all-minilm` is pulled through `ollama_pull_model` with its progress shown there. Decisions get a vector when saved (and existing ones once, in the background); a search adds the closest by meaning to the word matches. ChromaDB, when running, is still used as today. No model, Ollama off, the switch off, or a failed pull → word search, said in Settings.

### Small leftovers

- Chat's notice also lists requests waiting for setup, with what to set up and Carry on.
- Hector's "Use in a request" fills Chat's message box (not the clipboard) and opens Chat.
- `content_tts_kokoro` returns `{ ok: false, missing: true }` when Kokoro isn't installed; the voice step checks the flag, not the wording.

## Testing

- **Unit:** a Projects run calls `submitToJose()` with the template and saves the request id; tabs read the request; Results locked while a step waits. Team builder offers only owned task types; a team saves and runs; a bad template shows its problem and can't run; "use team X" runs it, an unknown name lists teams; old pairs offered once. Outcomes recorded per step, the review's verdict on the reviewed step; Skills page lines; Coach reads the record. Each new skill passes `checkSkill()` and is picked for its task. Timed sends: time parsing, the preview line, the runner sends once, a past time sends now. Two projects give two steps with two locks. An edited preview is written, marked and rechecked. Hector's prompt contains his skill. Echo's vectors, the switch, the fallback. The notice, the pre-fill, the Kokoro flag.
- **Desktop (`e2e-desktop/`):** `projects.e2e.mjs` (a project starts a real request whose steps and approvals show in its tabs), `teams.e2e.mjs` (a team built, run by name in Chat, a broken template refused), and the three content specs passing. C2 adds checks to `alphonso.e2e.mjs` (an edited preview is what's written; two projects get two steps), `marcus.e2e.mjs` (a timed send to the local n8n stand-in waits on the Calendar and arrives once at its time) and `echo.e2e.mjs` (with the embedding model, "when do we launch?" finds the launch decision worded differently; without it, word search).

## Calls made in this document (owner may override)

1. Projects stored as `alphonso_projects_v2`, 50 kept; each Start is a new request on the same project.
2. Teams keep the `pairings` sidebar id; "/team <name>" and "use team <name>" both work.
3. Old pairs are removed once each is handled.
4. Outcomes kept: 1,000.
5. The embedding switch is on by default; `all-minilm` (46 MB).
6. A timed send in the past sends now and says so; an unclear time asks.
7. A file found to have a real caller during the build stays out of the archive.
