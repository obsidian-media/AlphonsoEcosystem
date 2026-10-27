# Jose orchestration redesign: design

> **Status (2026-10-27):** phases 1 to 6b built (PRs #336 to #342, 2026-10-23); phase 7 merged in PR #367 (design `docs/superpowers/specs/2026-10-27-jose-phase7-design.md`). All released in 2.10.0 (2026-10-27).

Status: approved by the owner (2026-10-23). Phase 1 is planned in `docs/superpowers/plans/2026-10-23-jose-redesign-phase1.md`.

## 1. Intent

Jose is Alphonso's **dispatcher, project manager and single point of contact**
(owner, 2026-10-23). Wherever the user asks for something — Chat, a project,
Boardroom, a schedule, Telegram, WhatsApp, the phone companion, a workflow, the
content factory — it goes to Jose. He:
- works out what is needed;
- plans which agents do which part, in what order;
- coordinates them while they work, including when one needs another's help;
- sends work back for fixes when a review finds problems;
- asks the user only where it matters;
- returns one combined result.

Example (owner): "start app Y" → Hector does market research, Miya designs and
writes the front end, Alphonso builds the back end and tests, Sentinel audits,
Maria reviews, and Jose brings it together. The Miya content factory is one
kind of request, not the whole of it.

**Why now.** The content factory exposed four problems in today's Jose
(`docs/governance/DEFERRED_WORK.md`, 2026-10-22):
1. A request can give each agent only **one task** (`buildExecutionPlan()`
   keys tasks by agent).
2. The **order is fixed** for every request (`AGENT_DEPENDENCIES`: Nova, Maria,
   Sentinel and Hector first; Echo last), so Maria checks work before it
   exists.
3. There is **no review-and-revise loop.**
4. **Risk is guessed from words** in the task text (`isExternalRiskAction()`,
   `validateAgentExecutionContract()`), so "nothing is published" was held as
   publishing.

Also, today Jose plans by keyword rules (`decomposeJoseCommand()`), there is no
way to see or change his plan, an interrupted request cannot be resumed (only
single tasks can be replayed from the dead-letter queue), and agent
permissions live in four places that disagree (section 7).

**What success looks like.** Any request, simple or large, gets a sensible
plan the user can see as a map, the right agents do their parts with real
reviews, risky actions always wait for the user (including from Telegram),
nothing is silent, and an interrupted request can be picked up again.

## 2. Goals

1. **Everything goes to Jose** (owner). For a plain question he answers
   directly; a single step, no plan shown, no extra delay beyond his decision.
2. **Plans are graphs**: steps with an agent, a task type, what the step does
   (its effects), what it needs first, and review loops. An agent can have
   several steps in one plan.
3. **Jose plans with a model, checked by rules** (owner: Q19). Rules check
   every plan before it runs: real agents only, task types each agent may do,
   effects declared, limits respected. If the model is unavailable, a
   rule-based plan is used and Jose says so.
4. **Templates are starting points, never required** (owner, 2026-10-23):
   - Jose scores how well each template fits.
   - Below a threshold he **plans fresh** with any agents in any order.
   - A partly fitting template is **adapted** (steps added, removed or
     reordered).
   - "Plan this fresh" skips templates.
   - The map says "Based on template X (adapted)" or "Planned fresh".
   - The user can save a plan as a new template.
   - First templates: Content video (today's content factory), Build an app,
     Research report.
5. **Plan shown first for bigger requests** (owner): 4 or more agents counting
   Jose and Maria, or any step that always asks. A setting decides: Always /
   Bigger requests only (default) / Never. The user can **edit the plan** before
   it runs: remove or add a step, change the agent or the order (owner: Q5).
6. **Jose can change the plan while it runs** (owner: Q6), e.g. add a research
   step when Miya needs facts. A change that adds an always-ask effect is shown
   and needs approval; others appear on the map with a note.
7. **Agents ask each other for help through Jose** (owner: Q7). An agent's
   answer can include "I need X"; Jose adds a step for the right agent. Agents
   never call each other directly.
8. **Review loops** (owner: Q8): when a review step finds problems, the work
   goes back to its author with the findings, **up to 2 rounds**
   (configurable), then Jose asks the user.
9. **Approvals by effect, not by words** (owner: Q10, Q11):
   - Every step declares its effects: `read`, `write_own_work`,
     `change_project`, `run`, `spend`, `publish_or_send`, `delete`.
   - Settings → Approvals has one row per effect, each "always ask" or "don't
     ask".
   - `spend`, `publish_or_send` and `delete` are locked to "always ask".
   - Approval Mode becomes this table.
10. **Approve from Telegram** (owner, 2026-10-23): when something waits, Jose
    notifies on Telegram (first; the phone companion and CALL-E later) and the
    user can approve or decline the plan, or a waiting step, by replying.
    Approval only from the paired owner chat (existing `TELEGRAM_ALLOWED_CHAT_IDS`
    rule).
11. **A live board with the plan as a visual map** (owner: Q13, Q21):
    - Boxes and arrows on the Orchestrator page, for every request: status
      per step, who is working, elapsed time, the model used, waiting
      approvals.
    - A small live card in Chat for requests started there.
    - Some detail, not every token (owner: Q14).
12. **Failures** (owner: Q15): no two agents share a skill, so a failed step
    is not handed to another agent. Jose retries once, then the same agent
    with a larger installed model, then asks the user. A paid model only if
    the user allowed paid models.
13. **Jose chooses the model per step** (owner: Q18), from installed local
    models; paid ones only if allowed. Per-agent settings stay as the default
    and as limits.
14. **Limits** (my decision, owner asked):
    - At most 50 steps per request.
    - 30 minutes for a normal request, 2 hours for a project-type request
      (Jose labels it in the plan).
    - 2 fix rounds per piece of work.
    - Money: zero by default; any spending always asks and shows the expected
      cost; an optional monthly cap in Settings.
15. **Resume** (owner: Q17): at start, Jose lists unfinished requests ("Launch
    video: 3 of 7 steps done — Resume / Cancel"). Built on the existing
    interrupted-task marking and dead-letter queue, extended to whole requests.
16. **Jose never executes** (owner: Q20). Running code and commands is
    Alphonso's (asking first when risky); publishing is Marcus's, after
    approval.

## 3. Non-goals and anti-goals

**Non-goals:**
- Agents talking to each other directly.
- Cloud or multi-machine orchestration.
- Rewriting the simulated Agent Workshop (`src/services/agentWorkshop/`); it
  keeps its own deterministic planner for now and is noted for a later
  reconcile.
- Phone-companion and CALL-E approvals (later; Telegram first).
- Content factory phases 2–4 (after this redesign, recorded in
  `DEFERRED_WORK.md`).

**Anti-goals (failure even if it "works"):**
- A plain question becoming slow or showing a plan.
- A risky step running without approval, or approval decided by keywords.
- Agents gaining power without it being visible in one permission table.
- A plan that silently changes, or silent waits.
- Jose executing anything himself.
- Breaking any of today's callers (Chat, Boardroom, schedules, Telegram,
  WhatsApp, phone companion, workflows, content factory).

## 4. How a request flows

1. **Intake.**
   - Every caller sends `{ text, source, context }` to one entry point.
   - Context includes the conversation for Chat, the thread for Boardroom, and
     the brief and brand for a template like Content video.
2. **Decide.** Jose's model decides "answer directly" or "plan". A direct
   answer streams back as Chat does today, with no plan and no board entry.
   If the model is unavailable, a rule decides (today's `shouldRouteThroughJose`
   becomes this fallback).
3. **Plan.**
   - Jose picks or adapts a template, or plans fresh.
   - The rules check the plan (section 5).
   - It is saved as a **request** with its graph.
4. **Show (bigger requests, or always if set).**
   - The map appears on the board and in the Chat card.
   - The user approves, edits or cancels.
   - If they are away, the plan waits and Telegram is notified.
5. **Run.**
   - Steps whose inputs are ready run; independent ones may run in parallel,
     with one GPU-heavy step at a time.
   - Each step goes to its agent's executor.
   - Effects that need approval wait (board + Telegram).
   - Outputs are stored per step.
6. **Adapt.**
   - Help requests and review findings add or repeat steps (within limits).
   - Every change appears on the map with a reason.
7. **Finish.**
   - Jose writes one combined result (the summary, links to files, what is
     waiting).
   - Echo saves the decisions.
   - Receipts as today.

## 5. The plan (data)

- **Request:**
  - id, source, text, context;
  - `kind` (`direct` | `normal` | `project`);
  - template info (`templateId`, `adapted` | `fresh`);
  - limits;
  - status (`planning`, `waiting_plan_approval`, `running`, `waiting_approval`,
    `done`, `failed`, `interrupted`, `cancelled`);
  - steps;
  - change log;
  - a final result.
- **Step:**
  - `id`, `agent`, `taskType` (must match the agent's allowed task types);
  - `instruction`;
  - `effects` (section 2.9);
  - `needs` (step ids);
  - `reviewOf` (step id) for review steps, and `round`;
  - `model` (chosen by Jose, within limits);
  - status, output, error, timings;
  - an approval record.
- **Rule check, before running and after every change:**
  - every agent exists;
  - every `taskType` is allowed for its agent;
  - every effect is allowed for its agent (section 7);
  - no cycles except review loops, which are capped;
  - steps, time and fix rounds within the limits;
  - a `run` effect only for Alphonso;
  - `publish_or_send` only for Marcus (and connectors he uses);
  - `delete` always needs approval.
  A failing plan is fixed by Jose once, then shown to the user with the reason.

## 6. Packets, approvals and what stays

The existing pieces are kept and reused, not duplicated:
- agent bus packets;
- orchestration receipts;
- the queue and dead-letter queue;
- the shell's approval window;
- `ApprovalPanel`;
- `policyEnforcementService` (connectors);
- `policy_gate.rs` and `assessCommandRisk()` (commands).

What changes:
- A packet carries its step's declared effects.
- `canExecutePacket()` checks effects against the permission table and the
  Approvals settings, instead of keywords.
- Approvals are recorded per step.
- The Telegram reply path approves the same packet, so there is one approval
  record whichever way the user answered.

## 7. Agents: one permission table, and profile fixes

**Today:** permissions live in four places that disagree:
- `src/agents/*/…Permissions.js` — displayed only, never enforced;
- the contracts in `agentContractService` — task types, plus keyword guessing;
- skill-pack rules — no file writes for anyone but Alphonso;
- the command and connector gates.

**New:** one table per agent (task types allowed + effects allowed), enforced
in one place, read by Jose, the contracts check, skill packs and Settings. The
command gate (`policy_gate.rs`) and connector policy stay as the hard
boundaries underneath.

**Writing files** (owner, 2026-10-23):

| Effect | Allowed for | Asks first? |
|---|---|---|
| `read` | everyone | no |
| `write_own_work` = create **new** files inside the request's project folder only; a revision is a new version, never an overwrite; never outside, never delete | Miya, Hector, Maria, Nova, Sentinel, Marcus, Echo, Jose (plans and summaries) | per Settings (default: no) |
| `change_project` = edit/overwrite existing project files, install dependencies | Alphonso; others only with approval | per Settings (default: yes) |
| `run` = code, commands, builds | Alphonso only | per `assessCommandRisk()` and Settings |
| `spend`, `publish_or_send`, `delete` | `publish_or_send`: Marcus; `spend`: whoever calls a paid tool | always |

**Profile fixes** (owner, 2026-10-23, part of this redesign):
- **Marcus:** strengths still list security checklisting and risk detection
  (Sentinel's and Maria's). Make them distribution, publishing and engagement
  only.
- **Maria:** strengths are roadmap and backlog work (Jose's). Make them
  governance, risk, quality review against references, and acceptance
  criteria.
- **Miya:** purpose names only UI/UX. Add content creation (scripts, visuals,
  thumbnails, campaigns) and front-end design and code drafts.
- **Hector and Nova** overlap on competitor analysis. Hector finds facts and
  sources; Nova judges value, priority and timing.
- **Stale labels:** Hector's "research backend may be not wired" (it is),
  runtime labels "Hermes" (Jose) and "OpenFang" (Hector).
- **Sentinel and Maria** both allow `audit_`. Sentinel = security and safety;
  Maria = quality and governance. Task types renamed to make that explicit.
- Every profile is checked against what the agent really does in code. A
  profile is what Jose's planner reads, so it must be accurate.

## 8. The live board

- The **Orchestrator page** gets a "Requests" view: a list of requests, and
  for the selected one its plan as a **box-and-arrow map**:
  - one box per step: agent colour, task, status, elapsed time, model;
  - arrows for "needs";
  - loop arrows for review rounds;
  - badges for waiting approvals;
  - the change log underneath.
  Built with a small graph-layout library chosen in the plan, no heavy
  dependencies.
- **Chat card:** a compact version of the same for a request started in Chat
  (progress line + "Open on the board").
- **Approve, edit and cancel** from both.
- **Telegram:**
  - Notifications for plans and steps that wait, with short codes to reply
    ("/approve 12", "/decline 12", "/plan 12" for a text summary of the plan).
  - Reuses the existing Telegram companion commands.

## 9. Callers move to the new entry point

The new entry point is `submitToJose()`. Callers move one at a time, each with
tests, keeping today's behaviour where the owner did not ask for a change:
- Chat and App's Chat shortcut (everything goes to Jose; direct answers stay
  fast and streamed);
- Boardroom (agent replies are still direct chat; Conclude, Distribute and
  Creative brief become requests);
- schedules;
- Telegram, WhatsApp and the phone companion;
- workflows (agent-chain workflows become requests; the visual workflow
  builder stays as is);
- the batch orchestrator;
- the Orchestrator page;
- the content factory, whose steps become one request from the Content video
  template, with real review loops.

The old `runJoseCommandExecutionPipeline` stays as a thin wrapper during the
move and is removed at the end.

## 10. Phases (each with its own plan and PRs)

1. **Foundation:**
   - request and plan data, the rule check, effects and the single permission
     table;
   - agent profile fixes;
   - Approvals settings;
   - the graph runner (several steps per agent, `needs`, limits), behind the
     existing entry point.
   - No behaviour change for users yet, beyond approvals by effect.
2. **The planner:**
   - direct-or-plan decision; templates (the 3 first ones) with fit scoring
     and adapting; fresh planning with the model; the rule-based fallback;
   - "everything goes to Jose" in Chat.
3. **Seeing and steering:**
   - the live board with the visual map, the Chat card;
   - showing the plan first, editing it, the setting.
4. **Loops and adaptation:**
   - review loops (2 rounds); help requests through Jose; changes while
     running; model escalation on failure.
5. **Away from the app:**
   - Telegram notifications and approvals; resuming requests at start.
6. **Moving the callers:**
   - Boardroom, schedules, WhatsApp, the phone companion, workflows, the batch
     orchestrator;
   - the content factory onto the Content video template;
   - removing the old pipeline.

## 11. Constraints

- Reuse what exists (CLAUDE.md's Do Not Duplicate table): agent bus, receipts,
  queue and dead-letter queue, approval window and panel, policy enforcement,
  `policy_gate.rs`, `assessCommandRisk()`, `generateAgentLlmResponse`, the
  Telegram companion, skill packs, Echo's memory.
- No hardcoded models, paths or risk ratings.
- Every phase keeps the full unit suite and the desktop E2E suite green, and
  adds desktop specs for what it changes (the real app found what mocks
  missed during the content factory).
- Windows first; English only.

## 12. Decided by the owner (2026-10-23)

- Jose = dispatcher + project manager + point of contact.
- Plan shown for bigger requests, optional like the thinking display; a bigger
  request has 4+ agents (Jose and Maria count).
- Plans can be edited; Jose may change plans mid-way.
- Help through Jose.
- Automatic fix rounds.
- Delete, spend, publish and send outside always ask.
- Per-effect approval settings.
- Telegram first for approvals, including approving there.
- Visual map on a live board, with some detail.
- Failures: retry, larger model, then ask.
- Resume asks first.
- Jose chooses models.
- A planning model with rules.
- Jose never executes.
- More agents may write: new files only, inside the project folder.
- Everything goes to Jose.
- Templates as starting points, with fresh planning guaranteed.
- Boardroom chat replies stay direct; only its actions (Conclude, Distribute,
  Creative brief) become Jose requests.
- Agent profiles redesigned as part of this.

## 13. Calls I made (the owner can overrule)

- 2 fix rounds by default; the limits in section 2.14.
- The effect names and the permission table in section 7.
- Help requests and review findings change the plan without asking unless
  they add an always-ask effect.
- Jose's direct-or-plan decision uses his model, falling back to today's rule.
- One GPU-heavy step at a time.
- The Agent Workshop's simulated planner is left as is for now.
- The phase order in section 10.

## 14. Left to the builder

- The storage format for requests (same durable store as today's packets).
- The exact template fit score.
- The graph-layout library and the board's look (using the UI kit).
- Prompt wording for planning.
- The Telegram reply format details.
- Test lists per phase.
