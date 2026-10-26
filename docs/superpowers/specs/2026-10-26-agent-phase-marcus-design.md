# Agent phase 5: Marcus sends what was written, where you said

> **Status (2026-10-26):** built on `feat/agent-phase-marcus` (plan `docs/superpowers/plans/2026-10-26-agent-phase-marcus.md`). Design written with the owner after the Marcus inspection of 2026-10-26 (code reading, a check of his send path against the real code, and four live requests in the real app). Builds on agent phase 3 (Maria: her holds and `mariaReviewFor()`) and agent phase 4 (Sentinel: `addSecurityChecks()` puts a `sentinel-send-<step>` check before every Marcus send).

## Why

Marcus is the only agent who may send or publish (`publish_or_send`). He owns "sending and publishing approved work, and placing calls" and never decides what to say. The content factory's posting (Campaign Studio, his post runner, the Calendar), CALL-E calls and Boardroom's Distribute to Slack work. Everything you ask for in Chat does not:

- **Live, "write an announcement … then post it to our Slack channel #news":** Jose's plan failed his checks, so the simple plan ran. Marcus got a `distribution_readiness` step that ran before the announcement was written, asked for approval, checked nothing, sent nothing, and said "posting still asks for approval". Chat kept showing "Marcus: waiting for your approval" and "No agent report received yet." after the step was approved on the board.
- **Live, "send a Telegram message to my team …":** the same readiness step and nothing else. No text was written.
- **Live, "create a GitHub release v1.2.0 …":** Alphonso got a `local_operation` and answered "Runtime reachable"; Sentinel said "Safe". No release was made, and the reply reads as if it was.
- **Jose's own plans failed on every one of the four requests** (and in the Maria live run). The planner's JSON example has literal placeholders (`"id": "short_id"`, `"kind": "normal"`, `"<agent>"`), and the 7B model copies them ("Step \"short_id\" is for an unknown agent \"none\"", "Marcus may not do \"normal\""), so every request fell back to the simple plan.
- **A send step never knows where to send.** `selectDistributionTarget()` picks the channel from words inside the task type. Both plans give Marcus `distribution_execution`, which names no channel, so he takes the "review" branch: a keyword-scored release-readiness report from `marcusAuditService.js`, reported as "Marcus executed review distribution successfully", `status: executed`, confidence *verified*. Nothing is sent. Checked against the real code on 2026-10-26.
- **Telegram, WhatsApp, Notion, ClickUp and Meta get no text** inside a request: `textToSend()` is used for Slack, GitHub and n8n only, and the others receive the step's `payload` as it is.
- **An approved send fails anyway** when Maria didn't review it: `executeMarcusPublish()` then calls `requireApproval()` from Project Execution's approval store (`alphonso_project_execution_approvals_v1`), which files a second, pending approval that Chat never shows and returns "This action requires explicit supervision."
- **Slack falls back to `#general`** when no channel is given. **GitHub** uses `v<now>` as a tag and an empty owner and repository when none is given.
- **`approvedBy: "maria-governance"`** is recorded on every Marcus record, also when Maria never saw the work.
- **Three paths send with no Jose approval and no Sentinel check:**
  - Project Execution's Marcus panel (`MarcusAuditPanel.tsx`, `preApproved: true` after a tick box) and its "packet only" handoff (`packetExecutionService.ts`, `marcus_publish_handoff`);
  - the "Content Empire" workflow's Publishing task (`executePublishing()` in `workflowExecutionService.js`, reached from the workflow panel's Run and the phone's run_workflow with no approval at all): Telegram by default, the instruction as the text, `preApproved: true`, and "queued (setup may be required)" when it fails while the stage counts as done;
  - scheduled text sends (`runScheduledPublishes()`): sent with `preApproved: false`, so they always fail in the second approval store, the error is swallowed and the item is marked "executed". Nothing creates them any more (`schedulePublish()` has no caller); old ones are still on the Calendar.
- **Discord** is a connector with a `sendMessage()`, but Marcus can't send to it.
- **His profile is partly Maria's**: `generate_audit_report`, `generate_risk_register`, "Review payout/auth/fraud risk model for TapCash", "strict practical risk-first". `engagement_`, `performance_` and `approved_` are in his permission row but no task type uses them.
- **A remote n8n can't be reached**: the window's content policy allows n8n only on this computer.
- **Composio sends without Marcus** (found when the owner asked about it): with Composio switched on, any Alphonso step whose text mentions Slack, email, GitHub, Telegram, Discord, Notion and similar words goes to `executeViaComposio()` in `agentBrainService.js`. A local model (`generateOllamaResponse` directly, not the agent dispatcher) picks a Composio action and it runs at once: no Jose approval, no Sentinel check, no policy gate (`composioService.ts` never calls `evaluatePolicyGate`). It also calls `/v1/actions/…` on the `/api/v3` base. Composio's current API is `https://backend.composio.dev/api/v3.1` with `POST /tools/execute/{tool_slug}` ([Composio SDK usage](https://docs.composio.dev/reference/sdk-reference/typescript/usage.md)), so the calls almost certainly fail today. That is why nothing went out, and fixing the address alone would make it a live send path with no approval. `toolRegistryService.ts` offers the same path as `use_composio_tool`.

## Owner decisions (2026-10-26, multiple choice)

- **Where to send:** Marcus's model reads your request and the written work and picks the channel and recipient from connectors you've set up. The approval shows exactly where and what: "Send to Slack #news: <text>".
- **Allowed destinations:** each connector's default from Settings, plus any channel your request names. Never a made-up one.
- **Approval:** once, with the exact text and destination. Marcus never asks again anywhere else; Sentinel's check still runs before.
- **Channels:** Slack, Telegram, WhatsApp, Discord, GitHub releases and issues, Notion, ClickUp, n8n, with the rules below (the owner asked for suggestions and took them as suggested).
- **Too long for the channel:** sent back. Marcus never shortens anything; the step fails with the limit and the writer makes it fit through Jose's fix loop.
- **Sends that skip Jose today:** each becomes one Marcus step in Jose.
- **Jose's planner placeholders:** fixed in this phase.
- **Short messages in a request** ("tell my team the meeting moved to 3pm"): Alphonso writes it first, kept short, then Sentinel's check, then Marcus sends it. Text you put in quotes is sent exactly as you wrote it.
- **Readiness:** a real, read-only check that asks nothing and sends nothing, and says what's missing.
- **Composio:** one of Marcus's channels. Anything that sends or changes something outside (an email, a Jira ticket, a calendar invite) is a Marcus step: prepared, shown with the exact content, approved once, Sentinel-checked. Read-only actions (search mail, list tickets) become a skill tool any agent may use. Alphonso's automatic path goes. Updated to Composio's current API; only toolkits you switch on.

## Where things go (`src/services/marcus/destinations.ts`)

Each connector's destinations, from Settings → Connectors (non-secret settings saved like `CLICKUP_LIST_ID` is today):

| Connector | What Marcus makes | Default from Settings | Named in your request | Limit |
|---|---|---|---|---|
| Slack | a message | `SLACK_DEFAULT_CHANNEL` (new) | a channel (`#news`) | 40,000 characters |
| Discord | a message | `DISCORD_DEFAULT_CHANNEL_ID` (new), in `DISCORD_GUILD_ID` (new) | a channel by name, looked up in that server | 2,000 |
| Telegram | a message | `TELEGRAM_TEAM_CHAT_ID` (new: "Team chat", a group the bot is in), and you (your paired chat) | "my team" = the team chat, "me" = your chat | 4,096 |
| WhatsApp | a message | your allowed numbers (`WHATSAPP_ALLOWED_NUMBERS`) | a phone number | 4,096 |
| GitHub | a draft release, or an issue | `GITHUB_DEFAULT_REPO` (new, `owner/repo`) | a repository `owner/repo` | release notes 125,000; issue 65,536 |
| Notion | a page | `NOTION_PARENT_PAGE_ID` | — | 2,000 per block, split into blocks by Notion's rules |
| ClickUp | a task | `CLICKUP_LIST_ID` | — | — |
| n8n | a trigger | only your listed workflows (`N8N_WORKFLOWS`, new: one `name: webhook path` per line) | a listed workflow by name | — |

- `destinationsFor(connector)`: the connector's defaults and whether it is set up (its key saved), with a plain "set up" sentence when not ("Slack isn't set up: add the bot token in Settings → Connectors → Slack.").
- `isAllowedTarget(connector, target, request)`: a default, or a target that appears in your request (case and a leading `#` ignored; digits only for a phone number; a GitHub `owner/repo` exactly; an n8n workflow only when it is listed, whatever the request says). Nothing else, so `#general` can never appear from nowhere.
- `CHANNEL_LIMITS`: the limits above.
- Telegram: a bot can only write to chats that have messaged it, or groups it was added to. Without a team chat, "my team" ends with what to set up and nothing is sent.
- WhatsApp: Meta lets a business message someone freely only within 24 hours of their last message; outside that it needs an approved template. When Meta refuses for that reason (its error 131047), Marcus says so in those words instead of reporting it sent.
- GitHub releases are drafts; you publish them on GitHub. A release needs its version in your request (`v1.2.0`); without one it ends with "Say which version to release."

## Composio (`src/services/composioService.ts`, `src/services/marcus/composioChannel.ts`)

- **The API:** `composioService.ts` moves to `https://backend.composio.dev/api/v3.1`: list a toolkit's tools (`GET /tools`), execute one (`POST /tools/execute/{tool_slug}`), with the user from Settings (`userId`). Composio's reference doesn't show every field in the pages read so far (the toolkit filter, how direct execution names the user, the argument field), so the build starts by checking each name against Composio's v3.1 API reference and records what it found in the plan. An HTTP error says Composio's own message.
- **Only toolkits you switch on** (Settings → Composio, `enabledToolkits`) are used; a tool of any other toolkit is refused.
- **Read or send:** `isReadOnlyTool(tool)` is true only when Composio's metadata says the tool only reads, or, without such a hint, when its slug's action is a read verb (`GET`, `LIST`, `FETCH`, `SEARCH`, `FIND`, `READ`). Anything else counts as a send or change. An unknown tool counts as a send.
- **Read-only actions** are a skill tool, `composio_read` (`skillTools.ts`, run by `runSkillTool()`): any agent whose skill lists it may search mail or list tickets, with results fenced as untrusted text like a web page (agent phase 4). It runs through `evaluatePolicyGate()`. Agents that read Composio data: Hector (research), Echo (memory), Alphonso (questions).
- **Sends and changes** are a Marcus destination (`composio` in `destinations.ts`, kind `composio_action`). `pickDestination()` may choose a send tool of a switched-on toolkit, with its arguments built from the written text (the email body, the ticket description) and your request (the recipient, which must appear in your request or be a default you set, like any destination). `prepareMarcusSend()` shows it as "Composio, Gmail: send an email to anna@example.com — “<first 200 characters>”"; `runMarcusSend()` executes exactly that once you approve, with the result Composio gives. The arguments Marcus may fill are the tool's own parameters only; a parameter that would carry content (body, description, message) takes the written text, never text his model wrote.
- **Alphonso's automatic path goes:** `executeViaComposio()` leaves `agentBrainService.js`, and `use_composio_tool` leaves `toolRegistryService.ts`. A test fails when anything outside `marcus/` and the read-only skill tool calls `executeComposioAction()`.

## One Marcus send (`src/services/marcus/`)

### What he sends (`sendText.ts`)

`textToSend(assignment, input)`, in order:
1. the step's `payload.text` (Boardroom, the side paths below);
2. the work of the step he sends from: the latest needed step that is not a review (no `reviewOf`, not Maria, Sentinel or Nova), so the writing and never Sentinel's verdict;
3. text in quotes in your request, when there is exactly one quoted piece.

None → the step fails with "Nothing to send: no earlier step wrote the text." A GitHub release also needs a title: the version and the first line of the notes.

### Where (`pickDestination.ts`)

`pickDestination(request, text, { given? })` → `{ connector, target, kind, title?, reason }`:
- A step that already names its destination (`payload.connector` / `payload.target`, e.g. Boardroom's Slack channel) skips the model; it is still checked with `isAllowedTarget()`.
- Otherwise Marcus's own model (`generateAgentLlmResponse('marcus', …)`, Jose's step model wins) gets your request with keys hidden, the first 500 characters of the text, and each connector that is set up with its defaults and kinds, and answers `{ connector, target, kind, reason }`.
- The answer is checked: the connector is one of Marcus's and set up, the kind is one it makes, `isAllowedTarget()` holds. Unreadable or refused → asked once more with the problem; then the step fails with "Marcus couldn't tell where to send this: name the channel, or set a default in Settings → Connectors."

### Prepared before you approve (`prepareSend.ts`)

A Marcus send step (`publish_or_send`) is prepared when it is ready to run, before it waits for you. The engine calls `prepareMarcusSend()` just before its approval gate:
- the text, the destination and the length check;
- too long for the channel → nothing is asked or sent; the step ends with a `fix` verdict ("Too long for Discord: 2,413 characters; the limit is 2,000.") for the step he sends from, so Jose's fix loop asks the writer to make it fit and Marcus prepares again (at most `JOSE_LIMITS.maxFixRounds` rounds, then a note asking you). Marcus's send steps carry `reviewOf` = the step he sends from for this;
- not set up, or no allowed destination → `setup_required` with the sentence, so the step waits for setup and Carry on runs it again; nothing is asked;
- otherwise the preparation is saved on the request step (`sendPreview`: connector, target, kind, title, text) and the step waits for you with "Send to Slack #news: “<first 200 characters>”" (`describeSend()`). The board, Chat's approval panel and Telegram's waiting message show it (`collectJoseNotifications()` uses it instead of the instruction).

### Sent after you approve (`runSend.ts`)

`runMarcusSend(assignment)` sends exactly the saved preview, without a model call, through the connector with `approved: true`. No second approval anywhere: `executeMarcusPublish()` loses its own `requireApproval()` and is used only by Marcus's steps.

The result says what the platform said:
- "Sent to Slack #news." / "Sent to #news on Discord: <link>" / "Sent to your team chat on Telegram." / "Sent to +1 555… on WhatsApp." / "Draft release v1.2.0 made on owner/repo: <link>. Publish it on GitHub." / "Issue #12 opened on owner/repo: <link>." / "Notion page made: <link>." / "ClickUp task made: <link>." / "Started your n8n workflow Team notes; it answered 200."
- a refusal in plain words with the platform's reason (the WhatsApp 24-hour rule above);
- the record: `{ connector, target, kind, status: sent | failed, link, platformId, approvedBy: 'you', approvedAtMs, reviewedBy: [the Maria and Sentinel steps that reviewed it], sentAtMs }`. *Verified* only when the platform returned an id or ok; never for something not sent.
- one memory item, "Marcus: sent to Slack #news — <first line>", keys hidden.

The keyword audit (`auditProjectPlan()` / `auditReleaseReadiness()` from `marcusAuditService.js`) and the "review distribution" branch leave Marcus. `distribution_review` reviews what would be sent and sends nothing (below).

### Readiness (`readiness.ts`)

`distribution_readiness` (also Maria's "Have Marcus prepare this") is read-only and never asks:
- is there text (`textToSend()`), and was it reviewed (a Maria or Sentinel verdict on it, and not `fix` / `unsafe`);
- where it would go (`pickDestination()`), and is that allowed;
- is the connector set up, and does it answer (`checkConnectorHealth()`, live where the health monitor has a live check);
- the length against the channel.

The answer starts "Ready." or "Not ready:" and lists each point. `distribution_review` is the same check. The rule plan's readiness step stops asking for approval (it set `requiresApproval: true`), and `isRiskyAssignment()` no longer counts every Marcus step as risky.

## Plans that reach Marcus

- **Task types** (`taskTypeMeanings.ts`, `joseEffects.ts`): `distribution_execution` "send what an earlier step wrote; Marcus picks where", `distribution_release` "make a draft GitHub release with notes an earlier step wrote" (new), `distribution_issue` "open a GitHub issue an earlier step wrote" (new), `distribution_review` and `distribution_readiness` "check; sends nothing" (`read`), `distribution_schedule_posts`, `outreach_call`. A connector name in the type (`distribution_slack`) is a hint for `pickDestination()`, as Boardroom uses it.
- **The rule plan** (`decomposeJoseCommand`): a send to a channel (send, post, tell, message, announce, notify, release, open an issue … with a channel or "my team") gets an Alphonso `assistant_write` step (short for a message; release notes for a release) unless your request quotes the text, then Sentinel's send check (`addSecurityChecks()`), then Marcus's step needing them. "Is … ready to post" stays one readiness step. A GitHub release is Marcus's, never an Alphonso `local_operation`.
- **Jose's planner** (`josePlanner.ts`): the JSON example becomes a real two-step plan (Hector researches, Alphonso writes from it) with no placeholders, and the kinds are described in words. A plan that still has copied placeholders (`short_id`, `<agent>`, an agent `none`, a task type `normal`) gets the existing one fix round with the problems named.
- **Routing set** (`routingSet.test.ts`): the four live requests above, with their owners.

## The paths that skipped Jose

`askMarcusToSend({ text, connector?, target?, kind?, title?, source })` (`src/services/marcus/askMarcus.ts`): one Marcus step through `submitStepsToJose()` (`MARCUS_LABEL` "Steps set by <source>."), with `payload`, so it gets the same preparation, approval with the exact text, Sentinel's check and an honest result.
- **Project Execution's Marcus panel:** its Publish button asks Marcus; the tick box and "create packet only" go (the waiting step is the packet). Its old `marcus_publish_handoff` packets go to `askMarcusToSend()` when executed.
- **The Content Empire workflow's Publishing task:** asks Marcus with the workflow's text when it has some; without it the stage says "Nothing to publish: this workflow writes no post. Ask Jose to write and post it." and is not counted as done.
- **Scheduled text sends** (old items only): at their time, `askMarcusToSend()` with their text and platform; the approval is asked then (the app and Telegram, as for every waiting step). The item is marked by what happened, never "executed" before.

A test (`marcusEntryPoints.test.js`, like `joseEntryPoints.test.js`) fails when anything outside `src/services/marcus/` and the content factory's publishing path calls `executeMarcusPublish()` or a connector's send for Marcus.

## Hand-overs

- **Chat** shows the outcome when a step is approved on the board or on Telegram: its result card re-reads the request every 5 s while the request is waiting, and replaces "waiting for your approval" with the closing summary when it ends.
- **Maria:** `mariaReviewFor()` stays; Marcus no longer hard-codes `approvedBy: "maria-governance"`.
- **Sentinel:** his `sentinel-send-<step>` check reviews the step Marcus sends from (or `payload.text`); Marcus needs it, and a hold from it keeps Marcus's step waiting as today.

## Settings

Connectors → each connector's section gets a "Where Marcus sends" field: Slack default channel, Discord server id and default channel id, Telegram team chat, GitHub default repository, n8n workflows (one `name: webhook path` per line). WhatsApp's allowed numbers, Notion's parent page and ClickUp's list already exist and are labelled the same way.

## Smaller fixes

- `marcusProfile.js`: distribution only (releases, release notes, sending, publishing, calls); Maria's audit and risk actions, examples and "risk-first" go. `marcusPermissions.js` likewise (a descriptive vocabulary only).
- Permission row: `engagement_`, `performance_` and `approved_` leave Marcus's `taskTypes` (nothing uses them; Nova owns `analysis_performance`).
- Slack never falls back to `#general`; GitHub never makes up a tag or a repository.
- `selectDistributionTarget()` goes; `pickDestination()` replaces it.

## Tests

- `destinations.test.ts`: defaults per connector, `isAllowedTarget()` (a named `#news` in the request, `#general` not named and not a default, a phone number by digits, an unlisted n8n workflow refused even when named), the limits.
- `sendText.test.ts`: payload text first; the writer's work, never Sentinel's or Maria's verdict; the latest revision after a fix round; one quoted piece; nothing → the sentence.
- `pickDestination.test.ts`: a given destination skips the model; a model answer naming `#general` is refused and asked again; unreadable twice → the sentence; a connector not set up → setup.
- `prepareSend.test.ts`: too long → a `fix` verdict and nothing asked; not set up → `setup_required`; otherwise the preview and "Send to Slack #news: “…”".
- `runSend.test.ts`: sends the saved preview without a model call; no `requireApproval()`; each result sentence; WhatsApp 131047 → the 24-hour sentence; *verified* only with a platform id; the record and the memory item.
- `readiness.test.ts`: "Ready." with each point; "Not ready:" when the text is missing, unreviewed, the connector is not set up or not answering, or too long; never asks.
- The engine: a Marcus send step is prepared before its gate, waits with the preview, and after approval sends once (`joseExecutionEngineService.test.js`); a fix round from a too-long text revises the writer and prepares again (`joseStepGraphPipeline.test.js`).
- `routingSet.test.ts`: the four live requests (write then send to Slack #news; Telegram to my team with an Alphonso writing step; a GitHub release to Marcus, never `local_operation`; "is my post ready" one readiness step that asks nothing).
- `josePlanner.test.ts`: the prompt has no placeholders; a plan with `short_id` is fixed once.
- `askMarcus.test.ts`, `marcusEntryPoints.test.js`, the Content Empire Publishing task, old scheduled sends.
- `composioService.test.ts` and `composioChannel.test.ts`: the v3.1 addresses and fields; a toolkit not switched on is refused; `isReadOnlyTool()` (a hint, a read verb, an unknown tool counts as a send); `composio_read` fenced and gated; a send tool only as a prepared Marcus step whose content comes from the written text; Alphonso no longer reaches Composio.
- `joseTelegram.test.ts`: a waiting send shows its preview.
- Desktop (`e2e-desktop/specs/marcus.e2e.mjs`, isolated profile, nothing sent to a real service): a local test server stands in for n8n (`N8N_BASE_URL` at `127.0.0.1`, one listed workflow); "write a one-line note that the shop opens at 9 and send it to my n8n workflow Team notes" waits with the exact text, is approved on the board, and the server receives that text; Slack with no key ends with what to set up and asks nothing; "is my announcement ready to post on Slack?" answers "Not ready:" and asks nothing; Jose's own plan for one request passes his checks without a copied placeholder.

## Not in this phase

- Live sends to real Slack, Telegram, WhatsApp, Discord, GitHub, Notion and ClickUp accounts (no keys on the dev machine): a by-hand check later, in DEFERRED_WORK.
- A remote n8n (n8n Cloud): the window may reach n8n only on this computer; a backend route is deferred.
- A live Composio check (no Composio key on the dev machine): the v3.1 calls are tested with their requests and answers; a by-hand check with your key later, in DEFERRED_WORK.
- Email (no email connector), WhatsApp templates, Slack permalinks.
- The content factory's posting and CALL-E calls: they already work and are unchanged.
