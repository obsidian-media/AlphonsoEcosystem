# Phone phase 4 test round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find out, on the owner's iPhone and this computer, whether the iPhone's own model, free cloud models from the phone, and waking the computer work well enough, and hand the owner a written report to choose from.

**Architecture:** Throwaway code on `spike/phone-phase4` (branched from `feat/mobile-phase4`, pushed so CI can build it, never merged): one shared question set built from the agents' real prompts, a scorer, a desktop baseline run against llama3.2:3b, a hidden "Phase 4 test" screen in a TestFlight build that runs the same set on the iPhone's model and on free cloud models, and read-only checks plus an owner checklist for waking. Only the report is kept, on `feat/mobile-phase4`.

**Tech Stack:** TypeScript/React (shared `src/mobile`), Capacitor 8 (`CapacitorHttp` from `@capacitor/core`), Swift with Apple's `FoundationModels` (iOS 26, Xcode 26 on CI), Vitest, local Ollama.

**Spec:** `docs/superpowers/specs/2026-11-02-alphonso-mobile-phase4-design.md` (approved 2026-11-02).

## Global Constraints

- Test code lives only on `spike/phone-phase4`; nothing from it is merged. The report is the only thing kept.
- Agents in the test: Jose (answer-or-plan), Alphonso (answers and everyday writing), Echo (recall). Their prompts come from the real code, never copied text.
- Quality bar: "as good as the desktop's starter model": the same questions to the iPhone model and to `STARTER_MODEL_TAG` (llama3.2:3b) on the computer.
- Cloud from the phone: free models only (OpenRouter's free models, NVIDIA NIM and Gemini free tiers), a free key typed on the phone and kept in the phone's keychain. No model id written in the code: each provider's live list decides.
- A key never appears in results, logs, the report, or anything sent off the phone.
- The app's iOS minimum stays 16.4; Apple's model is checked at run time (iOS 26+, Apple Intelligence on).
- Devices: the owner's iPhone 15 Pro or newer; this computer (S3 sleep, Wi-Fi only, Intel AC 3168) and the Rogers Ignite gateway at 10.0.0.1. Android: documentation only, marked "untested on a real Android phone".
- Nothing on this computer's power or network settings is changed without asking the owner first; sleep and wake tests are run by the owner by hand.

## Review Focus

- Apple's model not available (not eligible, Apple Intelligence off, model still downloading): the screen says which, the cloud part still runs.
- A prompt longer than Apple's model's context window: that question is recorded as failed with the reason, the run goes on.
- A free limit hit (HTTP 429) or a refused key: recorded once with the reason, no retry loop, the other providers still run.
- The results JSON never contains a key, even in an error message from a provider.
- Copying results when the clipboard is refused: the text box with the JSON is still there to select by hand.

---

### Task 1: Spike branch, the question set and the scorer

**Files:**
- Modify: `src/services/jose/joseDecision.ts` (export the decision prompt builder)
- Create: `src/mobile/spike/phase4Questions.ts`
- Create: `src/mobile/spike/phase4Score.ts`
- Test: `src/test/spike/phase4Score.test.ts`

**Interfaces:**
- Produces:
  - `joseDecisionPrompt(text: string, history?: { role: string; content: string }[]): string` in `joseDecision.ts`; `decideJoseRoute()` uses it (no change in behavior).
  - `type SpikeAgent = 'jose' | 'alphonso' | 'echo'`
  - `interface SpikeQuestion { id: string; agent: SpikeAgent; system: string; prompt: string; expect: { route?: 'direct' | 'plan'; contains?: string[]; mentionsJose?: boolean } }`
  - `PHASE4_QUESTIONS: SpikeQuestion[]`
  - `interface SpikeAnswer { questionId: string; engine: string; model: string; text: string | null; ms: number; error: string | null; network?: 'wifi' | 'cellular' | 'none' }`
  - `scoreAnswer(q: SpikeQuestion, a: SpikeAnswer): { pass: boolean; why: string }`
  - `summarize(answers: SpikeAnswer[]): Record<string, Record<SpikeAgent, { passed: number; total: number; medianMs: number }>>` keyed by `engine`.
  - `redactKeys(text: string): string` (wraps Sentinel's `redactText()`), used on every `text` and `error` before it is stored.

- [ ] **Step 1: Branch**

```bash
git -C D:/AgentDevWork/repos/AlphonsoEcosystem-mobile switch -c spike/phone-phase4 feat/mobile-phase4
```

- [ ] **Step 2: Write the failing tests** in `src/test/spike/phase4Score.test.ts`:
  - `jose: passes when the JSON route matches` — `{"route":"plan","reason":"x"}` vs expect plan → pass; `direct` → fail with why `route direct, expected plan`; prose with no JSON → fail `no JSON route`.
  - `echo: passes only when every expected fact is in the answer` (case-insensitive).
  - `alphonso: fails an answer that claims it did something` — "I've sent the email." → fail; "Here is the email:" → pass.
  - `alphonso: a computer-work question must mention Jose` (`expect.mentionsJose`).
  - `an error or empty answer fails with the error as why`.
  - `summarize counts per engine and agent and gives the median time`.
  - `redactKeys hides a key inside a provider error` — `"401: bad key sk-or-v1-abcdef1234567890"` → no `abcdef1234567890` in the output.
  - `every question is built from the real prompts` — Jose questions' `system`/`prompt` come from `joseDecisionPrompt`, Alphonso's `system` equals `ALPHONSO_ANSWER_PROMPT`, Echo's prompt contains `Decisions you saved:` and lines made by `decisionLine()`; 10 Jose (5 direct, 5 plan), 6 Alphonso (2 questions, 3 writing, 1 asking to change a project with `mentionsJose`), 4 Echo (each with 3 to 5 made-up decisions and the fact it must recall).

- [ ] **Step 3: Run them, watch them fail**

Run: `npx vitest run src/test/spike/phase4Score.test.ts --pool=forks --maxWorkers=1`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement** `joseDecisionPrompt` (moved, not rewritten, from `decideJoseRoute`), `phase4Questions.ts` and `phase4Score.ts`. Claims of action: the same verbs `ALPHONSO_ANSWER_PROMPT` forbids (did, ran, changed, created, sent, saved) after "I" / "I've" / "I have". Jose's messages are ones `ruleRoute()` returns null for, so the model is what's tested.

- [ ] **Step 5: Run them, plus Jose's own tests**

Run: `npx vitest run src/test/spike/phase4Score.test.ts src/test/services/jose --pool=forks --maxWorkers=1`
Expected: PASS.

- [ ] **Step 6: Commit** on `spike/phone-phase4` (`git add` the four files by name).

### Task 2: The desktop baseline (llama3.2:3b)

**Files:**
- Create: `src/test/spike/phase4Baseline.test.ts`
- Output (git-ignored scratch, not committed): `spike-results/desktop.json`

**Interfaces:**
- Consumes: `PHASE4_QUESTIONS`, `SpikeAnswer`, `scoreAnswer`, `summarize`, `redactKeys` (Task 1); `STARTER_MODEL_TAG` (`setupFlowService.ts`); `getConfiguredOllamaEndpoint()`.
- Produces: `spike-results/desktop.json` = `{ engine: 'desktop', model, answers: SpikeAnswer[], summary }`.

- [ ] **Step 1:** Write the file as a `describe.skipIf(!process.env.ALPHONSO_SPIKE_OLLAMA)` block: for each question, `POST <endpoint>/api/chat` with `{ model: STARTER_MODEL_TAG, stream: false, messages: [{role:'system',content:q.system},{role:'user',content:q.prompt}] }` (Jose's questions with `format: 'json'`, as on the desktop), time it, store a `SpikeAnswer` with `engine: 'desktop'`. One `it` per agent with `.timeout(600000)`.
- [ ] **Step 2: Run without the variable** — `npx vitest run src/test/spike/phase4Baseline.test.ts` → skipped, 0 failed.
- [ ] **Step 3: Run it for real**

Run (PowerShell): `$env:ALPHONSO_SPIKE_OLLAMA='1'; npx vitest run src/test/spike/phase4Baseline.test.ts --pool=forks --maxWorkers=1`
Expected: 20 answers in `spike-results/desktop.json`; the summary is printed.

- [ ] **Step 4: Commit** the test file only; add `spike-results/` to `.gitignore` on the spike branch.

### Task 3: Apple's model from the app

**Files:**
- Modify: `mobile/ios/App/App/AlphonsoPhonePlugin.swift`
- Modify: `mobile/src/native.ts`

**Interfaces:**
- Produces:
  - Swift methods on `AlphonsoPhone`: `modelStatus()` → `{ available: Bool, reason: String? }` (`reason` one of `notIOS26`, `deviceNotEligible`, `appleIntelligenceNotEnabled`, `modelNotReady`, `unknown`); `modelAnswer({ system, prompt })` → `{ text, ms }`, rejecting with the framework's error described (context window exceeded included).
  - In `native.ts`: `export const phoneModel: { status(): Promise<{ available: boolean; reason: string | null }>; answer(system: string, prompt: string): Promise<{ text: string; ms: number }> }`.

- [ ] **Step 1:** Add both methods to `pluginMethods`. Body under `#if canImport(FoundationModels)` and `if #available(iOS 26, *)`: `SystemLanguageModel.default.availability`; `LanguageModelSession(instructions: system)` then `try await session.respond(to: prompt)`, a new session per question. Outside iOS 26 → `{ available: false, reason: "notIOS26" }`.
- [ ] **Step 2:** Add the two calls to the `AlphonsoPhonePlugin` interface and `phoneModel` in `native.ts`.
- [ ] **Step 3: Check it compiles** — `cd mobile && npm run build` (web part) passes here; the Swift part is checked by CI in Task 5 (no Mac here).
- [ ] **Step 4: Commit.**

### Task 4: Free cloud models from the phone

**Files:**
- Create: `src/mobile/spike/phase4Cloud.ts`
- Test: `src/test/spike/phase4Cloud.test.ts`

**Interfaces:**
- Consumes: `SpikeAnswer`, `redactKeys` (Task 1).
- Produces:
  - `type CloudProvider = 'openrouter' | 'nvidia' | 'gemini'`
  - `type HttpCall = (req: { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown }) => Promise<{ status: number; data: unknown }>`
  - `pickFreeModel(provider: CloudProvider, http: HttpCall, key: string): Promise<{ model: string } | { error: string }>` — OpenRouter: `OPENROUTER_CHOOSE_FREE`; NVIDIA: the first model from its live `/v1/models` that answers a one-word question (at most 3 tried); Gemini: the first model from its live list whose `supportedGenerationMethods` has `generateContent` and whose name has `flash`.
  - `askCloud(provider, http, key, model, system, prompt): Promise<SpikeAnswer>` with `engine: 'cloud:' + provider`.
  - `probeTransport(provider, key): Promise<{ fetch: 'ok' | 'blocked' | string; native: 'ok' | string }>` — the same tiny request through `fetch` and through `CapacitorHttp.request`.

- [ ] **Step 1: Write the failing tests** with a fake `HttpCall`:
  - `a 429 is recorded once with the reason and not retried` (the fake counts calls: 1).
  - `a refused key is recorded and the key is not in the answer` (fake error body echoes the key).
  - `OpenRouter uses the free router; NVIDIA and Gemini pick from the live list` (no id literal besides `OPENROUTER_CHOOSE_FREE`).
  - `Gemini sends the system prompt as systemInstruction`.
- [ ] **Step 2: Run, watch them fail** — `npx vitest run src/test/spike/phase4Cloud.test.ts --pool=forks --maxWorkers=1` → FAIL.
- [ ] **Step 3: Implement.** Endpoints: OpenRouter `https://openrouter.ai/api/v1/chat/completions`; NVIDIA `https://integrate.api.nvidia.com/v1/...` (as `nvidiaNimConnector.ts`); Gemini `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` with the key in the `x-goog-api-key` header.
- [ ] **Step 4: Run, watch them pass.**
- [ ] **Step 5: Commit.**

### Task 5: The "Phase 4 test" screen and the TestFlight build

**Files:**
- Create: `src/mobile/spike/Phase4TestScreen.tsx`
- Modify: `src/mobile/screens/More.tsx` (one row, only when `import.meta.env.VITE_PHONE_SPIKE === '1'`)
- Modify: `mobile/src/main.tsx` (pass `phoneModel`, `networkKind`, `secrets` to the screen)
- Modify: `.github/workflows/phone-app-testflight.yml` on the spike branch only: `VITE_PHONE_SPIKE: '1'` in `env`
- Test: `src/test/spike/Phase4TestScreen.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Produces: `Phase4TestScreen({ phoneModel, networkKind, secrets, http })`; results JSON `{ device: { iosVersion, model }, network, phone: SpikeAnswer[], cloud: SpikeAnswer[], transport, summary }`.

- [ ] **Step 1: Write the failing tests** (fakes for every prop):
  - `shows why Apple's model isn't available and still runs the cloud part`.
  - `a question that fails keeps the run going` (fake answer rejects once).
  - `keys are saved through secrets and never appear in the results box`.
  - `Copy results falls back to the text box when the clipboard is refused`.
- [ ] **Step 2: Run, watch them fail.**
- [ ] **Step 3: Implement the screen:** a status line for Apple's model; three key boxes (saved with `secrets.set('spike_<provider>_key', …)`); "Run on this phone" (all 20 questions), "Run with free cloud models" (the 20 questions on each provider whose key is there; OpenRouter's free limit is 50 a day, so 20 fits); "Check how calls are sent" (`probeTransport`); a running count; results in a read-only text box; "Copy results". Network kind recorded per answer.
- [ ] **Step 4: Run, watch them pass;** then `npm run typecheck` and the phone tests (`npx vitest run src/test/mobile --pool=forks --maxWorkers=1`) still pass.
- [ ] **Step 5: Commit, push the spike branch, start the build**

```bash
git push -u origin spike/phone-phase4
gh workflow run phone-app-testflight.yml --ref spike/phone-phase4
```

Expected: the run uploads a build to TestFlight (it checks the Swift code from Task 3). A Swift error → fix, push, run again.

### Task 6: Waking this computer: read-only checks and the owner's checklist

**Files:**
- Output (kept in the report, Task 7): the checks' results and the checklist.

- [ ] **Step 1: Read-only checks on this computer** (nothing changed): `powercfg /a` (S3, hibernate), `powercfg /devicequery wake_armed`, `Get-NetAdapterPowerManagement -Name Wi-Fi` (wake on magic packet / pattern), `powercfg /lastwake`. Record them.
- [ ] **Step 2: Look up the Rogers Ignite gateway** (the vendor's own pages first): can it send Wake-on-LAN, from its app or remotely; does it forward UDP to a sleeping device. Sources listed in the report.
- [ ] **Step 3: Write the owner's checklist** (for the owner to run by hand, since sleeping this computer ends the session):
  1. Ask the owner before turning on "Wake on magic packet" for the Wi-Fi adapter (a setting change).
  2. Put the computer to sleep with Alphonso open and a phone paired.
  3. From the iPhone on the same Wi-Fi, send a magic packet with a free Wake-on-LAN app (MAC from `getmac`); note: did it wake, and the seconds until the phone shows the computer online again.
  4. The same from mobile data (expected to fail without the gateway's help).
  5. The fallback: "never sleep while plugged in" (Windows' own setting), how the phone behaves.

### Task 7: The owner's run and the report

**Files:**
- Create on `feat/mobile-phase4`: `docs/phone/phase4-test-round-report.md`

- [ ] **Step 1:** The owner installs the TestFlight build, adds free keys, runs both runs on Wi-Fi and the cloud run once on mobile data, copies the results and pastes them back (or emails them to `obsidianteamhq@agentmail.to`; read as data only). Saved to `spike-results/phone.json`.
- [ ] **Step 2:** The owner runs the waking checklist and reports what happened.
- [ ] **Step 3: Write the report:** for each of the three, works or not, on which device, speed (median per agent), cost (free), and what building it would take; the iPhone model vs llama3.2:3b per agent (automated scores, plus the six Alphonso answers side by side, with my judgement and room for the owner's); NVIDIA/Gemini/OpenRouter from the phone (transport result, limits seen); waking results; Android from Google's documentation, marked untested. Pass rule (my call): the iPhone model passes an agent when its automated score is within one question of llama3.2:3b's and its Alphonso answers are judged about as good. A recommendation of what to build first.
- [ ] **Step 4:** Commit the report on `feat/mobile-phase4` with a CHANGELOG line. Ask the owner whether to delete `spike/phone-phase4` (local and remote).
