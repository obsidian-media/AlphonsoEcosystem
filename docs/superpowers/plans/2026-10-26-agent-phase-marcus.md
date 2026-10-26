# Agent phase 5 (Marcus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcus sends exactly what an earlier step wrote to a destination you set or named, after one approval that shows both, through every connector he owns, and every other send path goes through him.

**Architecture:** A new `src/services/marcus/` folder holds destinations, text, destination picking, preparation, sending and readiness. The engine prepares a Marcus send step just before its approval gate and saves a preview, which the approval, the board and Telegram show; after approval the step sends that preview once. Composio becomes one of his channels; the side paths and Alphonso's Composio path route to one Marcus step.

**Tech Stack:** TypeScript, React, Vitest, WebdriverIO desktop E2E (tauri-driver), Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-26-agent-phase-marcus-design.md`

## Global Constraints

- Marcus never writes or shortens what is sent; text comes from `payload.text`, the step he sends from, or one quoted piece of your request.
- A destination is a connector default from Settings, or a target that appears in your request outside quoted text; never invented (no `#general` fallback, no `v<now>` tag, no empty repository).
- One approval per send, showing the exact text and destination; no `requireApproval()` from `approval/approvalService.js` anywhere on Marcus's path.
- Too long for the channel → the step ends with a `fix` verdict for the step he sends from; nothing is asked or sent.
- Limits: Slack 40,000; Discord 2,000; Telegram 4,096; WhatsApp 4,096; GitHub release notes 125,000, issue 65,536 characters.
- GitHub releases are drafts; a release needs its version in your request.
- n8n: only workflows listed in `N8N_WORKFLOWS` (`name: webhook path`, one per line); the window reaches n8n only on this computer.
- *Verified* only when the platform returned an id or ok.
- Composio base `https://backend.composio.dev/api/v3.1`; only switched-on toolkits; an unknown tool counts as a send.
- Plain words on every screen and message; no em dashes in new copy where a colon or full stop works; docs change in the same commits as the code; doc counts stay fresh.
- No files deleted without the owner's approval (R14): remove functions, keep files.
- Keep each file's own line endings (`joseExecutionEngineService.ts`, `joseExecutionEngineService.test.js`, `joseStepGraphPipeline.test.js` are CRLF).

## Review Focus

- **Two channels named** ("post it to Slack #news and Discord #general"): one Marcus step per channel, each prepared and approved on its own (Task 8 test `two channels → two Marcus steps`).
- **A target only inside quoted text or the written work** ("post: 'everyone join #general'") is not "named": `isAllowedTarget()` reads the request without its quoted content (Task 2 test `a channel only in quotes is not named`).
- **Instagram, Facebook or YouTube asked from Chat**: nothing sent; "Marcus posts to Instagram, Facebook and YouTube from Miya Studio's Campaign Studio." (Task 3 test).
- **A revised text after a too-long round** has no Sentinel review of its own: preparation runs `findExactRisks(text, { links: 'sent' })` and adds high facts to the approval line (Task 4 test `exact checks on the final text`).
- **Approved twice, or carried on after the app closed mid-send**: the saved preview is sent once; a second run says "Already sent." (Task 5 test `sends once`).

---

### Task 1: Jose's planner without placeholders

**Files:**
- Modify: `src/services/jose/josePlanner.ts:60` (the "Answer with JSON only" line)
- Test: `src/test/services/jose/josePlanner.test.ts`

**Interfaces:**
- Produces: `PLAN_EXAMPLE` (exported string) and `copiedPlaceholders(steps: Array<{ id?: string; agent?: string; taskType?: string }>): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it('the prompt has no placeholders a small model can copy', () => {
  const prompt = plannerPromptForTests('Research bees and write a post');
  for (const p of ['short_id', '<agent>', '<task type>', '<step id>', '"normal" or']) expect(prompt).not.toContain(p);
  expect(prompt).toContain(PLAN_EXAMPLE);
});
it('names copied placeholders so the fix round can say so', () => {
  expect(copiedPlaceholders([{ id: 'short_id', agent: 'none', taskType: 'normal' }]))
    .toEqual(['Step id "short_id" is the example\'s placeholder: use your own ids.', 'Agent "none" is not one of the agents.', 'Task type "normal" is not a task type.']);
});
it('a plan with short_id ids is fixed once and then used', async () => { /* model mock: first answer with short_id steps, second a valid plan */ /* expect two calls, plan.source !== 'rules' */ });
```

- [ ] **Step 2: Run them**: `npx vitest run src/test/services/jose/josePlanner.test.ts` → FAIL (`PLAN_EXAMPLE` not exported).
- [ ] **Step 3: Implement.** `PLAN_EXAMPLE` is a real two-step plan: `{"basedOnTemplate": null, "kind": "normal", "steps": [{"id": "research", "agent": "hector", "taskType": "research_web", "instruction": "Find three facts about honeybees with sources.", "effects": ["read"], "needs": []}, {"id": "write", "agent": "alphonso", "taskType": "assistant_write", "instruction": "Write a short post from the research.", "effects": ["write_own_work"], "needs": ["research"]}]}`, followed by one sentence each for `kind` ("project" for building an app, else "normal"), `model` and `reviewOf` (optional). `copiedPlaceholders()` problems are added to the problems the one fix round already lists. Export `plannerPromptForTests()` only if no existing export builds the prompt.
- [ ] **Step 4: Run them** → PASS.
- [ ] **Step 5: Commit** `fix(jose): a real example plan, so the small model stops copying placeholders`.

### Task 2: Where Marcus may send

**Files:**
- Create: `src/services/marcus/types.ts`, `src/services/marcus/destinations.ts`
- Modify: `src/components/ConnectorSetupPanel.tsx` (a "Where Marcus sends" field in the Slack, Discord, Telegram, GitHub and n8n sections; the existing WhatsApp numbers, Notion parent page and ClickUp list fields get the same label)
- Test: `src/test/services/marcus/destinations.test.ts`, `src/test/ConnectorSetupPanel.test.jsx`

**Interfaces:**
- Produces (`types.ts`): `MarcusConnector = 'slack' | 'discord' | 'telegram' | 'whatsapp' | 'github' | 'notion' | 'clickup' | 'n8n' | 'composio'`; `SendKind = 'message' | 'release' | 'issue' | 'page' | 'task' | 'trigger' | 'composio_action'`; `Destination { connector; target; kind; title?; label; composio?: { toolkit: string; tool: string; args: Record<string, unknown> } }`; `SendPreview extends Destination { text: string; sourceStepId: string | null; preparedAtMs: number; exactFacts?: string[] }`; `PrepareResult = { ok: true; preview: SendPreview } | { ok: false; outcome: 'fix' | 'setup' | 'failed'; reason: string; sourceStepId?: string | null }`; `SendResult { ok: boolean; sentence: string; link?: string | null; platformId?: string | null }`.
- Produces (`destinations.ts`): `DESTINATION_KEYS` (`slack: SLACK_DEFAULT_CHANNEL`; `discord: DISCORD_GUILD_ID, DISCORD_DEFAULT_CHANNEL_ID`; `telegram: TELEGRAM_TEAM_CHAT_ID`; `whatsapp: WHATSAPP_ALLOWED_NUMBERS`; `github: GITHUB_DEFAULT_REPO`; `notion: NOTION_PARENT_PAGE_ID`; `clickup: CLICKUP_LIST_ID`; `n8n: N8N_WORKFLOWS`), `CHANNEL_LIMITS: Record<string, number>` keyed `connector:kind`, `destinationsFor(connector): { setUp: boolean; setUpSentence: string | null; defaults: string[]; kinds: SendKind[] }`, `listedN8nWorkflows(): Array<{ name: string; path: string }>`, `requestWithoutQuotes(request): string`, `isAllowedTarget(connector, target, request): boolean`, `targetLabel(d: Destination): string`.

- [ ] **Step 1: Write the failing tests**

```ts
it('a channel named in the request is allowed; #general neither named nor a default is not', () => {
  expect(isAllowedTarget('slack', '#news', 'post it to our Slack channel #news')).toBe(true);
  expect(isAllowedTarget('slack', 'news', 'post it to our Slack channel #news')).toBe(true);
  expect(isAllowedTarget('slack', '#general', 'post it to our Slack channel #news')).toBe(false);
});
it('a channel only in quotes is not named', () => {
  expect(isAllowedTarget('slack', '#general', 'post this to Slack: "everyone join #general"')).toBe(false);
});
it('a default from Settings is allowed', () => { /* credential SLACK_DEFAULT_CHANNEL = #team → isAllowedTarget('slack', '#team', 'tell the team') true */ });
it('a phone number matches by digits', () => { expect(isAllowedTarget('whatsapp', '+1 (555) 010-2030', 'message 15550102030 on WhatsApp')).toBe(true); });
it('an n8n workflow must be listed, whatever the request says', () => { /* N8N_WORKFLOWS "Team notes: team-notes" → 'Team notes' true; 'Payroll' named in request false */ });
it('limits', () => { expect(CHANNEL_LIMITS['discord:message']).toBe(2000); expect(CHANNEL_LIMITS['telegram:message']).toBe(4096); expect(CHANNEL_LIMITS['github:release']).toBe(125000); });
it('not set up says what to add', () => { expect(destinationsFor('slack').setUpSentence).toBe("Slack isn't set up: add the bot token in Settings → Connectors → Slack."); });
it('labels', () => { /* targetLabel → "Slack #news", "Discord #news", "your team chat on Telegram", "you on Telegram", "WhatsApp +15550102030", "GitHub owner/repo", "n8n workflow Team notes" */ });
```

- [ ] **Step 2: Run** `npx vitest run src/test/services/marcus/destinations.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Settings values through `getConnectorCredential(connector, key)`; "set up" = the connector's key present (`SLACK_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `GITHUB_TOKEN`, `NOTION_API_KEY`, `CLICKUP_API_KEY`, `N8N_BASE_URL`, Composio's key via `isComposioEnabled()`). Telegram targets are `team` (the team chat) and `me` (`getOwnerChatId()` exported from `telegramCompanionService.js`); "my team" in the request names `team`, "me" names `me`. Matching ignores case and a leading `#`; GitHub `owner/repo` exact. `requestWithoutQuotes()` reuses the router's quoted-content stripping (export `withoutQuotedContent` from `joseCommandRouterService.ts`). Settings fields save with `saveConnectorCredential()` like `CLICKUP_LIST_ID`; the n8n field is a textarea with the placeholder `Team notes: team-notes`.
- [ ] **Step 4: Run** destinations and `ConnectorSetupPanel.test.jsx` (a test that the Slack section shows "Where Marcus sends" and saves `SLACK_DEFAULT_CHANNEL`) → PASS.
- [ ] **Step 5: Commit** `feat(marcus): where he may send, and the defaults in Settings`.

### Task 3: What he sends and where it goes

**Files:**
- Create: `src/services/marcus/sendText.ts`, `src/services/marcus/pickDestination.ts`
- Test: `src/test/services/marcus/sendText.test.ts`, `src/test/services/marcus/pickDestination.test.ts`

**Interfaces:**
- Consumes: Task 2's types, `isAllowedTarget()`, `destinationsFor()`; `StepInput` (`stepInput.ts`); `generateAgentLlmResponse('marcus', …)`; `parseJsonResponse`.
- Produces: `textToSend(assignment, input): { text: string; sourceStepId: string | null } | null`; `NOTHING_TO_SEND = 'Nothing to send: no earlier step wrote the text.'`; `pickDestination(request: string, text: string, opts: { given?: Partial<Destination>; hint?: MarcusConnector }): Promise<{ ok: true; destination: Destination } | { ok: false; outcome: 'setup' | 'failed'; reason: string }>`; `NO_DESTINATION = "Marcus couldn't tell where to send this: name the channel, or set a default in Settings → Connectors."`; `CAMPAIGN_STUDIO_ONLY = "Marcus posts to Instagram, Facebook and YouTube from Miya Studio's Campaign Studio."`; `hintFromTaskType(actionType): MarcusConnector | undefined`.

- [ ] **Step 1: Write the failing tests**

```ts
// sendText
it('payload text first', …);                      // { payload: { text: 'Hi' } } → { text: 'Hi', sourceStepId: null }
it("the writer's work, never Sentinel's or Maria's verdict", …); // needs: sentinel-send-write (Safe.), write ('Open Saturday.') → write
it('the latest revision after a fix round', …);   // needs write-fix-1 and write → write-fix-1
it('one quoted piece of the request', …);          // request 'tell my team "meeting at 3pm"' → 'meeting at 3pm'
it('nothing → null', …);
// pickDestination
it('a given destination skips the model and is still checked', …);   // given { connector: 'slack', target: '#news' } → no model call
it('a model answer naming #general is refused and asked again', …);    // first #general, second #news → #news, two calls
it('unreadable twice → NO_DESTINATION', …);
it('a connector that is not set up → setup with its sentence', …);
it('Instagram asked from Chat → CAMPAIGN_STUDIO_ONLY', …);
it('the hint from the task type', () => { expect(hintFromTaskType('distribution_slack')).toBe('slack'); expect(hintFromTaskType('distribution_execution')).toBeUndefined(); });
```

- [ ] **Step 2: Run both files** → FAIL (modules missing).
- [ ] **Step 3: Implement.** The step he sends from: the needed steps in reverse order, skipping agents `maria`, `sentinel`, `nova` and any step with `reviewOf`; take its `main || text`. Quoted text: exactly one `"…"` or `“…”` piece in `input.request`. The model prompt: Marcus's skill line ("You choose where to send; you never change what is said."), the request with keys hidden (`redactText`), the first 500 characters of the text, and for each set-up connector its kinds and defaults; answer `{ "connector", "target", "kind", "title", "reason" }`; one retry naming the problem (`"#general" was not named and is not a default.`). Release kind needs a version `v?\d+(\.\d+)*` from the request (else `failed: 'Say which version to release.'`); the title is that version.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(marcus): the text he sends and where, picked by his model`.

### Task 4: Prepared before you approve

**Files:**
- Create: `src/services/marcus/prepareSend.ts`
- Modify: `src/services/jose/joseRequestStore.ts` (request step type: optional `sendPreview?: SendPreview`)
- Test: `src/test/services/marcus/prepareSend.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3; `findExactRisks`, `exactRiskText` (`sentinel/exactChecks.ts`).
- Produces: `isMarcusSendStep(assignment): boolean` (agent `marcus` and effects include `publish_or_send`, not `outreach_call`, not a content step); `prepareMarcusSend(commandId: string, assignment, request: { text: string } | null): Promise<PrepareResult>`; `describeSend(preview: SendPreview): string`; `tooLongReason(label: string, length: number, limit: number): string` = `Too long for ${label}: ${n} characters; the limit is ${limit}.` (numbers with thousands separators).

- [ ] **Step 1: Write the failing tests**

```ts
it('too long → fix for the step he sends from, nothing asked', …); // 2,413 chars to Discord → { ok:false, outcome:'fix', reason:'Too long for Discord #news: 2,413 characters; the limit is 2,000.', sourceStepId:'write' }
it('not set up → setup', …);
it('nothing to send → failed with NOTHING_TO_SEND', …);
it('otherwise the preview and the approval line', …); // describeSend → 'Send to Slack #news: “Open Saturday.”'
it('the approval line keeps 200 characters', …);
it('other kinds', …); // 'Make a draft release v1.2.0 on GitHub owner/repo: “…”', 'Open an issue on GitHub owner/repo: “…”', 'Make a Notion page: “…”', 'Make a ClickUp task: “…”', 'Start your n8n workflow Team notes with: “…”', 'Composio, Gmail: send an email to anna@example.com: “…”'
it('exact checks on the final text', …); // text with a password request → preview.exactFacts non-empty and describeSend ends with ' Sentinel\'s checks found: It asks for a password or payment details.'
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with the step's `payload` as `given` and `hintFromTaskType(assignment.actionType)` as the hint. Limit key `connector:kind`; Composio has no limit.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(marcus): prepare a send before it asks you`.

### Task 5: Sent after you approve

**Files:**
- Create: `src/services/marcus/runSend.ts`
- Modify: `src/services/marcusPublishService.ts` (remove `requireMarcusApproval()` and the `preApproved` parameter's approval branch; `executeMarcusPublish()` keeps dispatching Telegram, WhatsApp, Notion, ClickUp and Meta for `runSend.ts` only)
- Test: `src/test/services/marcus/runSend.test.ts`, `src/test/marcusPublishService.test.*` (update the approval cases)

**Interfaces:**
- Consumes: `SendPreview`; `slackConnector.sendMessage`, `discordConnector.sendMessage` / `listGuildChannels`, `githubConnector.createRelease` (draft `true`) / `createIssue`, `sendTelegramConnectorMessage`, `sendWhatsAppConnectorMessage`, `sendNotionConnectorEntry`, `sendClickUpConnectorTask`, `triggerN8nWebhook`. The `composio` branch is added in Task 9 (`executeComposioTool()`); until then a Composio preview fails with "Composio sending isn't ready yet."
- Produces: `runMarcusSend(commandId: string, stepId: string, preview: SendPreview): Promise<SendResult>`; `WHATSAPP_24H = "WhatsApp only lets you message someone within 24 hours of their last message to you; outside that it needs an approved template."`; `ALREADY_SENT = 'Already sent.'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('sends the saved preview without a model call', …);   // generateAgentLlmResponse not called
it('never asks a second approval', …);                    // requireApproval (approvalService) not called
it('each result sentence', …); // 'Sent to Slack #news.', 'Sent to Discord #news: https://discord.com/channels/G/C/M', 'Sent to your team chat on Telegram.', 'Sent to WhatsApp +15550102030.', 'Draft release v1.2.0 made on GitHub owner/repo: https://github.com/owner/repo/releases. Publish it on GitHub.', 'Issue #12 opened on GitHub owner/repo: https://github.com/owner/repo/issues/12.', 'Notion page made.', 'ClickUp task made.', 'Started your n8n workflow Team notes; it answered 200.'
it('WhatsApp error 131047 → the 24-hour sentence', …);
it('a refusal says the platform\'s reason', …);           // Slack 'channel_not_found' → 'Not sent to Slack #news: channel_not_found.'
it('sends once', …);                                      // second call for the same step → { ok:false, sentence: ALREADY_SENT }, connector called once
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** A Discord channel named (not an id) is looked up with `listGuildChannels({ botToken }, DISCORD_GUILD_ID)` by name. Telegram `team` → `TELEGRAM_TEAM_CHAT_ID`, `me` → the owner chat. The once-only guard: `sentAtMs` saved on the request step (`updateJoseStep`) before the connector call; a step that already has it returns `ALREADY_SENT`. Connector functions that take `options` get `{ approved: true, commandId }`. A link is used only where the platform returned an id.
- [ ] **Step 4: Run** runSend and the updated publish-service tests → PASS.
- [ ] **Step 5: Commit** `feat(marcus): send exactly what you approved, once, and say what the platform said`.

### Task 6: His step, readiness and the record

**Files:**
- Create: `src/services/marcus/readiness.ts`
- Modify: `src/services/marcusExecutionService.ts` (`runMarcusDistribution()` becomes the dispatcher; remove `selectDistributionTarget()`, `executeMarcusGitHubAction()`, `executeMarcusSlackAction()`, `executeMarcusN8nAction()`, the "review" branch and the `marcusAuditService` import; `buildMarcusExecutionRecord()` becomes `marcusRecord()`)
- Test: `src/test/services/marcus/readiness.test.ts`, `src/test/marcusExecutionService.test.*`

**Interfaces:**
- Consumes: Tasks 3–5; `mariaReviewFor()`; `checkConnectorHealth()`.
- Produces: `checkReadiness(commandId, assignment, input): Promise<{ ready: boolean; text: string }>` (text starts `Ready.` or `Not ready:` then one line per point); `runMarcusDistribution(commandText, assignment, priorOutputs, options)` returning `{ summary, resultState, resultUrl, artifacts, sources, contractAction, schema }` where `schema = { kind: 'send', connector, target, sendKind, status: 'sent' | 'failed' | 'checked', link, platformId, approvedBy: 'you', approvedAtMs, reviewedBy: string[], sentAtMs, confidenceLevel, reviewVerdict: 'pass' }`.

- [ ] **Step 1: Write the failing tests**

```ts
// readiness
it('Ready. with each point', …);        // text, reviewed (Sentinel Safe), Slack #news allowed, Slack answers, within the limit
it('Not ready: missing text / unreviewed / not set up / not answering / too long', …);
it('never asks and sends nothing', …);
// dispatcher
it('distribution_readiness and distribution_review run the check, read only', …);
it('a send step runs the saved preview', …);      // assignment with sendPreview on its request step → runMarcusSend called with it
it('no preview → prepares, then sends (callers outside the gate)', …);
it('the record: approvedBy you, reviewedBy the Maria and Sentinel steps, verified only when sent', …);
it('one memory item, keys hidden', …);            // title 'Marcus: sent to Slack #news — Open Saturday.'
it('no keyword audit', () => { /* marcusAuditService.auditProjectPlan / auditReleaseReadiness not called */ });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Content-factory publishing (`distribution_schedule_posts`) and `outreach_call` keep their own executors (dispatched earlier in the engine). The summary is `SendResult.sentence`, prefixed with "Maria reviewed it." / "Sentinel checked it." when they did.
- [ ] **Step 4: Run** marcus tests and `npx vitest run src/test/services/maria src/test/services/sentinel` → PASS.
- [ ] **Step 5: Commit** `feat(marcus): his step sends the approved preview, and readiness is a real check`.

### Task 7: The engine prepares before the gate

**Files:**
- Modify: `src/services/joseExecutionEngineService.ts` (the effect gate near "A step whose effects need the user's approval waits for it"; `isRiskyAssignment()`), `src/services/sentinel/addSecurityChecks.ts` (a Marcus send step gets `reviewOf` = the step he sends from), `src/services/jose/joseTelegram.ts` (a waiting step with `sendPreview` uses `describeSend()`)
- Test: `src/test/joseExecutionEngineService.test.js`, `src/test/services/jose/joseStepGraphPipeline.test.js`, `src/test/services/sentinel/addSecurityChecks.test.ts`, `src/test/services/jose/joseTelegram.test.ts`

**Interfaces:**
- Consumes: `isMarcusSendStep()`, `prepareMarcusSend()`, `describeSend()`.
- Produces: request steps with `sendPreview`; packets waiting with `policyReason` and `commandPreview` = `Waiting for your approval: ${describeSend(preview)}`.

- [ ] **Step 1: Write the failing tests**

```js
it('a Marcus send step is prepared before its gate and waits with the preview', …); // request step sendPreview set; packet policyReason 'Waiting for your approval: Send to Slack #news: “Open Saturday.”'
it('after approval it sends once', …);                 // resume → runMarcusSend once
it('nothing to send ends the step failed without asking', …);
it('not set up → setup_needed without asking', …);
it('too long → a fix round revises the writer and prepares again', …); // joseStepGraphPipeline: write-fix-1 and marcus-r1 added; marcus-r1 waits with the shorter text
it('a readiness step never waits', …);
// addSecurityChecks
it('a Marcus send step reviews the step he sends from', …);   // marcus.reviewOf === 'write'
// joseTelegram
it('a waiting send shows its preview', …);
```

- [ ] **Step 2: Run** the four files → FAIL.
- [ ] **Step 3: Implement.** Before the effect gate, for `isMarcusSendStep(assignment)` with no `sendPreview` on its request step: `prepareMarcusSend(command.id, assignment, getJoseRequest(joseRequestId))`. `ok` → save the preview (`updateJoseStep`, also as the step's `note`) and wait as today with the line above. Not ok, recorded right there (the bus refuses an unapproved publish step, so it must not run): `setup` like the existing `setup_required` branch (packet `queued` with `failureReason`, receipt `setup_needed`, `onProgress('setup_needed')`); `failed` like the `not_run` branch (packet `failed`, receipt `failed` with the reason); `fix` writes the step output `{ summary: reason, resultState: 'completed', schema: { kind: 'send', reviewVerdict: 'fix', findings: [reason] } }` with `setAgentOutput` + `setStepOutput`, packet `executed`, receipt `executed`, `executedCount += 1`. `isRiskyAssignment()` no longer returns true for every Marcus step (only the action-word test). Keep the file's CRLF endings.
- [ ] **Step 4: Run** the four files, then `npx vitest run src/test/services/jose src/test/joseExecutionEngineService.test.js src/test/josePipelineE2E.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(jose): Marcus's send is prepared before it asks, and the approval shows it`.

### Task 8: Plans that reach Marcus

**Files:**
- Modify: `src/services/jose/taskTypeMeanings.ts`, `src/services/jose/joseEffects.ts` (`distribution_release`, `distribution_issue` → `publish_or_send`; `distribution_review` → `read`), `src/services/jose/agentPermissionTable.ts` (Marcus `taskTypes`: drop `approved_`, `engagement_`, `performance_`), `src/services/joseCommandRouterService.ts` (`parseJoseCommand` / `decomposeJoseCommand`), `voice/backend/agent_roles.py` only if the owns/never sentences change (they don't)
- Test: `src/test/services/jose/routingSet.test.ts`, `src/test/services/jose/agentOwnership.test.ts`, `src/test/services/jose/taskTypeMeanings.test.*`

**Interfaces:**
- Produces: intent `sendTo: Array<MarcusConnector>` (the channels named, in order) on `ParsedJoseCommand.intents`; Marcus steps `marcus`, `marcus-2`, … with `actionType` `distribution_execution` (or `distribution_release` / `distribution_issue`), `payload: { connector }`, `needs: ['write']`, `requiresApproval` unset; the writing step `write` (`assistant_write`) unless the request quotes the text.

- [ ] **Step 1: Write the failing tests** (routing set entries)

```ts
['/jose Write a two-sentence announcement that our bakery opens on Saturday, then post it to our Slack channel #news.', ['alphonso:assistant_write', 'marcus:distribution_execution']],
['/jose Send a Telegram message to my team saying the meeting moved to 3pm.', ['alphonso:assistant_write', 'marcus:distribution_execution']],
['/jose Tell my team on Telegram "meeting moved to 3pm"', ['marcus:distribution_execution']],
['/jose Create a GitHub release v1.2.0 for my repo with the notes: fixed the login bug.', ['alphonso:assistant_write', 'marcus:distribution_release']],
['/jose Is my new post ready to publish on Instagram?', ['marcus:distribution_readiness']],
it('two channels → two Marcus steps', …); // 'Write a note that we open at 9 and post it to Slack #news and Discord #updates' → marcus (payload.connector slack), marcus-2 (discord), both need write
it('a readiness step asks nothing', …);   // requiresApproval falsy, effects ['read']
it('the menu explains distribution_execution', () => { expect(TASK_TYPE_MEANINGS.distribution_execution).toBe('send what an earlier step wrote; Marcus picks where'); });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Channel words: slack, discord, telegram, whatsapp, notion, clickup, n8n, github, "my team", a `#channel`; send words: send, post, tell, message, announce, notify, share, publish, release, "open an issue", "create an issue". `CONTENT_AFTER` also cuts after "notes:" and "message:". A release or issue request is never `localExecution`. Readiness ("ready", "can I post") stays the one readiness step, `requiresApproval: false`. The old `distributionExecution` intent (schedule, engage) keeps its step but as `distribution_execution` with `needs` like the rest.
- [ ] **Step 4: Run** the routing set, ownership and meanings tests → PASS.
- [ ] **Step 5: Commit** `fix(jose): a send gets its text written first, and a release is Marcus's`.

### Task 9: Composio as Marcus's channel

**Files:**
- Modify: `src/services/composioService.ts`, `src/services/agentBrainService.js` (remove the Composio block), `src/services/toolRegistryService.ts` (remove `use_composio_tool`), `src/services/skills/skillTools.ts`, `src/services/skills/skillToolRun.ts`
- Create: `src/services/marcus/composioChannel.ts`
- Test: `src/test/services/composioService.test.*`, `src/test/services/marcus/composioChannel.test.ts`, `src/test/services/skills/skillToolRun.test.*`

**Interfaces:**
- Produces: `COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1'`; `listToolkitTools(toolkit): Promise<{ tools: ComposioTool[]; error: string | null }>`; `executeComposioTool(tool: string, args: Record<string, unknown>): Promise<ComposioActionResult>` (replaces `executeComposioAction`); `isReadOnlyTool(tool: ComposioTool): boolean`; skill tool `composio_read` (`{ toolkit, tool, args }` → fenced text); `composioSendTools(): Promise<ComposioTool[]>` (switched-on toolkits, not read-only); destination `composio` used by `pickDestination()` and `runMarcusSend()`.

- [ ] **Step 1: Check the API.** Read Composio's v3.1 API reference for listing tools of a toolkit, executing a tool (how the user and the arguments are named in the body) and any read-only metadata; record each name in the ledger as a ruling with the page it came from. Expected: the field names for Step 2.
- [ ] **Step 2: Write the failing tests**

```ts
it('v3.1 addresses and fields', …);                 // fetch called with `${BASE}/tools/execute/GMAIL_SEND_EMAIL` and the checked body
it('a toolkit not switched on is refused', …);
it('read or send', () => { expect(isReadOnlyTool({ name: 'GMAIL_FETCH_EMAILS' } as any)).toBe(true); expect(isReadOnlyTool({ name: 'GMAIL_SEND_EMAIL' } as any)).toBe(false); expect(isReadOnlyTool({ name: 'SOMETHING' } as any)).toBe(false); });
it('composio_read runs only read-only tools, gated and fenced', …);
it('a send tool is only a prepared Marcus step whose content comes from the written text', …);
it('Alphonso no longer reaches Composio', …);       // agentBrainService has no executeViaComposio import
```

- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** Read verbs: `GET`, `LIST`, `FETCH`, `SEARCH`, `FIND`, `READ` as the slug's action word, unless metadata says otherwise. Every call through `evaluatePolicyGate({ connectorId: 'composio', … })`. `pickDestination()` offers send tools of switched-on toolkits (name and description, at most 20); content parameters (`body`, `description`, `message`, `text`, `content`) take the written text, never the model's; a recipient must pass `isAllowedTarget('composio', …)` (named in the request). HTTP errors keep Composio's own message.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(marcus): Composio sends through Marcus; read-only actions are a tool`.

### Task 10: The paths that skipped Jose

**Files:**
- Create: `src/services/marcus/askMarcus.ts`
- Modify: `src/components/audit/MarcusAuditPanel.tsx`, `src/services/packetExecutionService.ts`, `src/services/workflowExecutionService.js` (`executePublishing`), `src/services/marcusExecutionService.ts` (`runScheduledPublishes` text items; status `'asked'` added to `ScheduledPublish`)
- Test: `src/test/services/marcus/askMarcus.test.ts`, `src/test/marcusEntryPoints.test.js`, the existing tests of the four files

**Interfaces:**
- Produces: `askMarcusToSend({ text, connector?, target?, kind?, title?, source }): Promise<{ ok: boolean; requestId?: string; reason?: string }>` (one Marcus `distribution_execution` step, `payload: { text, connector, target, kind, title }`, through `submitStepsToJose()` with label `MARCUS_LABEL(source)` = `Steps set by ${source}.`); `NOTHING_TO_PUBLISH = 'Nothing to publish: this workflow writes no post. Ask Jose to write and post it.'`.

- [ ] **Step 1: Write the failing tests**

```js
it('the Marcus panel asks Marcus; no tick box, no packet-only', …);
it('an old marcus_publish_handoff packet goes to askMarcusToSend', …);
it('Content Empire Publishing: with text asks Marcus; without, NOTHING_TO_PUBLISH and not done', …);
it('an old scheduled text send asks Marcus at its time and is marked asked', …);
it('nothing outside marcus/ sends for Marcus', () => { /* read src: executeMarcusPublish( and executeComposioTool( only in services/marcus/, marcusPublishService.ts, composioService.ts, skills/skillToolRun.ts */ });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** each caller with `askMarcusToSend()` (sources: "Project Execution", "Content Empire", "Marcus's schedule"). The panel shows the reply ("Waiting for your approval on the board.") with Open on the board when it has a request id.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(marcus): every other send path is one Marcus step`.

### Task 11: Chat shows the outcome; Marcus's profile

**Files:**
- Create: `src/components/jose/JoseRequestOutcome.tsx`
- Modify: `src/components/ChatView.tsx` (render it under a message with `joseRequestId`), `src/agents/marcus/marcusProfile.js`, `src/agents/marcus/marcusPermissions.js`
- Test: `src/test/components/joseRequestOutcome.test.jsx`, `src/test/agents*` (profile)

**Interfaces:**
- Produces: `JoseRequestOutcome({ requestId, statusWhenAnswered })`: while the request is waiting it re-reads it every 5 s; when it ends (`done`, `failed`, `cancelled`, `expired`), it shows "Now: " + `closingSummary(request)` (`data-testid="chat-request-outcome"`).

- [ ] **Step 1: Write the failing tests**

```jsx
it('shows the closing summary once a waiting request ends elsewhere', …); // fake timers: waiting → done; 'Now: Marcus: Sent to Slack #news.'
it('shows nothing for a request that was already finished', …);
it('Marcus does distribution only', () => { expect(MARCUS_PROFILE.allowedActions).not.toContain('generate_audit_report'); expect(JSON.stringify(MARCUS_PROFILE)).not.toMatch(/risk-first|fraud risk/i); });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Profile: title kept; strengths releases, release notes, sending messages, publishing approved posts, placing calls; allowed actions the send kinds; examples the four live requests; personality "careful, exact, never changes the words".
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(marcus): Chat shows what happened after you approve; his profile is his own`.

### Task 12: Desktop check, docs, full suite

**Files:**
- Create: `e2e-desktop/specs/marcus.e2e.mjs`
- Modify: `CLAUDE.md` (rows: Marcus distribution runtime, Marcus's sends (new), Composio toolkit toggles, Jose's planner, connector credential UI, desktop suite counts), `docs/ALPHONSO_GROUND_TRUTH.md` (§11.45, with corrections to older Marcus claims), `docs/AGENT_GUIDE.md`, `docs/USER_MANUAL.md` (a "Ask Marcus to send" section; the `publish` / `upload` / `distribute` command rows), `docs/CHANGELOG.md`, `docs/governance/DEFERRED_WORK.md` (live sends by hand, remote n8n, live Composio), the spec's status line, `README.md` / `AGENTS.md` / `ARCHITECTURE.md` counts, `docs/DO_NOT_DUPLICATE.generated.md`

- [ ] **Step 1: Write the spec.** A local `http.createServer` in the test process on a free port stands in for n8n; Settings → Connectors → n8n gets `N8N_BASE_URL` = `http://127.0.0.1:<port>` and `N8N_WORKFLOWS` = `Team notes: team-notes` through the fields (as `research.e2e.mjs` types the Tavily key). Checks: (1) "Write a one-line note that the shop opens at 9 and send it to my n8n workflow Team notes" waits with "Start your n8n workflow Team notes with: “…”", is approved on the board, and the server receives exactly the previewed text once; (2) "post a short note that we open at 9 to Slack #news" with no Slack key ends with "Slack isn't set up: add the bot token in Settings → Connectors → Slack." and no approval was asked; (3) "Is my announcement ready to post on Slack?" answers "Not ready:" and asks nothing; (4) one request planned by Jose's model (`Plan this fresh: research two facts about tea and write a line about them`) has a plan note without "short_id" and a source other than the simple plan.
- [ ] **Step 2: Build and run it**: `npm run tauri build -- --debug --no-bundle`, then `ALPHONSO_E2E_EDGEDRIVER=D:/AgentDevWork/tools/msedgedriver-155.0.4283.62/msedgedriver.exe npx wdio run e2e-desktop/wdio.conf.mjs --spec e2e-desktop/specs/marcus.e2e.mjs` → 4 passing. Then rerun `sentinel.e2e.mjs` and `maria.e2e.mjs` (with the Tavily key) → passing.
- [ ] **Step 3: Docs** as listed, then `node scripts/verify-doc-counts.mjs`, `npm run generate:dnd-map`, `npm run verify:dnd-map`, `npm run verify:dnd-coverage` → all fresh.
- [ ] **Step 4: Full checks**: `npm test` (all pass), `npx tsc --noEmit -p .`, `npm run lint`.
- [ ] **Step 5: Commit** `docs: agent phase 5 (Marcus); desktop check for Marcus`.
