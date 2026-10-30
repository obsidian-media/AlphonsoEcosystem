# OpenRouter as a model provider: design

Phase 2 of the four phases after QA batch 1 (owner, 2026-10-30: resource manager, OpenRouter, a real MCP server, the Hermes gateway). Decisions marked **(owner)** were made by the owner on 2026-10-30; **(Claude's call)** marks choices left to the builder that the owner can change.

## 1. Why

Alphonso is going public. Many users won't have a graphics card that runs a good local model, and today their cloud options are NVIDIA NIM and Gemini (free) or Claude and ChatGPT (paid, with prices typed in by hand). OpenRouter gives one key that reaches hundreds of models: a set of free ones, and paid ones whose prices come from its own live list.

## 2. Goals

- **Both uses (owner).** Free OpenRouter models as a cloud option for any agent and in Chat, and paid OpenRouter models as a choice for paid steps.
- **Beside the direct connectors, not instead of them (owner, after the live test in 4.1).** NVIDIA, Gemini, Claude and ChatGPT stay as they are; users pick whichever they have a key for. Retiring the direct Gemini, Claude and ChatGPT connectors is reconsidered once users have had OpenRouter for a release. NVIDIA stays direct for good reasons found in the test: OpenRouter serves almost none of NVIDIA's catalogue.
- **Your own keys through OpenRouter (owner).** OpenRouter's "bring your own key" lets a user's Gemini, Anthropic, OpenAI or Mistral key run models through their one OpenRouter key. Alphonso lists those models too, and treats them as paid steps (5.4).
- **No model list built in (owner: "user picks, checked live").** Every list comes from OpenRouter itself.
- **Running out of free requests never leaves a request stuck (owner).**

## 3. Non-goals

- Replacing NVIDIA, Gemini, Claude or ChatGPT.
- Using OpenRouter's price list to fill in Claude's or ChatGPT's prices (owner chose "a third paid choice", not "live prices for all").
- OpenRouter's image, audio or embedding models. Text chat only.
- Hermes profiles (their own phase).

## 4. Facts this design relies on (checked 2026-10-30)

- `GET https://openrouter.ai/api/v1/models` (no key needed): 456 models, each with `id`, `name`, `context_length`, `pricing` (`prompt`, `completion`, USD per token as strings), `supported_parameters`, `expiration_date`. Free models have ids ending `:free` (16 today). There is also a router id `openrouter/free`.
- Free models: 20 requests a minute, and 50 a day for accounts that have bought under $10 of credit in all, 1,000 a day otherwise (openrouter.ai/docs/api-reference/limits).
- `GET /api/v1/key` with the key: `free_model_daily_requests` (`used`, `limit`, `remaining`), `limit_remaining`, `usage_daily`, `is_free_tier`.
- A limit hit is HTTP 429 with `metadata.error_type` `rate_limit_exceeded` (and `X-RateLimit-Reset`); after streaming starts it arrives as an event with `finish_reason: "error"`. A 429 can also come from the model's own provider (`metadata.provider_code`).
- Chat: `POST /api/v1/chat/completions`, OpenAI-compatible, `Authorization: Bearer <key>`. The response's `usage` reports tokens, and OpenRouter can return the request's cost (`usage.cost`) – **confirm live** before relying on it; otherwise cost = tokens × the listed prices.
- The app's CSP already allows `https://openrouter.ai`.

### 4.1 Live test with the owner's keys (2026-10-30)
The owner made an OpenRouter account (workspace restricted to their own keys, so nothing falls back to OpenRouter's paid capacity) and added Anthropic, Google AI Studio, Mistral and NVIDIA keys. Each request was limited to one provider with `provider: { only: [...], allow_fallbacks: false }` and 20 output tokens:
- **Gemini** (`google/gemini-3.5-flash-lite`, Google AI Studio): works. `usage.cost` 0 (OpenRouter charges nothing), `usage.is_byok` true, `usage.cost_details.upstream_inference_cost` 0.0000121 (the provider's list price, whatever the key's own plan is). Did not count toward the free-model daily requests.
- **Mistral** (`mistralai/ministral-8b-2512`): works the same way. Alphonso has no Mistral connector today.
- **NVIDIA**: no model on OpenRouter has an NVIDIA endpoint except the `:free` variants of NVIDIA's own Nemotron models, which ran on the owner's NVIDIA key, and **counted toward the 50 free requests a day**. The NVIDIA catalogue the direct connector reaches (Llama, DeepSeek, …) is not available this way.
- **Anthropic** (`anthropic/claude-haiku-5.5`): refused, `failed_routing_step: "Add BYOK Endpoints"`, although the same key works directly against Anthropic. Something in the OpenRouter key entry; the owner checks it there. Recheck before relying on Claude through OpenRouter.
- `openrouter/free` works (it chose an NVIDIA free model).
- `/api/v1/key` reports `byok_usage` / `byok_usage_daily` (the reported provider cost of own-key requests) beside `free_model_daily_requests`.

## 5. How it works

### 5.1 The connector
- A new connector `openrouter` in `connectorRegistry.js`, key `OPENROUTER_API_KEY` in Settings → Connectors → AI Models, with Test (reads `/api/v1/key` and shows the free requests left today). **Not** in `PAID_OR_METERED_CONNECTORS`: free use passes Zero-Cost Mode; paid use is gated per step (5.4). Risk: same class as NVIDIA and Gemini.
- Every call goes through the backend (a `connector_openrouter_request` command like `connector_nvidia_request`: fixed host, only `models`, `key` and `chat/completions`, the key from Settings or the environment through `secret_or_env`) **(Claude's call)**: it keeps the key out of the window and matches how NVIDIA works since QA batch 1.
- Requests send `HTTP-Referer` / `X-Title` identifying Alphonso (OpenRouter's app attribution) **(Claude's call)**.

### 5.2 Free models for agents and Chat (owner)
- `openrouter` becomes a provider in `modelSelectionService.ts` (agent providers, Chat's `ModelProviderPicker` tab, `getCloudModelList('openrouter')` → the live `:free` list). `generateAgentLlmResponse` gets an `openrouter` branch.
- The picker lists only free models for the free provider, by name, with context size. The chosen model is tested with a short question before first use, like `findWorkingNvidiaModel()`; a model OpenRouter no longer serves (404, or `expiration_date` passed) is skipped with a note "(no longer served)" and remembered.
- A line under the picker: free models are run by other providers, some of which may keep what you send.
- The queue and the resource manager treat `openrouter` as a cloud provider (`CLOUD_PROVIDERS` in `joseQueue.ts`, `CLOUD` in `stepNeeds.ts`): no local turn, no memory.

### 5.3 When the free allowance runs out (owner)
- Setting "When OpenRouter's free limit runs out" (Settings → Agents or Approvals): **Use this computer's model** (default) / **Ask to use a paid model**.
- A free-model call that gets the platform's 429 `rate_limit_exceeded` (not a provider's own 429, which is retried once after `Retry-After`) marks the free allowance used up until `X-RateLimit-Reset` (or midnight UTC when absent) **(Claude's call)**.
- Use this computer's model: the step runs with the agent's Ollama model (`getConfiguredOllamaModel()`), and the step and Chat say "OpenRouter's free limit for today is used up; this step ran on <model> on this computer." Later steps in the request do the same without calling OpenRouter until the reset. If Ollama isn't running or has no chat model, the step waits (`setup_required`) saying so, with Carry on.
- Ask to use a paid model: only when paid models are allowed with OpenRouter as the paid choice and the cap allows it; the step waits for approval like any paid step ("about $X.XX"), then runs on the paid OpenRouter model. Otherwise it behaves as "use this computer's model".
- Settings and the provider tab show free requests left today (from `/api/v1/key`, cached a minute).

### 5.4 Paid OpenRouter models and your own keys (owner: a third paid choice; own-key models are paid steps)
- Settings → Approvals → Allow paid models: provider Claude / ChatGPT / **OpenRouter**. For OpenRouter the model list is OpenRouter's paid models, and the input/output prices are filled from the live list (shown per million tokens, read-only), refreshed when the list is loaded. Claude and ChatGPT keep typed prices.
- Step model id `openrouter:<model>`; `joseSpend.ts`'s `PaidProvider` gains `openrouter`; `paidModelAvailable()`, `estimateCostUsd()`, `canSpend()` and `recordSpend()` work as for the others (cost from OpenRouter's reported cost when available, else tokens × listed prices). The monthly cap is shared. A paid step always asks, as today.
- **Every non-free OpenRouter model is a paid step**, whether OpenRouter charges for it or the user's own key does (owner: "paid, asks first"): Alphonso can't know the plan behind a user's own key, so it always asks, with the estimate from the listed prices. After the call the cost recorded against the monthly cap is `usage.cost` plus, when `usage.is_byok`, `cost_details.upstream_inference_cost`.
- The paid model list is OpenRouter's non-free models, with the ones a user's own keys can serve marked "your key" where OpenRouter says so (`/api/v1/models/<id>/endpoints` and the key's own-key providers, if OpenRouter exposes them; else no mark). **(Claude's call; confirm what the API exposes while building.)**
- Zero-Cost Mode blocks paid OpenRouter models, as it blocks every paid model.

## 6. Anti-goals

- A step silently switching to a paid model.
- Showing a model as usable that OpenRouter no longer serves.
- The key reaching the window, a log or an error message.
- A fixed list of OpenRouter model ids anywhere in the code.

## 7. Checks

- Unit tests: the provider branch, the free list filter, a gone model skipped, the 429 handling both ways (setting on each value), paid cost estimate from listed prices, Zero-Cost Mode blocking paid but not free, queue/resource manager treating it as cloud.
- Rust: the command refuses other paths and hosts; the key never appears in an error.
- Live: the 4.1 test as a by-hand script with the owner's keys (key read from a file, never printed), including Claude once the owner's Anthropic entry is fixed.
- Desktop E2E: the provider tab lists free models from a stand-in server; a by-hand live check with the owner's key (a plain answer from a free model, free requests left shown) added to `live-accounts.e2e.mjs`.

## 8. Left to the builder

Which Settings page holds the free-limit setting; the exact wording of notes; how long the model list is cached; whether `openrouter/free` is offered as "Let OpenRouter choose a free model" (suggested, at the top of the list).
