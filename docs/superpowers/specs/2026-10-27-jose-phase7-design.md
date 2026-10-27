# Jose phase 7: finishing Jose, and the agent phases' leftovers

> **Status (2026-10-27):** built on `feat/jose-phase7` (plan `docs/superpowers/plans/2026-10-27-jose-phase7.md`); the live check with the owner's keys (Task 16) is deferred to the doc pass after 2.10.0 (owner).

Alphonso is used by other people, not only its owner. Every choice below is made for a user on someone else's computer: their own projects, keys, models and graphics card.

## 1. Intent

Jose phase 7 is the last phase of the Jose redesign (spec `docs/superpowers/specs/2026-10-23-jose-orchestration-redesign-design.md`, phases 1 to 6b built). The owner kept a list for it in `docs/governance/DEFERRED_WORK.md` ("Jose redesign phase 7", 2026-10-23), and asked (2026-10-27) to fold in as much as possible of what the earlier Jose phases and the agent phases left open, so those deferred entries can close.

What a user gets:
- they can **stop** a request that is running, and **cancel** one that was cut off or is waiting for setup;
- requests that use the local model **wait their turn** instead of fighting over it;
- every way of starting work goes through Jose (workflows too), and every place that starts a request can **open it on the board**;
- Jose plans from **what you asked**, not from what was said earlier in the chat;
- agents can **ask for help or for an action** partway through their work, through Jose;
- the agent checks that never ran in CI **run on every PR**.

The phase ends with a **live check** using the owner's own keys, and a whole documentation pass follows it (owner, 2026-10-27), before the 2.10.0 release.

## 2. Goals

### Jose's own list (DEFERRED_WORK, 2026-10-23)

1. **Stop a running request**, from the board, Chat and Telegram (owner: stop the running step, keep finished work).
   - Every step that has finished keeps its output; the step that is running has its model call cancelled; nothing new starts.
   - The request becomes `stopped` ("Stopped by you"), a final status: it can't carry on.
   - Something that already happened stays done: a send that went out is not unsent, a file Alphonso wrote stays written, a picture ComfyUI is making may still finish there (its result is not collected).
   - A step whose action can't be interrupted safely (Marcus sending, Alphonso writing files) finishes that one action first, then the request stops.
   - Telegram: `/stop` stops the newest running request, paired chat only (the existing rule). Telegram gets no "working on it" message today, so there is no button to put Stop on.
   - Each of the request's waiting packets is rejected, its project lock released (`releaseProject()`), and its queued place (goal 2) removed.
2. **One model-heavy request at a time** (owner: any request using a local model).
   - A request that will use a local Ollama model or ComfyUI waits while another such request runs. Plain answers in Chat skip the queue (an answer must stay fast, an anti-goal of the redesign). A request whose steps all use paid or cloud models doesn't wait.
   - First come, first served. The board shows "Queued (2nd)" and Chat shows "Waiting for another request to finish"; a queued request can be stopped or cancelled.
   - A request waiting for you (approval, setup, plan) does not hold the queue; it rejoins at the back when it carries on. Miya Studio's Run project queues like any other.
   - Not the resource manager the owner described separately (measuring memory, starting and stopping tools): that is its own phase later. This is only the queue.
3. **Workflows through Jose.** The Workflows panel's Run and the phone's "run workflow" (`executeWorkflowTasks()` in `WorkflowPanel.tsx` and `App.tsx`) run the workflow's agent chain through Jose (`runWorkflow()`, a request since phase 6a), so they show on the board, ask by effect and can be stopped. The operations' own executors (`workflowExecutionService.js`) are not agents; they stay behind the Automation page's Operations tab.
4. **Open on the board from Boardroom.** Boardroom's notes ("Follow it on the Orchestrator page, Requests tab.") get an **Open on the board** button, the same way Chat's works (`onOpenJoseBoard`).
5. **Help requests in content-factory steps.** Content steps' prompts tell the agent it may end with "HELP: …", like every other planned step, so Jose's help loop (`joseHelp.ts`) works for them.

### Left by phases 1 to 6b

6. **The planner plans from the request.** The request goes first; the chat history is given as background only, marked as earlier conversation, and the planner is told that the request wins where they differ (a destination, a project, a person). The `marcus.e2e.mjs` case (n8n asked, Slack #news from two messages earlier planned) becomes a unit test and stays in the desktop spec.
7. **Cancel a request that was cut off or is waiting for setup.** Board and Chat's notice get **Cancel** beside **Carry on** (the redesign's goal 15 said "Resume / Cancel"); Telegram's Carry on message gets Cancel too. The request becomes `cancelled`, as a rejected one does today.
8. **A content video from Telegram or a schedule starts a Miya Studio project** (owner), as Chat does since phase 6b: the default brand, the message as the idea, and the reply says it's in Miya Studio. A schedule has no paid models (unchanged), so a project started by one never spends.
9. **The board groups a project's requests.** Each "Run this step" stays its own request; the board shows a project's requests together under the project's name, newest first (owner).
10. **A batch is planned in one call** (owner): Jose plans every task of a batch in one answer, each plan checked by `checkPlan()`; if the answer can't be read, it falls back to one call per task, as today.

### Folded in from the agent phases (owner, 2026-10-27)

11. **A small local model in CI's desktop tests.** The desktop job installs Ollama's bundled runtime and pulls one small model, so the specs that need a model (Maria, Nova, Alphonso, Echo, Marcus, Hector, agent roles and skills, the planner) run on every PR instead of skipping. Their checks may have to accept a small model's answers (they check owners, shapes and rules, not wording); a spec that needs a bigger model says so and skips, naming the model.
12. **Fix the two content tests** that time out only in CI (`content-carousel.e2e.mjs`, `content-publish.e2e.mjs`), from what PR 366's `CONTENT-DIAG` lines show, with a unit test that fails first.
13. **Skill results guide the pick.** When an agent has several skills for a step, a skill whose reviewed work keeps failing is offered after the others, and a skill with no record is not held back (`skillStats()` from Part C1). The reason on the board says so ("Picked … — the other skill's work failed review 4 of 5 times"). A single skill is always used, as today.
14. **Mid-step hand-offs.** An agent that, partway through its step, wants an action it doesn't own (a send, a command, a file change, media) asks for it the way it asks for help: Jose adds a step for the agent who owns that action, with that action's effects, so it waits for approval as any such step does. Agents still never call each other, and Jose still never acts himself. The action tools listed in skills (`send_message`, `publish_post`, `place_call`, `run_command`, `write_project_file`, Miya's media tools) become requests like this when called mid-step, instead of being refused.
15. **Alphonso may run a small node script he wrote** (owner, 2026-10-27): `node <file>` where the file is inside the step's folder and is a file of the change or already there; never `node -e`, `-p`, `--eval`, `--require`, flags that load other code, or a path outside the folder. It counts as running code, so it is in the step's preview and asked once with it. Changed in `policy_gate.rs` with tests for each refused form.

### The live check (end of the phase)

16. One sitting with the keys the owner has: Telegram buttons (approve, reject, stop, cancel, Echo's forget and cleanup), a paid model step (`jose-paid-live.e2e.mjs`), Marcus's channels, Composio, Google Web Risk, ElevenLabs and Higgsfield. Whatever has no key stays in `DEFERRED_WORK.md`, named. Keys are typed into Settings, never put in the repo or an environment the app reads.

## 3. Non-goals

- The resource manager (measuring memory, starting and stopping tools, Hermes profiles), OpenRouter, a real MCP server and the Hermes gateway: each is its own phase later (owner, 2026-10-27).
- **WhatsApp and phone-companion approvals** (owner: deferred). Written up properly in `DEFERRED_WORK.md` in this phase.
- **Echo's decisions synced between computers** (owner: deferred, a phase of its own: storage and conflicts). Written up properly in `DEFERRED_WORK.md` in this phase.
- Releasing: 2.10.0 is cut after this phase and the documentation pass, not in it.

## 4. Anti-goals

- A plain question becoming slow, or waiting in the queue.
- Stop that leaves a half-written file, or claims something wasn't sent when it was.
- A request stuck forever "Queued" behind one that is waiting for you.
- A hand-off that lets an agent do something without the approval its effect needs, or lets one agent call another.
- A CI run that is green because the model tests quietly skipped.

## 5. Constraints

- Reuse what exists (CLAUDE.md's Do Not Duplicate table): the request store, `adaptPlan()` and the help loop, `submitStepsToJose()`, effects and approvals, the project lock, the skill results, the Telegram button tokens, `onOpenJoseBoard`.
- No hardcoded model names in the app; the CI model is chosen in the CI file and the specs read what is installed.
- Every change keeps the full unit suite green and adds desktop checks for what it changes.
- Windows first; English only; plain words on screen, no em dashes in new screen text.
- Docs change in the same commits as the code.

## 6. Decided by the owner (2026-10-27)

- Keep "one model-heavy request at a time" in phase 7; the full resource manager later.
- Stop: cancel the running step, keep finished work.
- Queue: any request using a local model, one at a time.
- Fold in: a small model in CI's desktop tests, the two content tests, skill results guiding the pick, mid-step hand-offs.
- Live check day at the end of the phase.
- Content videos from Telegram and schedules start a project.
- Node scripts allowed, with approval.
- "Run this step" requests grouped under the project on the board.
- Batches planned in one call.
- WhatsApp and phone approvals, and Echo sync: deferred, documented properly.

## 7. Calls I made (the owner can overrule)

- A stopped request is final (`stopped`), not resumable: carrying on after a stop would surprise more than help.
- Sending and file writing finish their one action before a stop takes effect, so nothing is half done.
- Cloud-only requests don't queue: they don't use the local model or graphics memory.
- A waiting request leaves the queue and rejoins at the back, so nothing waits on someone who isn't there.
- Hand-offs reuse the help loop's shape (a line Jose reads, then an added step) rather than letting a tool call run the action.
- `node` may run only a file inside the step's folder, with no flags.
- In Chat, Stop sits on the live progress line of a running request (beside "Open on the board"); the existing Stop for a streaming answer is unchanged.
- A hand-off for an action the agent already owns isn't a hand-off: Alphonso's commands stay in his own step's preview, as today.
- The queue applies to every source (Chat, Telegram, schedules, Boardroom, workflows, Miya Studio), so a schedule firing during a Miya project waits too.

## 8. Left to the builder

- How Stop reaches a running model call (the signal through `generateAgentLlmResponse`, which already takes one) and how the engine checks between steps.
- Where the queue lives and how it survives a restart (a queued request at start is queued again, in its order).
- The CI model (small enough for a CPU runner) and the desktop job's time limit; splitting the model specs into their own job if one job gets too long.
- The exact hand-off line format, and the plan check that the added step's agent owns the action.
- How the board groups a project's requests.
