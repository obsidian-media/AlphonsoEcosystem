# Free-Tier Cloud AI Providers (NVIDIA NIM + Gemini) — Implementation Plan

**Status:** Ready for implementation
**Author:** Claude Code (planning pass), 2026-07-23
**Scope:** App-wide (not Coach-Mode-specific — see `docs/superpowers/plans/2026-07-23-alphonso-session-coach.md` §11 for how Coach Mode's optional narrative layer can consume this as one of several callers, once this plan lands)

---

## 0. Why this exists

Alphonso is local-first (Ollama) by default, with 3 existing paid cloud LLM connectors (Claude, ChatGPT, DeepSeek) all correctly gated behind Zero-Cost Mode (blocked by default, `PAID_OR_METERED_CONNECTORS` in `policyEnforcementService.ts`). NVIDIA NIM (`build.nvidia.com`) and Google Gemini (AI Studio) both offer genuinely rate-limited **free tiers** — not trials, not credits that run out and start billing, but ongoing free access gated by requests-per-minute/day, not by a card on file. NVIDIA's free tier alone exposes 70-80+ hosted models (Llama, Mistral, Nemotron, and others) through one OpenAI-compatible endpoint.

**The idea, and why it's worth building:** these can be added as connectors that stay inside Zero-Cost Mode's default-on "free" classification — not paid, not blocked — giving Alphonso real cloud model diversity and, more importantly, **a working fallback for users who never install Ollama at all**. That's a genuine onboarding win: right now, a user without a GPU or without Ollama installed hits `OllamaOfflineBanner.jsx` and is stuck until they set up local infra. A free-tier cloud provider removes that hard blocker.

### The mechanism already exists — verified, not assumed

`policyEnforcementService.ts`'s Zero-Cost Mode gate (`evaluatePolicyGate`) checks connector IDs against a flat `Set<string>` called `PAID_OR_METERED_CONNECTORS` (currently: `chatgpt`, `claude`, `qwen`, `whatsapp`, and others — checked directly in code). **A connector not in that set is already allowed through Zero-Cost Mode by default.** No new cost-tier field, no architectural change to the gate itself is needed — the only requirement is: *do not add NVIDIA NIM or Gemini's connector ids to `PAID_OR_METERED_CONNECTORS`*, and document clearly why, so nobody "fixes" that omission later thinking it's a bug.

### The real risk (be honest about this, don't just ship it silently)

"Free tier" is a *provider policy*, not a *guarantee Alphonso controls*. Two concrete risks:
1. **Rate limits, not infinite use.** Both providers cap requests/tokens per minute/day on their free tier. Calls will get `429`s under normal heavy use, not just abuse. This needs graceful handling (see §3), not just an error toast.
2. **Provider policy can change.** NVIDIA or Google could tighten or remove the free tier at any time — Alphonso has no control over that and no way to detect it in advance. Do not hardcode a permanent assumption that these are "safe forever." Ship a clear UI disclosure (§5) so this is the user's informed choice, not a silent default they didn't know about.

There's also a **privacy distinction worth surfacing, not hiding**: "zero-cost" and "local" are not the same thing. A free NVIDIA/Gemini call still leaves the user's machine and goes to a third-party cloud API, unlike Ollama. Zero-Cost Mode's current UI framing may read as "safe/local" to a user who hasn't thought about the difference — §5 requires this to be stated explicitly, not implied.

---

## 1. Non-goals

- Not replacing Ollama as the default/recommended path — this is an *additional* option, surfaced clearly as "free cloud" not "the new default."
- Not adding NVIDIA's or Google's *paid/metered* tiers (Vertex AI billing, NIM's enterprise/metered endpoints) — free-tier endpoints only, in this plan. A paid-tier version of either provider is a different connector with different gating and is out of scope here.
- Not silently upgrading a user's existing free-tier key to paid behavior if they add billing on the provider's side later — Alphonso has no way to know that happened; the UI disclosure in §5 covers this by being honest about the limitation.
- Not building a generic "add any OpenAI-compatible endpoint" system in this pass — two concrete connectors (NVIDIA NIM, Gemini), each with a real credential UI, matching the existing per-connector pattern (`deepseekConnector.ts`, `tavilyConnector.ts`, etc.) rather than a generalized abstraction. If a 3rd/4th free-tier provider shows up later, that's when generalizing becomes worth it — not preemptively.

---

## 2. Connectors to build

Both mirror `src/services/connectors/deepseekConnector.ts`'s existing shape exactly — same file structure, same `isXConfigured()`/`sendXMessage()` pattern, same `getConnectorCredential`/`evaluatePolicyGate` usage. Do not invent a new connector shape.

### 2.1 `src/services/connectors/nvidiaNimConnector.ts`
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions` — OpenAI-compatible, Bearer auth (verified against `SESSIONGUARD/_repo_clone/engines/live_coach_engine.py`'s working `_nvidia_coach()` implementation — same shape, different domain, safe to reference as a working example of the exact request/response format).
- Credential: `NVIDIA_API_KEY` (matches SessionGuard's own env var name — reasonable to keep consistent since it's the provider's own key, not something Alphonso invents).
- `isNvidiaConfigured()`, `sendNvidiaMessage(messages, { model, maxTokens, temperature })`, and — since this provider's whole value proposition is 70-80+ models — `listNvidiaModels()` (NVIDIA exposes a models-list endpoint on the same base; confirm the exact path during implementation, don't guess it into the plan).
- Default model: pick one sensible default (e.g. a Llama or Nemotron instruct model) rather than requiring the user choose from 70+ options before anything works.

### 2.2 `src/services/connectors/geminiConnector.ts`
- Endpoint: Google AI Studio's Gemini API (`generativelanguage.googleapis.com`), free-tier key from `aistudio.google.com` — **not** the Vertex AI billing endpoint, that's a different product with different (paid) terms; this distinction matters and should be called out in code comments so nobody "upgrades" this connector to Vertex AI later without realizing that changes the cost model.
- Credential: `GEMINI_API_KEY`.
- `isGeminiConfigured()`, `sendGeminiMessage(messages, options)`.
- Default model: a current free-tier-eligible Gemini model (verify which models are actually free-tier-eligible at implementation time — Google's free-tier model list is narrower than their full catalog and does shift; don't hardcode an assumption that every Gemini model is free).

### 2.3 Registry + credential UI (both connectors)
- Add both to `DEFAULT_CONNECTORS` in `src/services/connectors/connectorRegistry.js`, following the exact shape of existing entries (`id`, `name`, `status`, `transport`, `requiredEnv`, `permissions`, `disabledReason`).
- Add credential fields to `ConnectorSetupPanel.tsx`'s `CredentialSection` list, matching the DeepSeek/Tavily/Perplexity pattern exactly (label, placeholder, hint text pointing at where to get a free key — `build.nvidia.com` and `aistudio.google.com` respectively).
- Add real health checks to `connectorHealthCheckService.ts` (the file just extended in this same repo to cover the previously-unwired connectors — follow that exact pattern: a lightweight, side-effect-free reachability/credential check, not a full generation call).

---

## 3. Zero-Cost Mode wiring — the one-line change that matters most

In `src/services/policyEnforcementService.ts`, **do not add `nvidia_nim` or `gemini` to `PAID_OR_METERED_CONNECTORS`.** That omission is the entire mechanism that keeps them zero-cost by default — it's already correct by doing nothing extra, but it needs to be *documented*, not just silently correct, so a future pass doesn't "fix" it by adding them to the paid set out of caution without knowing why they were left out. Add a comment directly above `PAID_OR_METERED_CONNECTORS`'s declaration:

```ts
// nvidia_nim and gemini are intentionally NOT in this set — both are
// genuinely free-tier (rate-limited, not billed on overage) as of
// 2026-07-23. See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md
// before adding them here or removing them from here.
```

### Rate-limit handling (real requirement, not optional polish)

A `429` from either provider must not surface as a raw error to the calling agent/UI. Both `sendNvidiaMessage`/`sendGeminiMessage` should:
1. Detect a rate-limit response distinctly from other failures.
2. Return a typed result (`{ ok: false, rateLimited: true, ... }`) rather than throwing generically — so callers can distinguish "this provider is temporarily saturated" from "this call failed."
3. Wherever these connectors are used as part of a fallback chain (Hector's tiered search fallback is the existing precedent — Tavily → Perplexity → DeepSeek — follow that exact pattern), a rate-limited free-tier provider should fall through to the next option (another free-tier provider, or local Ollama) rather than dead-ending the request.

---

## 4. Model diversity — surfacing NIM's 70-80 models

`src/services/modelSelectionService.ts` already has `getModelList(endpoint)` (currently Ollama-only, calling `/api/tags`) and per-task model overrides (`setTaskModelOverride`, `getModelForTask`). Extend this, don't replace it:

- `getModelList()` should accept a provider argument (or a second function, `getNvidiaModelList()`) rather than assuming Ollama's endpoint shape for a fundamentally different provider's catalog.
- `ModelSwitcher.jsx`'s `OllamaModelPicker` (per `CLAUDE.md`'s existing description) should either gain a provider tab/section, or a sibling `CloudModelPicker` component should be added — check the existing component before deciding; do not duplicate the whole picker UI if adding a provider dimension to the existing one is cleaner.
- Given 70-80 models is a lot to dump in a flat list, group/filter sensibly (by size class, or a curated "recommended" subset up top) rather than an unfiltered dropdown — a raw 80-item list is a UX regression, not a feature.

---

## 5. Required disclosure — do not skip this

Per §0's honesty requirement: anywhere a user enables NVIDIA NIM or Gemini (credential save in `ConnectorSetupPanel.tsx`, and ideally a first-use tooltip/banner), show copy along these lines — adapt wording, keep the substance:

> "This connector uses {Provider}'s free tier. Requests leave your machine and go to {Provider}'s cloud — this is not local like Ollama. Free tier is rate-limited and set by {Provider}, not guaranteed by Alphonso; if their policy changes, this may stop working or start requiring billing on their side."

This is not legal boilerplate — it's the honest tradeoff a user should see before flipping Zero-Cost Mode's implicit "this is safe" framing onto a cloud call. Keep it short, but keep the two real facts: (1) leaves the machine, (2) free tier is provider-controlled, not Alphonso-guaranteed.

---

## 6. Onboarding integration (optional but high-value — scope as a follow-up sub-task, not blocking)

`OnboardingWizard.tsx`'s Ollama-check step currently only offers "install/start Ollama." Once this plan lands, that step could offer a third path: "Skip Ollama, use a free NVIDIA/Gemini key instead" — directly addressing the onboarding friction named in §0. This is real product value but touches an already-complex onboarding flow (per `CLAUDE.md`'s own description: 6 steps, several with inline guides already) — treat as its own small follow-up PR after the connectors themselves are stable, not bundled into the same PR as §2-§5.

---

## 7. File-by-file task list

| File | Change |
|---|---|
| `src/services/connectors/nvidiaNimConnector.ts` | **New** — §2.1 |
| `src/services/connectors/geminiConnector.ts` | **New** — §2.2 |
| `src/services/connectors/connectorRegistry.js` | Add both to `DEFAULT_CONNECTORS` |
| `src/components/ConnectorSetupPanel.tsx` | Credential UI for both |
| `src/services/connectorHealthCheckService.ts` | Health checks for both, following the pattern already used for github/slack/discord/etc. |
| `src/services/policyEnforcementService.ts` | Documented non-inclusion in `PAID_OR_METERED_CONNECTORS` (§3) — comment only, no logic change |
| `src/services/modelSelectionService.ts` | Provider-aware model listing (§4) |
| `src/components/ModelSwitcher.jsx` | Cloud model picker UI (§4) |
| `docs/ALPHONSO_GROUND_TRUTH.md` / `CLAUDE.md` | Update connector count (22 → 24) and add both to the "Do Not Duplicate" table once built |
| `src/test/connectors/nvidiaNimConnector.test.js`, `geminiConnector.test.js` | **New** — mirror `deepseekConnector.test.js`'s test shape |

---

## 8. Testing & merge requirements (repo standard)

- `npm run test` on new/touched test files, no regressions.
- `npx tsc --noEmit` and `npm run lint` clean.
- A test proving a connector NOT in `PAID_OR_METERED_CONNECTORS` passes Zero-Cost Mode's gate by default (regression-guard for §3 — this is the one behavior this whole plan depends on staying correct).
- A test proving a simulated `429` response is handled as `rateLimited: true`, not a generic thrown error.
- Branch protection on `main` requires PR + green CI (Test & Build, Rust Tests & Clippy, Secrets Scan, Doc Count Freshness) — same flow as every other change in this repo, no exceptions.
- Update `node scripts/verify-doc-counts.mjs`-tracked docs (connector count) in the same PR, not a follow-up.

---

## 9. Explicit boundaries

- Free-tier endpoints only — no Vertex AI, no NVIDIA metered/enterprise tier, in this plan.
- Do not add either connector id to `PAID_OR_METERED_CONNECTORS`.
- Do not skip the §5 disclosure copy — this is a user-trust requirement, not optional polish.
- Do not build the onboarding integration (§6) in the same PR as the core connectors — separate follow-up.
- This plan is independent of, but designed to compose with, `docs/superpowers/plans/2026-07-23-alphonso-session-coach.md` §11 (the optional Ollama-narrative layer for Coach Mode) — once both exist, Coach Mode's Phase 4 could offer NVIDIA NIM as a cloud alternative to local Ollama, but that wiring belongs in the Coach Mode plan's own Phase 4 PR, not here.
