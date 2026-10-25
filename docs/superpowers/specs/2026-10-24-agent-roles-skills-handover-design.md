# Agent roles, skills and hand-over (the phase before Jose phase 7)

> **Status (2026-10-25):** Part A merged 2026-10-24 (PR 356); Part B built 2026-10-25 (plan `docs/superpowers/plans/2026-10-25-agent-roles-part-b.md`); Part C not built yet. Design written with the owner in the session of 2026-10-24. Builds in three parts: A (owners and hand-over), B (real skills), C (Projects, teams, learning, old data), each merged on its own.

## Why

The owner asked for a deep look at how the agents actually work before Jose phase 7. The inspection (read from the code on 2026-10-24, not run live) found that the agents mostly work alone:

- Six of the nine agents never receive the work of the steps they depend on. `executeAssignment` in `joseExecutionEngineService.ts` passes `priorOutputs`, memory and the conversation only to Alphonso, Miya and Jose; Hector, Maria, Echo, Sentinel, Nova and Marcus get the request text.
- So reviews (Maria, Nova, Sentinel) review the request, not the draft, and the review loop then asks the reviewer whether its own review asked for changes. Marcus posts the step instruction plus the request to Slack (`marcusExecutionService.ts`, `executeMarcusSlackAction`), not the post Miya wrote, and never sees Maria's review. A help step's answer never reaches the step that asked.
- Outputs reach a step keyed by agent (`priorOutputsForNeeds()`), so a step needing two Miya steps sees only one; Alphonso reads only Miya, Miya only Hector (the old fixed chain).
- Skill packs reach a prompt in one place only (Miya's old Quick package, all 21 at once). A pack is one sentence and five generic steps. The real know-how lives in the content factory's hand-written prompts (`contentStepPrompts.ts`), usable only inside Miya Studio.
- Work goes to the wrong owner: Jose writes answers himself when no specialist matches; Alphonso and Miya may take `orchestration_` steps; Nova does a "market and competitor check" (finding facts is Hector's); Alphonso assembles the finished video; the help chooser isn't told who owns what.
- Paths outside Jose's plans pick agents their own way: the picture shortcut goes straight to ComfyUI, the voice backend routes by keywords (`voice/backend/router.py`), Boardroom and Simple mode let any agent answer anything, three workflow systems assign agents themselves, CALL-E calls start from Chat, and a Hermes-backed agent can use Hermes's own tools.
- The final report is bookkeeping ("Jose merged 3 agent report(s)…"). Work → Projects shows fixed templates as agent output (`deterministicAgentTemplate`). Agent Pairing saves pairs nothing reads.

The owner's principle (2026-10-24): **each agent has its own responsibility and its own set of skills.** Research is done only by Hector, Jose only orchestrates, Miya only does content, and the same for the rest.

## Goals

1. Every kind of work has exactly one owner, and every path that gives an agent work obeys it.
2. Every step gets the work it depends on, in full, plus a short summary of the rest.
3. Each agent has real skills: know-how plus the tools that skill needs, picked by the agent with a reason shown on the board. Users can add their own.
4. A request ends with a short summary and the full work on the board.
5. Projects becomes real agent work; pairing becomes team templates; skill use is recorded; old saved data keeps working.

## Non-goals

- Jose phase 7 (the owner's own topic comes first).
- New agents, new connectors, a skill marketplace.
- Changing approval by effect, the 50-step and time limits, or which effects each agent may have (only who owns which task types).

## Anti-goals (a failure even if it technically works)

- An agent doing another agent's job, quietly. A step whose owner can't do it is never handed to someone else.
- A silent fallback (a template or default shown as if an agent made it).
- Prompts so long a 3B local model loses the task: the summary of other steps is one line each, capped.
- A user skill that gives an agent more than its job and its effects allow.
- Anything hardcoded: models, addresses, folders, model-size thresholds come from settings or installed models.

## The responsibility map (owner decisions, 2026-10-24)

| Agent | Owns | Never does |
|---|---|---|
| Jose | Planning, routing, approvals, the closing summary | The work itself: no writing, research or reviews |
| Alphonso | Code (front-end too), running commands, changing the project, plain questions and everyday writing (emails, notes) | Brand content, design |
| Miya | Content and design: scripts, scenes, pictures, voice, music, Shorts, carousels, campaign copy, UI/UX design, editing the finished video | Code |
| Hector | Finding facts: research, sources, competitor material, stock footage | Judging value, writing content |
| Nova | Judging value, priority and timing from what Hector found | Gathering facts |
| Maria | Quality, governance and risk reviews | Security |
| Sentinel | Security and safety checks | Quality |
| Marcus | Sending and publishing approved work, outreach (calls) | Deciding what to say |
| Echo | Organising, merging and cleaning memory | — (agents may save their own notes; Echo curates them) |

### Task types follow the map

`AGENT_PERMISSION_TABLE` (`src/services/jose/agentPermissionTable.ts`) stays the one table. Each task-type prefix belongs to exactly one agent; `agent_report` (every agent's report to Jose) is the only shared entry. Changes:

- Jose keeps `orchestration_`, `boardroom_`, `cost_policy_`, `remote_message_route` (routing an inbound message is orchestration; used by `connectorPolling.js`). He loses `research_review` and `creative_package_review`. `executeJoseAssignment` no longer writes answers: a step no specialist matches goes to Alphonso (`assistant_answer`, `assistant_write`).
- Alphonso loses `orchestration_`; gains `assistant_`. `runtime_assemble_video` becomes Miya's `creative_assemble_video` (same executor in `contentMediaExecutor.ts`; ffmpeg is a tool of her editing skill).
- Miya loses `orchestration_`; gains `design_` (UI/UX design output only, never code).
- Hector loses `remote_message_route`. `external_publish_handoff` (a readiness check that publishes nothing) moves to Marcus as `distribution_readiness`.
- Nova's `analysis_market` in the Content video template becomes Hector `research_market` followed by Nova `analysis_market` that needs it and judges only what Hector found.
- `risk_` moves from Sentinel to Maria (Maria is the risk lead; Sentinel keeps `security_`, `permission_`).
- Marcus gains `outreach_` (calls).
- Marcus's profile (`marcusProfile.js`) drops "Security Audit" and "Risk Detection" from `skillFocus`; every profile's purpose and limits match this map.

A test fails if any task-type prefix (other than `agent_report`) is listed for two agents, and if any `actionType` used anywhere in `src` (templates, `ACTION_EFFECTS`, content factory, workflows) has no owner or two. `checkPlan()` already refuses a step whose task type its agent may not take; with no overlaps, that check is the owner rule.

## Part A — owners everywhere, the hand-over, the summary

### The hand-over (one input for every agent)

Every executor receives the same `StepInput` (new, in `src/services/jose/stepInput.ts`):

- `instruction` (the plan's instruction for this step) and `request` (the user's words; Alphonso still reads build/test/run intent only from these, as `stepCommandText()` does today),
- `needs`: for each step this one needs, by **step id**, the full saved output (`summary`, the readable `schema`/text, files, sources) from `joseStepOutputs.ts`,
- `others`: one line (`agent name: summary`, cut to 160 characters) for every other finished step of the request, at most 12 lines, newest first,
- `memory`: the snippet `retrieveRelevantContext()` already finds, for every agent,
- `content`: the brand and project when the step is a content step (as today),
- `review`: for a review step (`reviewOf`), the reviewed step's full output, named as the thing to review.

`priorOutputsForNeeds()` is replaced by a by-step version; callers that read "Miya's output" pick the needed step by id. The agent services (`runMariaGovernanceAudit`, `runEchoPreservation`, `runSentinelSecurityScan`, `runNovaAnalysis`, `runMarcusDistribution`, Hector's executor) take `StepInput` and put the needed work into their prompts.

Long outputs: a needed output longer than the agent's budget is cut with "(cut: N more characters on the board)". Budget: 6,000 characters per needed step for local models, 20,000 for paid or cloud models. My call; adjustable constants beside `JOSE_LIMITS`.

### Reviews judge the draft

A review step's prompt contains the reviewed step's full output and asks for the review **and** a verdict in one answer (`{ "review": "...", "verdict": "pass" | "fix", "findings": [...] }`). `judgeReview()` reads that verdict; it asks the reviewer's model a second time only when the verdict is missing, as today. The revision step receives the findings and the previous draft.

### Marcus sends the work

Marcus sends `payload.text` when given (Boardroom), else the text output of the step he needs (the post, the release note), never the instruction or the request. With nothing to send he fails: "Nothing to send: no earlier step wrote the text." His Maria check reads Maria's verdict from the step he needs, or from Maria's step in the same request.

### When the owner can't do it

No hand-off to another agent. The same agent may still retry, use a larger installed model, or a paid retry (phase 4), because that is still the owner. When the owner can't work at all (no search key, no model, a tool not installed) the step ends `setup_needed` with what to set up, in plain words and with where ("Add a search key in Settings → Connectors → Search & Research."). The request waits; Carry on runs the step again once it's set up. Telegram says the same with a Carry on button.

### Help goes to the owner

`chooseHelper()` is told the map (what each agent owns) instead of a bare list, and `safeHelper()` refuses a helper whose task types don't own the asked task type. The helper's output reaches the asking step's second run through `needs` (it already depends on the help step).

### The closing summary

Every request ends with Jose's short summary, built from the steps (no model call): one line per step (agent, what it did or that it waits or failed and why), what waits for you, and "Open on the board". My call: when the request has one step, its full output is shown instead (a plain question, an email Alphonso wrote), since the summary would hide the answer. `createJoseReportToUser()` builds it; Chat, Telegram, WhatsApp, the phone and schedules show it.

### Every path obeys the owners

- **Shortcuts.** The picture shortcut becomes a one-step Miya request (`creative_image`) through `submitStepsToJose()`; a named workflow runs as given steps. `runPipelineShortcuts()` keeps matching, but no longer calls ComfyUI or a workflow itself.
- **Direct answers.** `answerOrPlan()`'s direct answer stays Alphonso's (he owns plain questions).
- **Voice.** `voice/backend/router.py` routes by the same map: the owner words come from one shared file (`src/agents/shared/agentOwners.json`, bundled with the voice backend), not a second keyword list. Each voice persona prompt states its job and what it never does.
- **Boardroom and Simple mode.** Each agent's chat prompt (`boardroomFacilitatorService.ts`, `CompanionMode.tsx`'s replies) states its job and what it never does. Asked for another agent's work, it says who does it; in Boardroom it may @mention that agent (the chain cap and budget still apply). It never does that work itself.
- **Workflows.** The 16 operations' `agentSequence`s, the agent-chain workflows (`WORKFLOW_STEP_TASK`) and the visual builder's agent nodes are checked against the map; a test fails on any step given to a non-owner. A visual workflow node with an agent runs as that agent's owned task type.
- **CALL-E.** Placing a call (REST `createCall` or MCP `run_call`) becomes a Marcus `outreach_call` step with `publish_or_send` and `spend`, so it asks like every send, appears on the board and on Telegram. The planning conversation (`plan_call`) stays in Chat. The escalation service's calls stay as they are: they call you about an approval, which is Jose's approval channel, not outreach. My call.
- **Hermes.** A Hermes-backed agent's system message states its job, what it never does and its allowed effects. Alphonso can't see inside Hermes, so a Hermes step by an agent without `run` is marked on the board "Runs on Hermes, which can use its own tools", and keeps its approval (Hermes is already high risk). Limit stated plainly; not enforceable from Alphonso's side.

## Part B — real skills

### What a skill is

Know-how for one kind of job plus the tools it needs. One Markdown file with front matter:

```markdown
---
name: Claim check
agent: maria
use_when: The work states facts, numbers or quotes that need checking against sources.
task_types: [audit_content_quality, audit_claims]
tools: [read_step_output, read_sources]
steps: [read_step_output, read_sources]   # fixed order for small models
output: review_with_verdict
---
Instructions the agent follows…
```

- Built-in skills live in `src/skills/<agent>/*.md` (bundled). User skills live in `<app data>/skills/<agent>/*.md`. A user skill with the same name as a built-in one is shown beside it, never over it.
- `task_types` must all be owned by `agent`; `tools` must be in the agent's tool list and need no effect the agent lacks. A skill that breaks either is refused with the reason, whether built-in (a test) or added by a user (on save or load).
- `output` names a known output shape (`text`, `review_with_verdict`, the content factory's JSON shapes). The content factory's step prompts become the built-in skills of their agents with the same text and shapes, so there is one place for know-how.

### Tools

A small registry (`src/services/skills/skillTools.ts`): each tool has a name, the effects it needs and the agents that may use it, and wraps an existing function (no new connectors). First set: `read_step_output`, `read_memory`, `save_note` (all); `web_search`, `fetch_source`, `stock_search` (Hector); `read_sources` (Maria, Nova, Sentinel); `make_picture`, `make_voice`, `make_music`, `assemble_video` (Miya); `read_project_file` (Alphonso, Maria, Sentinel); `run_command`, `write_project_file` (Alphonso); `send_message`, `publish_post`, `place_call` (Marcus); `organise_memory` (Echo). The builder fills the list from the functions each agent already uses.

### Picking the skill

The step runs with its agent's skills offered by name and `use_when`. The agent answers with `{ "skill": "...", "reason": "..." }` (one short sentence); then the skill runs. Unreadable or unknown → the skill whose `task_types` contain the step's action type, with the reason "Matches this step's task." The board shows the skill and the reason under the step. Exception: a content factory step needs a fixed output shape, so it uses the skill for its action type and says "This step's format needs it."

### Fixed order or the agent's own calls, by model size

- Small local model (under the size set in Settings → Agents, default 14B, from `modelSize()` in `joseModels.ts`): Alphonso runs the skill's `steps` in order and puts the results in the prompt.
- Larger local, cloud or paid model: the agent may call the skill's tools itself, at most 5 calls per step, in a JSON tool-call format; results go back each time. Every call is checked against the agent's effects and the tool's; a call needing approval stops the step to ask, as today.

### Adding your own

On each agent's page (EcosystemHub's Skills tab regrouped by agent): "New skill" (name, use when, the task types from the agent's own, tools from its own list, instructions), "Import a skill file", and "Open skills folder". The form writes the same file. Export copies the file.

### The old packs

The about 160 one-line packs (`skillPackContent*.ts`, `skillPackGuidance.ts`) go to `archive/MIGHTBEUSEDLATER/` with a note (owner approved, 2026-10-24). `validateSkillPackAgainstContract()` becomes the skill check above. Each agent starts with 3 to 8 built-in skills; my first list: Jose — none (planning is not a skill step); Alphonso — answer a question, everyday writing, code change, verify a build; Miya — the content factory's creative skills plus UI design; Hector — web research with sources, competitor material, stock footage; Nova — value and priority, timing, performance reading; Maria — quality review, claim check, governance review; Sentinel — text and link check, permission audit; Marcus — send a message, publish a post, place a call, release notes delivery; Echo — save decisions, merge and clean memory.

## Part C — Projects, teams, learning, old data

- **Projects.** Work → Projects' intake makes a real Jose request from the "Build an app" template (adapted by the planner); its tabs show that request's steps, outputs and approvals (Jose's). The deterministic workshop services and Project Execution's separate approval list (`services/approval/approvalService.js` for this page) go to the archive. The Approval tab and Results lock keep working, on the request's own approvals.
- **Teams.** Agent Pairing becomes **Teams**: pick agents and a kind of job; it saves a user template (`joseUserTemplates.ts`) whose steps give each agent only work it owns. Existing saved pairs are offered once as "Make this a team".
- **Learning.** Each finished step records `{ agent, skill, actionType, verdict (when reviewed), outcome, model }` (`alphonso_skill_outcomes_v1`, 1,000 kept). Each agent's page shows per skill: times used, reviews passed. Suggestions from it are later work.
- **Old data.** Saved requests, step outputs, templates and content projects keep loading. An old step whose task type moved (Nova's market check, Alphonso's assembly, Jose's direct answer) is mapped to its new owner when it next runs, and the change log says so. A saved template or plan that gives work to a non-owner is shown with the problem ("Gives Hector's research to Nova") and can't run until fixed; nothing is changed silently.

## Testing

- Unit: no task type with two owners; every action type has one owner; `StepInput` built by step id; Maria's review prompt contains Miya's draft; Marcus sends the needed step's text and fails with nothing to send; setup-needed stops and carries on; help refused for a non-owner; the summary; skill file validation (wrong agent, foreign task type, forbidden tool); skill picking with fallback; fixed-order vs tool-calling by model size; workflow and voice owners; old-step mapping.
- Desktop (`e2e-desktop/`): a request "research X, write a post about it, check it, and send it for review" shows on the board Hector's sources reaching Miya, Maria's review quoting the draft, the skill and reason under each step, and the closing summary in Chat (nothing sent). A user skill added by form appears in the skills folder and is used.

## Left to the builder

The exact tool list per agent from existing functions; the JSON tool-call format; the text of each built-in skill (starting from the existing prompts); the order of files within each part. Questions only the owner can answer go back to the owner.

## Calls made in this document (owner may override)

1. Cut needed outputs at 6,000 / 20,000 characters; 12 summary lines of 160 characters.
2. A one-step request shows its full output instead of the summary.
3. Escalation calls stay Jose's approval channel; only outreach calls are Marcus's.
4. Hermes steps get a board note; their internals can't be enforced.
5. Model-size threshold for the agent's own tool calls: 14B, set in Settings.
6. Content factory steps use the skill for their action type (fixed output shape).
7. `risk_` moves to Maria; `external_publish_handoff` becomes Marcus's `distribution_readiness`.
8. The first built-in skill list above.
