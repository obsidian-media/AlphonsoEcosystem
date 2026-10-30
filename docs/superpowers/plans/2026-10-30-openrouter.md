# OpenRouter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (Owner, 2026-10-30: executed natively, one task at a time, no subagents.)

**Goal:** OpenRouter as one more model provider: free models for any agent and in Chat, paid and own-key models as paid steps that always ask, and a setting for when the free daily limit runs out.

**Architecture:** One backend command reaches OpenRouter (fixed host, three paths, the key never in the window). A connector module in the app wraps it; the provider joins `modelSelectionService`, the per-agent dispatcher, Chat and the paid-model settings exactly where NVIDIA and Claude/ChatGPT sit today. A small free-limit module decides, after OpenRouter refuses for the day, whether a step runs on this computer's model or fails so Jose's existing paid retry offers a paid OpenRouter model.

**Tech Stack:** Rust (Tauri 2, reqwest), TypeScript/React, Vitest, WebdriverIO desktop E2E.

**Spec:** `docs/superpowers/specs/2026-10-30-openrouter-design.md`

## Global Constraints

- No OpenRouter model id in the code: every list comes from `GET https://openrouter.ai/api/v1/models` (owner).
- Free model = id ending `:free`, plus the router `openrouter/free` shown as "Let OpenRouter choose a free model" at the top.
- Every non-free OpenRouter model is a paid step that always asks, also when the user's own key serves it (owner).
- Recorded cost of an OpenRouter call = `usage.cost` + (`usage.is_byok` ? `usage.cost_details.upstream_inference_cost` : 0); estimate = tokens × listed prices (`pricing.prompt` / `pricing.completion`, USD per token).
- Free limit setting `settings.openRouterFreeLimit`: `'local'` (default, "Use this computer's model") or `'paid'` ("Ask to use a paid model").
- Free OpenRouter models pass Zero-Cost Mode; paid ones don't (`openrouter` is NOT added to `PAID_OR_METERED_CONNECTORS`).
- The key (`OPENROUTER_API_KEY`, connector `openrouter`) never reaches the window, a log or an error message.
- NVIDIA, Gemini, Claude, ChatGPT are unchanged (owner).
- Docs (GROUND_TRUTH, CHANGELOG, CLAUDE.md rows, counts) go in the same commit as the code; LF line endings except files git stores as CRLF.

## Review Focus

- **A key OpenRouter refuses (401/403)** → "OpenRouter refused the key. Check it in Settings → Connectors." and never treated as the free limit. Test in Task 1.
- **A reply with no text** (reasoning models can return empty `content`) → an error "OpenRouter's model returned no text.", not an empty answer. Test in Task 1.
- **The per-minute limit (20 a minute) mistaken for the daily one** → a 429 while `/api/v1/key` still shows free requests left waits once and retries; only `remaining === 0` marks the day used up. Test in Task 4.
- **Free limit used up while Ollama isn't running or has no chat model** → the step waits (`setup_required`) with a plain reason and Carry on, never a silent failure. Test in Task 4.
- **A paid model whose price OpenRouter doesn't list** (missing, negative or non-numeric, e.g. `openrouter/auto`) → not offered as a paid choice, since its cost can't be estimated. Test in Task 5.

---

## Built (2026-10-30)

All six tasks built on `feat/openrouter`, natively, one after another (owner: "go ahead autonomously"). Changes from the plan, each for a reason found while building:
- **Task 1:** the key is passed from the window to the backend, as NVIDIA's is (the window already holds every saved key); it never reaches an error or a log. `openRouterFailure()` returns the failure, since the project's TypeScript settings don't narrow on `ok`.
- **Task 3:** the free-model test asks one model at a time, at most three, at most once a day per model, and never the router, instead of four at once: free requests are scarce (50 a day). A model answering with no text (a thinking model cut short) counts as served.
- **Task 4:** a step's "needs setup" and notes are recorded per agent by `openRouterFreeLimit.ts` and taken by the engine after the step, because executors catch model errors themselves, so an error class would not reach the engine.
- **Task 5:** the paid list uses OpenRouter's `/models/user` (the models this account can use; a fourth backend path), found live: the owner's account allows only its own keys, and 389 of 456 models would have failed. No API names which models own keys serve (`/byok` and `/keys` refuse a normal key), so none is marked. Models answering only in pictures or sound are left out (`textOutput`).
- **Task 6:** the live check is part of the existing Chat test for NVIDIA and Gemini rather than a test of its own.

### Task 1: The backend command and the connector module

**Files:**
- Modify: `src-tauri/src/connector_commands.rs` (beside `nvidia_target` / `connector_nvidia_request`, ~line 1697)
- Modify: `src-tauri/src/lib.rs` (register the command next to `connector_nvidia_request`)
- Create: `src/services/connectors/openRouterConnector.ts`
- Test: `src/test/connectors/openRouterConnector.test.ts`; Rust `#[test]`s in `connector_commands.rs`

**Interfaces:**
- Produces (Rust): `openrouter_target(path: &str) -> Result<(String, bool), String>` (only `models` GET, `key` GET, `chat/completions` POST, under `https://openrouter.ai/api/v1`); `#[tauri::command] connector_openrouter_request(path: String, body: Option<String>, api_key: Option<String>, timeout_secs: Option<u64>) -> Result<OpenRouterHttpResult, String>` with `OpenRouterHttpResult { ok: bool, http_status: Option<u16>, body: Option<String>, error: Option<String>, retry_after_secs: Option<u64>, reset_ms: Option<i64> }` (camelCase serde). Sends `HTTP-Referer: https://github.com/obsidian-media/AlphonsoEcosystem` and `X-Title: Alphonso`. `retry_after_secs` from `Retry-After`, `reset_ms` from `X-RateLimit-Reset`. Key through `secret_or_env(api_key, "OPENROUTER_API_KEY")`; `models` is sent without the key.
- Produces (TS, `openRouterConnector.ts`):
  - `isOpenRouterConfigured(): boolean`
  - `interface OpenRouterModel { id: string; name: string; contextLength: number; promptUsdPerToken: number | null; completionUsdPerToken: number | null; free: boolean; expiresAtMs: number | null }`
  - `listOpenRouterModels(): Promise<OpenRouterModel[]>` (cached 10 min in memory; `free` = id ends `:free` or is `openrouter/free`; a price that is missing, negative or not a number → `null`)
  - `interface OpenRouterKeyInfo { freeUsed: number; freeLimit: number; freeRemaining: number; isFreeTier: boolean }`; `getOpenRouterKeyInfo(): Promise<OpenRouterKeyInfo | null>` (cached 60 s; null when it can't be read)
  - `type OpenRouterSendResult = { ok: true; content: string; model: string; costUsd: number; usage: { promptTokens: number; completionTokens: number } } | { ok: false; kind: 'rate_limited' | 'key_refused' | 'not_served' | 'no_text' | 'failed'; message: string; providerLimited?: boolean; retryAfterSecs?: number; resetMs?: number }`
  - `sendOpenRouterMessage(messages: {role: string; content: string}[], options: { model: string; maxTokens?: number; signal?: AbortSignal }): Promise<OpenRouterSendResult>`
  - `OPENROUTER_KEY_REFUSED = "OpenRouter refused the key. Check it in Settings → Connectors."`, `OPENROUTER_NO_TEXT = "OpenRouter's model returned no text."`

- [ ] **Step 1: Write the failing tests** (`invoke` mocked)
  - `lists free and paid models from the live list`: a body with `a/x:free` (prices "0"), `openrouter/free`, `b/y` (prices "0.000001"/"0.000002"), `openrouter/auto` (prices "-1") → free flags `[true, true, false, false]`, `b/y` prices `1e-6`/`2e-6`, `openrouter/auto` prices `null`.
  - `sends a chat and reports the cost`: 200 with `usage { prompt_tokens: 7, completion_tokens: 4, cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.0000121 } }` → `{ ok: true, costUsd: 0.0000121 }`.
  - `a refused key is not the free limit`: 401 → `{ ok: false, kind: 'key_refused', message: OPENROUTER_KEY_REFUSED }`.
  - `an empty reply is an error`: 200 with `content: ''` → `kind: 'no_text'`, message `OPENROUTER_NO_TEXT`.
  - `a rate limit is told apart from the model's own provider`: 429 with `metadata.error_type: 'rate_limit_exceeded'` → `kind: 'rate_limited'`, `providerLimited: false`, `resetMs` passed through; with `metadata.provider_code` → `providerLimited: true`.
  - `a model no longer served`: 404 (or body message starting "No endpoints found") → `kind: 'not_served'`.
  - `key info`: `/key` body `free_model_daily_requests { used: 4, limit: 50, remaining: 46 }, is_free_tier: false` → `{ freeUsed: 4, freeLimit: 50, freeRemaining: 46, isFreeTier: false }`.
  - Rust: `openrouter_target` accepts the three paths and refuses `models/../key`, `auth/keys`, `https://evil/x`; an error message built from a refused request never contains the passed key.

- [ ] **Step 2: Run them and see them fail**
  Run: `npx vitest run src/test/connectors/openRouterConnector.test.ts` → FAIL (module missing). Rust: `cargo check` from `src-tauri/` (tests run in CI; Smart App Control blocks local test binaries).

- [ ] **Step 3: Implement** the command (copy `connector_nvidia_request`'s shape; read the two headers before the body) and the module (all calls through `invoke('connector_openrouter_request', …)`; outside the desktop app every function returns the failed/empty value).

- [ ] **Step 4: Run the tests and see them pass**; `cargo check`, `cargo clippy -- -D warnings`, `cargo fmt --all -- --check`, `npx tsc --noEmit`.

- [ ] **Step 5: Commit** `feat(openrouter): backend command and connector module`

### Task 2: The connector in Settings, the registry and the Health Monitor

**Files:**
- Modify: `src/services/connectors/connectorRegistry.js` (entry `openrouter` beside `nvidia_nim`, ~line 321; transport `openrouter_api`)
- Modify: `src/services/policyEnforcementService.ts` (risk class like `nvidia_nim`; comment that it is deliberately not paid/metered: paid use is gated per step)
- Modify: `src/components/ConnectorSetupPanel.tsx` (AI Models category: key field `OPENROUTER_API_KEY`, Save, the free requests left today from `getOpenRouterKeyInfo()`, a link to openrouter.ai/settings/keys through `openExternalUrl()`, one line: "Your own Gemini, Anthropic, OpenAI or Mistral keys added in OpenRouter can be used here too; those models count as paid steps.")
- Modify: `src/services/connectorHealthCheckService.ts` (live check: `getOpenRouterKeyInfo()` → "OpenRouter answered: N free requests left today.", `checked: 'live'`)
- Test: `src/test/connectors/openRouterRegistry.test.js`, extend `src/test/ConnectorSetupPanel.test.jsx`

**Interfaces:**
- Consumes: Task 1's `getOpenRouterKeyInfo`, `isOpenRouterConfigured`.
- Produces: connector id `openrouter`, so `isConnectorAuthenticated('openrouter')` works for Task 5.

- [ ] **Step 1: Failing tests**: the registry has `openrouter`; `evaluatePolicyGate` for `openrouter` with Zero-Cost Mode on is allowed; the panel saves `OPENROUTER_API_KEY` through `saveConnectorCredential('openrouter', …)` and shows "46 free requests left today" from a mocked key info; the health check reports `checked: 'live'` with that count, and "No OpenRouter key saved. Add it in Settings → Connectors." without a key.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, see them pass**; `npm run -s generate:dnd-map`, `verify:dnd-map`, `verify:dnd-coverage`, `node scripts/verify-doc-counts.mjs` (connector count 34 → 35 in CLAUDE.md, README, AGENTS.md as the script says).
- [ ] **Step 5: Commit** `feat(openrouter): connector in Settings and the Health Monitor`

### Task 3: Free models for agents and Chat

**Files:**
- Modify: `src/services/modelSelectionService.ts` (`ModelProvider` gains `'openrouter'`, `CLOUD_PROVIDERS`, `VALID_AGENT_PROVIDERS`, the `alphonso` legacy check at line 76, `getCloudModelList('openrouter')`)
- Modify: `src/lib/ollama.ts` (`generateAgentLlmResponse`: an `openrouter` branch beside `nvidia_nim`, ~line 872)
- Modify: `src/services/jose/joseQueue.ts` (`CLOUD_PROVIDERS`), `src/services/resources/stepNeeds.ts` (`CLOUD`)
- Create: `src/services/connectors/openRouterModels.ts`
- Modify: `src/components/ModelSwitcher.tsx` (`ModelProviderPicker` tab "OpenRouter", disabled until configured; `CloudModelPicker` for `openrouter`)
- Modify: `src/components/ChatView.tsx` (provider label, the configured check at ~687/982, the single-shot send at ~1048)
- Test: `src/test/connectors/openRouterModels.test.ts`, extend `modelSelectionService.test.js`, `ModelSwitcher.test.jsx`, `src/test/services/jose/joseQueue.test.ts` (or its current file), `src/test/services/resources/stepNeeds.test.ts`

**Interfaces:**
- Consumes: Task 1's `listOpenRouterModels`, `sendOpenRouterMessage`.
- Produces (`openRouterModels.ts`):
  - `OPENROUTER_CHOOSE_FREE = 'openrouter/free'`
  - `freeModelChoices(models: OpenRouterModel[], nowMs: number): { id: string; label: string; served: boolean }[]` (the router first labelled "Let OpenRouter choose a free model", then free models by name with context size, e.g. "Nemotron 3.5 Lightning (128k)"; expired (`expiresAtMs <= nowMs`) or remembered-gone ones get `served: false` and " (no longer served)")
  - `rememberNotServed(id: string): void`, `openRouterModelsNotServed(): string[]` (key `alphonso_openrouter_models_not_served_v1`, 200 kept)
  - `findWorkingOpenRouterModel(candidates: string[]): Promise<{ model: string | null; skipped: string[] }>` (chosen first, a short test question, `not_served` remembered and skipped, the first that answers wins; at most 4 at once, 20 s each; mirrors `findWorkingNvidiaModel`)
  - `OPENROUTER_FREE_PRIVACY = "Free models are run by other companies through OpenRouter; some may keep what you send."`

- [ ] **Step 1: Failing tests**:
  - `freeModelChoices` puts `openrouter/free` first, excludes paid models, marks an expired model and a remembered one "(no longer served)".
  - `findWorkingOpenRouterModel(['gone:free','ok:free'])` with the first `not_served` → `{ model: 'ok:free', skipped: ['gone:free'] }`, and `'gone:free'` is remembered.
  - `generateAgentLlmResponse('hector', …)` with provider `openrouter`/model `x:free` calls `sendOpenRouterMessage` and returns `{ backend: 'openrouter', model: 'x:free' }`; a `key_refused` result throws `OPENROUTER_KEY_REFUSED`.
  - `usesLocalModel([{ agent: 'hector', … }])` is false when Hector's provider is `openrouter`; `toolsForStep` returns `[]` for it.
  - The picker shows the OpenRouter tab, the privacy line, "46 free requests left today" from a mocked `getOpenRouterKeyInfo()`, and lists only free choices.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** Chat: an `openrouter` result that isn't ok shows its `message`; `rate_limited` shows "OpenRouter's free limit is reached. Try again later, or switch to another provider." (direct Chat doesn't fall back by itself; Jose steps do, Task 4). Claude's call.
- [ ] **Step 4: Run, see them pass**; tsc, eslint on touched files.
- [ ] **Step 5: Commit** `feat(openrouter): free models for agents and Chat`

### Task 4: When the free limit runs out

**Files:**
- Create: `src/services/connectors/openRouterFreeLimit.ts`
- Create: `src/lib/setupNeeded.ts`
- Modify: `src/lib/ollama.ts` (the `openrouter` branch from Task 3 goes through the free-limit decision)
- Modify: `src/services/joseExecutionEngineService.ts` (`executeAssignmentWithRetries` ~line 495: a `SetupNeededError` → `{ resultState: 'setup_required', summary: error.message }`, no retry; after a step, `takeModelNotes(agent)` → `appendRequestNote(requestId, note)` and progress `{ stage: 'model_note', text }`)
- Modify: `src/components/ChatView.tsx` (the live line shows `model_note`)
- Modify: `src/components/SettingsView.tsx` (Approvals, beside `PaidModelsPanel`: "When OpenRouter's free limit runs out" with the two choices)
- Test: `src/test/connectors/openRouterFreeLimit.test.ts`, extend the engine's setup-needed tests

**Interfaces:**
- Consumes: Task 1's `sendOpenRouterMessage`, `getOpenRouterKeyInfo`; `getConfiguredOllamaModel()`, `isChatModel()`; Task 5's `getPaidModelSettings().provider` and `paidModelAvailable()` (Task 4 reads them; until Task 5 lands, `provider === 'openrouter'` is never true, so "paid" behaves as "local").
- Produces:
  - `class SetupNeededError extends Error {}`, `isSetupNeeded(e: unknown): e is SetupNeededError` (`src/lib/setupNeeded.ts`)
  - `getFreeLimitChoice(): 'local' | 'paid'` (`settings.openRouterFreeLimit`, anything else → `'local'`)
  - `freeLimitUsedUntil(nowMs: number): number | null`, `markFreeLimitUsed(untilMs: number): void` (key `alphonso_openrouter_free_limit_v1`; `untilMs` = the result's `resetMs`, else the next midnight UTC)
  - `noteModel(agentId: string, text: string): void`, `takeModelNotes(agentId: string): string[]`
  - `FREE_LIMIT_LOCAL(model: string) = \`OpenRouter's free limit for today is used up; this step ran on ${model} on this computer.\``
  - `FREE_LIMIT_PAID = "OpenRouter's free limit for today is used up. Jose will ask to finish this step with a paid OpenRouter model."`
  - `FREE_LIMIT_NO_LOCAL = "OpenRouter's free limit for today is used up, and no model on this computer can take over. Start Ollama with a chat model, then Carry on."`
- The decision in the dispatcher, for a free OpenRouter model:
  1. If `freeLimitUsedUntil(now)` is set, skip OpenRouter. Otherwise send; on `rate_limited` and not `providerLimited`, read `getOpenRouterKeyInfo()`: `freeRemaining === 0` (or null) → `markFreeLimitUsed(…)`; else wait `min(retryAfterSecs ?? 20, 60)` s once and send again (a second 429 throws "OpenRouter is busy. Try again in a minute."). A provider's own 429 is retried the same way once.
  2. Used up and `getFreeLimitChoice() === 'paid'` and `paidModelAvailable().ok` and the paid provider is `openrouter` → `noteModel(agent, FREE_LIMIT_PAID)` and throw `Error(FREE_LIMIT_PAID)` (the step fails; `adaptPlan()`'s existing paid retry adds `<step>-paid`, which asks with its cost).
  3. Otherwise run the agent's Ollama branch with `getConfiguredOllamaModel()` and `noteModel(agent, FREE_LIMIT_LOCAL(model))`; if Ollama doesn't answer or the model isn't a chat model → throw `SetupNeededError(FREE_LIMIT_NO_LOCAL)`.

- [ ] **Step 1: Failing tests**:
  - `a daily limit switches to this computer's model`: 429, key info `freeRemaining: 0` → Ollama called with the configured model, `takeModelNotes('hector')` = `[FREE_LIMIT_LOCAL('llama3.2:3b')]`, and a second call doesn't call OpenRouter until the reset.
  - `the per-minute limit is not the daily one`: 429 then 200, key info `freeRemaining: 30` → one retry, OpenRouter's answer returned, nothing marked used.
  - `no model on this computer`: used up, Ollama unreachable → throws `SetupNeededError` with `FREE_LIMIT_NO_LOCAL`; the engine turns it into `setup_required` without retrying.
  - `ask for a paid model`: setting `'paid'`, paid models allowed with provider `openrouter` (seeded settings) → throws `FREE_LIMIT_PAID`; same with provider `claude` → runs locally.
  - The reset defaults to the next midnight UTC when `resetMs` is absent.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, see them pass**, plus the engine's and adaptPlan's existing tests.
- [ ] **Step 5: Commit** `feat(openrouter): carry on when the free limit runs out`

Known limit (Claude's call, tell the owner): a schedule run (no paid models) with the "paid" choice fails the step with `FREE_LIMIT_PAID` instead of running locally, because the dispatcher can't see the run's `allowPaidModels`.

### Task 5: Paid OpenRouter models and your own keys

**Files:**
- Modify: `src/services/jose/joseSpend.ts` (`PaidProvider` gains `'openrouter'`, `PROVIDER_NAMES`, `getPaidModelSettings()` accepts it, `paidModelAvailable()` needs a model chosen for it; prices come from the saved settings as for the others)
- Modify: `src/services/jose/stepGraph.ts` (`isPaidModelId`: `/^(claude|chatgpt|openrouter):/`)
- Modify: `src/lib/ollama.ts` (`generatePaidResponse`: an `openrouter` branch; `recordSpendUsd(result.costUsd)` when OpenRouter reported usage, else `recordSpend({ inputTokens, outputTokens })`)
- Modify: `src/components/SettingsView.tsx` (`PaidModelsPanel`: provider Claude / ChatGPT / OpenRouter; for OpenRouter a model list of paid models from `listOpenRouterModels()` with a price, and choosing one saves `inputPerMillionUsd = prompt × 1e6`, `outputPerMillionUsd = completion × 1e6`, shown read-only with "Prices from OpenRouter")
- Create: `src/services/connectors/openRouterPaid.ts`
- Test: extend `src/test/services/jose/joseSpend.test.ts`, `src/test/connectors/openRouterPaid.test.ts`, a SettingsView test for the panel

**Interfaces:**
- Consumes: Task 1's `listOpenRouterModels`, `sendOpenRouterMessage`; Task 2's connector id.
- Produces: `paidModelChoices(models: OpenRouterModel[]): { id: string; label: string; inputPerMillionUsd: number; outputPerMillionUsd: number; yourKey: boolean }[]` (non-free models with both prices known, by name); `yourKey` only if Step 3's live check finds an API field naming the key's own-key providers, otherwise always `false` and no mark is shown.

- [ ] **Step 1: Failing tests**:
  - `paidModelChoices` leaves out free models and `openrouter/auto` (prices `null`), and gives `b/y` 1 and 2 per million.
  - `paidModelAvailable()` with provider `openrouter`, a model and prices, Zero-Cost Mode off, connector set up → ok; Zero-Cost Mode on → "Zero-Cost Mode is on."
  - `isPaidModelId('openrouter:b/y')` → true; `checkPlan` lets a step with that model spend.
  - `generatePaidResponse('openrouter:b/y')` records the reported `costUsd` against the month.
  - The panel: choosing OpenRouter and a model saves both prices from the list.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.** First check live (by-hand script, key read from the file, nothing printed) whether `/api/v1/key` or another key-scoped endpoint names the own-key providers; record the answer in the spec's §4.1 and implement `yourKey` only if it does.
- [ ] **Step 4: Run, see them pass**, plus Task 4's tests (the "paid" path now reachable).
- [ ] **Step 5: Commit** `feat(openrouter): paid OpenRouter models and your own keys`

### Task 6: Live check, desktop check and docs

**Files:**
- Modify: `e2e-desktop/specs/live-accounts.e2e.mjs` (skipped without `ALPHONSO_LIVE_OPENROUTER_KEY_FILE`: the key typed into Connectors, the free requests left shown, a plain question answered in Chat on the OpenRouter tab with "Let OpenRouter choose a free model")
- Create: `e2e-desktop/specs/openrouter.e2e.mjs` (no key: the OpenRouter tab is disabled and Settings says what to set up; the picker's list comes from a local stand-in server only if the command can be pointed at one in debug builds, otherwise this spec checks only the no-key behaviour) **(Claude's call)**
- Modify docs: `docs/ALPHONSO_GROUND_TRUTH.md` (new §), `docs/CHANGELOG.md`, `CLAUDE.md` (connector count and list, a "OpenRouter" row in Do Not Duplicate, the E2E description and counts), `docs/governance/DEFERRED_WORK.md` (OpenRouter done; Claude through OpenRouter to be rechecked once the owner fixes the key entry; MCP server next), the plan's "Built" notes

- [ ] **Step 1:** Write the two specs.
- [ ] **Step 2:** Run the live check by hand against a CI-built debug app (`alphonso-debug-app-<sha>`) with the owner's key file; count key traces in its log (must be 0).
- [ ] **Step 3:** Update the docs; `node scripts/verify-doc-counts.mjs`, `verify:dnd-map`, `verify:dnd-coverage`.
- [ ] **Step 4:** Commit `test(openrouter): live and desktop checks; docs`, push `feat/openrouter`, open the PR, merge when the required checks pass (Test & Build, Rust Tests & Clippy, Secrets Scan, Doc Count Freshness, gate, Playwright).
