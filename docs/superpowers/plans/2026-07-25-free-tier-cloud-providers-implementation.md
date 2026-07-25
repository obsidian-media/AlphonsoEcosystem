# Free-Tier Cloud Providers (NVIDIA NIM + Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new zero-cost-by-default connectors — NVIDIA NIM and Google Gemini (AI Studio free tier) — following the exact pattern of the existing `deepseekConnector.ts`, wired into the registry, credential UI, health checks, and Zero-Cost Mode gate, with graceful rate-limit handling and a mandatory user-facing disclosure.

**Architecture:** Two new sibling files under `src/services/connectors/` (`nvidiaNimConnector.ts`, `geminiConnector.ts`), each exposing `isXConfigured()` / `sendXMessage()` (mirroring `deepseekConnector.ts`'s shape exactly), registered in `connectorRegistry.js`'s `DEFAULT_CONNECTORS`, surfaced via `ConnectorSetupPanel.tsx`'s existing `CredentialSection` pattern, health-checked via `connectorHealthCheckService.ts`'s existing `checkApiKeyConfigured` helper, and deliberately excluded (with an explanatory comment) from `policyEnforcementService.ts`'s `PAID_OR_METERED_CONNECTORS` set.

**Tech Stack:** TypeScript, Vitest, `fetch` (no new dependencies), existing `getConnectorCredential`/`evaluatePolicyGate` primitives.

**Source doc:** `docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md` — this plan implements §2, §3, §5, and the connector-related rows of §7/§8. §4 (model-diversity picker UI) and §6 (onboarding integration) are explicitly out of scope for this PR per that doc's own §1 boundaries and the user's confirmed scope choice.

---

### Task 1: `nvidiaNimConnector.ts`

**Files:**
- Create: `src/services/connectors/nvidiaNimConnector.ts`
- Test: `src/test/nvidiaNimConnector.test.js`

NVIDIA NIM's `integrate.api.nvidia.com` endpoint is OpenAI-compatible (same request/response shape DeepSeek already uses), so this mirrors `deepseekConnector.ts` almost exactly, with one addition: a typed, non-throwing return for `429` rate-limit responses (per the source doc §3), and a `listNvidiaModels()` helper since NVIDIA's whole value proposition is its 70-80+ model catalog.

- [ ] **Step 1: Write the failing test**

```js
// src/test/nvidiaNimConnector.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'nvidia_nim' && key === 'NVIDIA_API_KEY') return 'nvapi-test-key';
    return '';
  })
}));

const { isNvidiaConfigured, sendNvidiaMessage, listNvidiaModels } = await import('../services/connectors/nvidiaNimConnector.js');

describe('nvidiaNimConnector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isNvidiaConfigured returns true when key present', () => {
    expect(isNvidiaConfigured()).toBe(true);
  });

  it('sendNvidiaMessage calls the NVIDIA NIM API and returns content', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Hello from NVIDIA' } }],
        model: 'meta/llama-3.1-8b-instruct',
        usage: { total_tokens: 12 }
      })
    });

    const result = await sendNvidiaMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello from NVIDIA');
    expect(result.provider).toBe('nvidia_nim');
    expect(fetch).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer nvapi-test-key' })
      })
    );
  });

  it('sendNvidiaMessage returns a typed rateLimited result on 429 instead of throwing', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limit exceeded' });

    const result = await sendNvidiaMessage([{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.provider).toBe('nvidia_nim');
  });

  it('sendNvidiaMessage throws on non-429 non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(sendNvidiaMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('NVIDIA NIM API error 401');
  });

  it('sendNvidiaMessage throws when not configured', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth.js');
    getConnectorCredential.mockReturnValueOnce('');
    await expect(sendNvidiaMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('NVIDIA API key not configured');
  });

  it('listNvidiaModels returns the model id list', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'meta/llama-3.1-8b-instruct' }, { id: 'nvidia/nemotron-4-340b-instruct' }] })
    });

    const models = await listNvidiaModels();
    expect(models).toEqual(['meta/llama-3.1-8b-instruct', 'nvidia/nemotron-4-340b-instruct']);
    expect(fetch).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer nvapi-test-key' }) })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/nvidiaNimConnector.test.js`
Expected: FAIL — `Cannot find module '../services/connectors/nvidiaNimConnector.js'` (or similar resolution error), since the source file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/connectors/nvidiaNimConnector.ts
import { getConnectorCredential } from './connectorAuth';

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com/v1';
// meta/llama-3.1-8b-instruct is one of NVIDIA NIM's widely-available free-tier
// chat models as of 2026-07-23. Reconfirm against build.nvidia.com's current
// catalog before assuming this stays free/available long-term — see
// docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §2.1.
const DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';

export interface NvidiaMessage {
  role: string;
  content: string;
}

export interface NvidiaChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface NvidiaChatSuccess {
  ok: true;
  content: string;
  model: string;
  usage: any;
  provider: 'nvidia_nim';
}

export interface NvidiaRateLimited {
  ok: false;
  rateLimited: true;
  status: number;
  message: string;
  provider: 'nvidia_nim';
}

export type NvidiaSendResult = NvidiaChatSuccess | NvidiaRateLimited;

export function isNvidiaConfigured(): boolean {
  return Boolean(getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY'));
}

export async function sendNvidiaMessage(
  messages: NvidiaMessage[],
  { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 }: NvidiaChatOptions = {}
): Promise<NvidiaSendResult> {
  const apiKey = getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY');
  if (!apiKey) throw new Error('NVIDIA API key not configured');

  const r = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (r.status === 429) {
    const err = await r.text();
    return { ok: false, rateLimited: true, status: 429, message: err || 'NVIDIA NIM rate limit exceeded', provider: 'nvidia_nim' };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`NVIDIA NIM API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    ok: true,
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    usage: data.usage || null,
    provider: 'nvidia_nim'
  };
}

export async function listNvidiaModels(): Promise<string[]> {
  const apiKey = getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY');
  if (!apiKey) throw new Error('NVIDIA API key not configured');

  const r = await fetch(`${NVIDIA_API_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`NVIDIA NIM API error ${r.status}: ${err}`);
  }
  const data = await r.json();
  return (data.data || []).map((m: { id: string }) => m.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/nvidiaNimConnector.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/connectors/nvidiaNimConnector.ts src/test/nvidiaNimConnector.test.js
git commit -m "feat(connectors): add NVIDIA NIM free-tier connector"
```

---

### Task 2: `geminiConnector.ts`

**Files:**
- Create: `src/services/connectors/geminiConnector.ts`
- Test: `src/test/geminiConnector.test.js`

Gemini's `generativelanguage.googleapis.com` REST API uses a different request/response shape than OpenAI-compatible APIs (`contents`/`parts` instead of `messages`, `candidates` instead of `choices`, and `model`/`user` instead of `assistant`/`user` for roles) — this connector accepts the same `{role, content}[]` shape as the other connectors for caller consistency, and translates internally.

- [ ] **Step 1: Write the failing test**

```js
// src/test/geminiConnector.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/connectors/connectorAuth.js', () => ({
  getConnectorCredential: vi.fn((connectorId, key) => {
    if (connectorId === 'gemini' && key === 'GEMINI_API_KEY') return 'gemini-test-key';
    return '';
  })
}));

const { isGeminiConfigured, sendGeminiMessage } = await import('../services/connectors/geminiConnector.js');

describe('geminiConnector', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('isGeminiConfigured returns true when key present', () => {
    expect(isGeminiConfigured()).toBe(true);
  });

  it('sendGeminiMessage calls the Gemini API and returns content', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
        usageMetadata: { totalTokenCount: 8 }
      })
    });

    const result = await sendGeminiMessage([{ role: 'user', content: 'Hello' }]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello from Gemini');
    expect(result.provider).toBe('gemini');

    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('key=gemini-test-key');
    const body = JSON.parse(options.body);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Hello' }] });
  });

  it('maps assistant role to Gemini "model" role', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ack' }] } }] })
    });

    await sendGeminiMessage([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello there' },
      { role: 'user', content: 'How are you?' }
    ]);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[1].role).toBe('model');
  });

  it('sendGeminiMessage returns a typed rateLimited result on 429 instead of throwing', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Quota exceeded' });

    const result = await sendGeminiMessage([{ role: 'user', content: 'Hi' }]);
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.provider).toBe('gemini');
  });

  it('sendGeminiMessage throws on non-429 non-ok response', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad request' });
    await expect(sendGeminiMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Gemini API error 400');
  });

  it('sendGeminiMessage throws when not configured', async () => {
    const { getConnectorCredential } = await import('../services/connectors/connectorAuth.js');
    getConnectorCredential.mockReturnValueOnce('');
    await expect(sendGeminiMessage([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Gemini API key not configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/geminiConnector.test.js`
Expected: FAIL — module `../services/connectors/geminiConnector.js` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/connectors/geminiConnector.ts
import { getConnectorCredential } from './connectorAuth';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-1.5-flash is a Google AI Studio free-tier-eligible model as of
// 2026-07-23. Google's free-tier model list is narrower than its full
// catalog and does shift — reconfirm at aistudio.google.com before assuming
// this (or any Gemini model) stays free-tier-eligible. See
// docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md §2.2.
const DEFAULT_MODEL = 'gemini-1.5-flash';

export interface GeminiMessage {
  role: string;
  content: string;
}

export interface GeminiChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GeminiChatSuccess {
  ok: true;
  content: string;
  model: string;
  usage: any;
  provider: 'gemini';
}

export interface GeminiRateLimited {
  ok: false;
  rateLimited: true;
  status: number;
  message: string;
  provider: 'gemini';
}

export type GeminiSendResult = GeminiChatSuccess | GeminiRateLimited;

export function isGeminiConfigured(): boolean {
  return Boolean(getConnectorCredential('gemini', 'GEMINI_API_KEY'));
}

function toGeminiRole(role: string): string {
  return role === 'assistant' ? 'model' : 'user';
}

export async function sendGeminiMessage(
  messages: GeminiMessage[],
  { model = DEFAULT_MODEL, maxTokens = 2048, temperature = 0.7 }: GeminiChatOptions = {}
): Promise<GeminiSendResult> {
  const apiKey = getConnectorCredential('gemini', 'GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini API key not configured');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: toGeminiRole(m.role), parts: [{ text: m.content }] }));

  const r = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature }
    })
  });

  if (r.status === 429) {
    const err = await r.text();
    return { ok: false, rateLimited: true, status: 429, message: err || 'Gemini rate limit exceeded', provider: 'gemini' };
  }

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Gemini API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  return {
    ok: true,
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    model,
    usage: data.usageMetadata || null,
    provider: 'gemini'
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/geminiConnector.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/connectors/geminiConnector.ts src/test/geminiConnector.test.js
git commit -m "feat(connectors): add Google Gemini free-tier connector"
```

---

### Task 3: Zero-Cost Mode regression test + documented non-inclusion

**Files:**
- Modify: `src/services/policyEnforcementService.ts:11-21`
- Modify: `src/test/policyEnforcementService.test.js`

Per the source doc §3, this is the one behavior the whole plan depends on: `nvidia_nim` and `gemini` must NOT be added to `PAID_OR_METERED_CONNECTORS`. Add a comment explaining why, plus a regression test.

- [ ] **Step 1: Write the failing test**

Add to `src/test/policyEnforcementService.test.js`, inside the existing `describe('evaluatePolicyGate', ...)` block (after the `'allows non-paid connectors in zero-cost mode'` test):

```js
    it('allows nvidia_nim and gemini in zero-cost mode (intentionally not in PAID_OR_METERED_CONNECTORS)', () => {
      localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: true, approvalMode: false }));
      const nvidiaResult = evaluatePolicyGate({ connectorId: 'nvidia_nim' });
      expect(nvidiaResult.ok).toBe(true);
      expect(nvidiaResult.blocked).toBe(false);

      const geminiResult = evaluatePolicyGate({ connectorId: 'gemini' });
      expect(geminiResult.ok).toBe(true);
      expect(geminiResult.blocked).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/policyEnforcementService.test.js`
Expected: This specific test actually PASSES already, since any connector id not in the current `PAID_OR_METERED_CONNECTORS` set passes through by default — the source doc calls this "already correct by doing nothing extra." Confirm it passes now (proving the baseline behavior this task documents), then proceed to Step 3 to add the required comment (the doc's real requirement here is documentation, not a behavior change).

- [ ] **Step 3: Add the documentation comment**

In `src/services/policyEnforcementService.ts`, replace lines 11-21:

```ts
const PAID_OR_METERED_CONNECTORS: Set<string> = new Set([
  'chatgpt',
  'claude',
  'qwen',
  'whatsapp',
  'notion',
  'clickup',
  'gmail',
  'google_drive',
  'airtable'
]);
```

with:

```ts
// nvidia_nim and gemini are intentionally NOT in this set — both are
// genuinely free-tier (rate-limited, not billed on overage) as of
// 2026-07-25. See docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md
// before adding them here or removing them from here.
const PAID_OR_METERED_CONNECTORS: Set<string> = new Set([
  'chatgpt',
  'claude',
  'qwen',
  'whatsapp',
  'notion',
  'clickup',
  'gmail',
  'google_drive',
  'airtable'
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/policyEnforcementService.test.js`
Expected: PASS, all tests including the new one (no logic changed, comment-only edit).

- [ ] **Step 5: Commit**

```bash
git add src/services/policyEnforcementService.ts src/test/policyEnforcementService.test.js
git commit -m "test(policy): regression-guard nvidia_nim/gemini staying outside Zero-Cost Mode paid set"
```

---

### Task 4: Registry entries

**Files:**
- Modify: `src/services/connectors/connectorRegistry.js:219-227`

- [ ] **Step 1: Add both connectors to `DEFAULT_CONNECTORS`**

In `src/services/connectors/connectorRegistry.js`, immediately after the existing `deepseek` entry (ends at line 227 with `},`), insert:

```js
  {
    id: 'nvidia_nim',
    name: 'NVIDIA NIM',
    status: 'not_configured',
    transport: 'nvidia_nim_api',
    requiredEnv: ['NVIDIA_API_KEY'],
    permissions: ['prompt_exchange'],
    disabledReason: 'NVIDIA API key is not configured.'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    status: 'not_configured',
    transport: 'gemini_api',
    requiredEnv: ['GEMINI_API_KEY'],
    permissions: ['prompt_exchange'],
    disabledReason: 'Gemini API key is not configured.'
  },
```

- [ ] **Step 2: Run the existing registry test suite to verify no regressions**

Run: `npx vitest run src/test/connectorRegistry.test.js`
(If this exact filename doesn't exist, run: `npx vitest run -t "connectorRegistry"` to find and run the actual test file covering `DEFAULT_CONNECTORS`.)
Expected: PASS — existing tests continue passing; connector count assertions (if any) may need updating in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/services/connectors/connectorRegistry.js
git commit -m "feat(connectors): register nvidia_nim and gemini in DEFAULT_CONNECTORS"
```

---

### Task 5: Health checks

**Files:**
- Modify: `src/services/connectorHealthCheckService.ts:314-317`

Both connectors get the same presence-only health check already used for `deepseek`/`tavily`/`perplexity`/`brave_search` — a lightweight, side-effect-free credential check, not a real generation call (per `CLAUDE.md`'s existing description of this file's pattern).

- [ ] **Step 1: Add both cases to `checkConnectorHealth`'s switch**

In `src/services/connectorHealthCheckService.ts`, immediately after the existing `case 'deepseek':` block (line 315-316), insert:

```ts
    case 'nvidia_nim':
      return checkApiKeyConfigured('nvidia_nim', 'NVIDIA_API_KEY', 'NVIDIA NIM');
    case 'gemini':
      return checkApiKeyConfigured('gemini', 'GEMINI_API_KEY', 'Gemini');
```

- [ ] **Step 2: Write a regression test**

Find the existing health-check test file:

Run: `find src/test -iname "*connectorHealthCheck*"`

Add to that file (following its existing pattern for the `deepseek` case — read the file first to match exact mock setup):

```js
  it('checkConnectorHealth reports nvidia_nim key presence', async () => {
    const result = await checkConnectorHealth('nvidia_nim');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('message');
  });

  it('checkConnectorHealth reports gemini key presence', async () => {
    const result = await checkConnectorHealth('gemini');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('message');
  });
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run <the health check test file found in Step 2>`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/connectorHealthCheckService.ts
git commit -m "feat(connectors): add health checks for nvidia_nim and gemini"
```

(Include the health-check test file in the `git add` if Step 2 modified one.)

---

### Task 6: Credential UI + disclosure copy

**Files:**
- Modify: `src/components/ConnectorSetupPanel.tsx`

Follows the exact `CredentialSection` pattern used for DeepSeek (`ConnectorSetupPanel.tsx:805-809`), including the required disclosure copy from the source doc §5 in the `hint` text (this repo's existing pattern already puts explanatory/warning text in `hint`, so no new UI primitive is needed).

- [ ] **Step 1: Add state hooks**

In `src/components/ConnectorSetupPanel.tsx`, immediately after line 275 (`const [deepseekApiKey, ...`), add:

```tsx
  const [nvidiaApiKey, setNvidiaApiKey] = useState(() => getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY'));
  const [geminiApiKey, setGeminiApiKey] = useState(() => getConnectorCredential('gemini', 'GEMINI_API_KEY'));
```

- [ ] **Step 2: Add re-hydration on the post-hydrate effect**

Immediately after line 313 (`setDeepseekApiKey((prev) => prev || getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY'));`), add:

```tsx
      setNvidiaApiKey((prev) => prev || getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY'));
      setGeminiApiKey((prev) => prev || getConnectorCredential('gemini', 'GEMINI_API_KEY'));
```

- [ ] **Step 3: Add icon map entries**

In the `ICON_MAP` object (around line 48-57), add after the `deepseek: Cpu,` line:

```tsx
  nvidia_nim: Cpu,
  gemini: Cpu,
```

- [ ] **Step 4: Add the CredentialSection blocks**

Immediately after the DeepSeek `CredentialSection` block (`ConnectorSetupPanel.tsx:805-809`, ending `savedLabel="DeepSeek key saved" />`), insert:

```tsx
          <CredentialSection title="NVIDIA NIM" icon={Cpu} borderColor="border-lime-300/20" bgColor="bg-lime-500/8" accentColor="text-lime-400"
            fields={[{ label: 'API Key', placeholder: 'nvapi-...', value: nvidiaApiKey, onChange: setNvidiaApiKey, key: 'NVIDIA_API_KEY' }]}
            onSave={() => saveConnectorApiKey('nvidia_nim', { NVIDIA_API_KEY: nvidiaApiKey })}
            hint="Get a free key at build.nvidia.com — 70-80+ hosted models via one OpenAI-compatible endpoint. Free tier, not local: requests leave your machine and go to NVIDIA's cloud. Rate-limited and provider-controlled, not guaranteed by Alphonso — if NVIDIA changes their free-tier policy, this may stop working or require billing on their side."
            savedLabel="NVIDIA NIM key saved" />

          <CredentialSection title="Google Gemini" icon={Cpu} borderColor="border-blue-300/20" bgColor="bg-blue-500/8" accentColor="text-blue-400"
            fields={[{ label: 'API Key', placeholder: 'AIza...', value: geminiApiKey, onChange: setGeminiApiKey, key: 'GEMINI_API_KEY' }]}
            onSave={() => saveConnectorApiKey('gemini', { GEMINI_API_KEY: geminiApiKey })}
            hint="Get a free key at aistudio.google.com (AI Studio free tier, not billed Vertex AI). Free tier, not local: requests leave your machine and go to Google's cloud. Rate-limited and provider-controlled, not guaranteed by Alphonso — if Google changes their free-tier policy, this may stop working or require billing on their side."
            savedLabel="Gemini key saved" />
```

- [ ] **Step 5: Run the existing ConnectorSetupPanel test suite**

Run: `npx vitest run src/test/ConnectorSetupPanel.test.jsx`
Expected: PASS — no regressions to existing connector sections. If this fails, check whether the test file asserts an exact count of `CredentialSection` renders or connector list length; update that count to match the two new sections, matching how the source doc's §7 anticipates doc/count updates.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConnectorSetupPanel.tsx
git commit -m "feat(connectors): add NVIDIA NIM and Gemini credential UI with required disclosure copy"
```

---

### Task 7: Doc updates (connector count 22 → 24)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/ALPHONSO_GROUND_TRUTH.md`

Per the source doc §7/§8, doc updates land in the same PR, not a follow-up, and must satisfy `scripts/verify-doc-counts.mjs`.

- [ ] **Step 1: Update the connector count and add both to the "Do Not Duplicate" table in `CLAUDE.md`**

In `CLAUDE.md`, find the line:
```
- **22 connectors** (`DEFAULT_CONNECTORS` in `connectorRegistry.js`): Telegram, WhatsApp, YouTube, mobile_bridge, ChatGPT, Claude, Qwen, Notion, ClickUp, SD WebUI, ComfyUI Video, Runway, GitHub, Slack, Discord, Generic Webhook, Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n — all policy-gated, all registered centrally, all have credential input UI in ConnectorSetupPanel.
```
Replace with:
```
- **24 connectors** (`DEFAULT_CONNECTORS` in `connectorRegistry.js`): Telegram, WhatsApp, YouTube, mobile_bridge, ChatGPT, Claude, Qwen, Notion, ClickUp, SD WebUI, ComfyUI Video, Runway, GitHub, Slack, Discord, Generic Webhook, Ollama, Brave Search, Perplexity, Tavily, DeepSeek, n8n, NVIDIA NIM, Gemini — all policy-gated, all registered centrally, all have credential input UI in ConnectorSetupPanel. NVIDIA NIM and Gemini are free-tier cloud connectors deliberately excluded from `PAID_OR_METERED_CONNECTORS` in `policyEnforcementService.ts` — see `docs/superpowers/plans/2026-07-23-free-tier-cloud-providers.md`.
```

Add a row to the "Do Not Duplicate" table (after the DeepSeek connector row):
```
| NVIDIA NIM connector | `src/services/connectors/nvidiaNimConnector.ts` — `isNvidiaConfigured`, `sendNvidiaMessage`, `listNvidiaModels`; free-tier, OpenAI-compatible, 70-80+ models |
| Gemini connector | `src/services/connectors/geminiConnector.ts` — `isGeminiConfigured`, `sendGeminiMessage`; free-tier AI Studio (not billed Vertex AI) |
```

- [ ] **Step 2: Update `docs/ALPHONSO_GROUND_TRUTH.md`**

Read the file first to find its connector count reference (mirrors `CLAUDE.md`'s "22 connectors" line), then apply the same 22 → 24 update with the same two names appended.

- [ ] **Step 3: Run the doc-count verifier**

Run: `node scripts/verify-doc-counts.mjs`
Expected: PASS — no drift between claimed and actual counts.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/ALPHONSO_GROUND_TRUTH.md
git commit -m "docs: update connector count and Do Not Duplicate table for nvidia_nim/gemini"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full targeted test run**

Run:
```bash
npx vitest run src/test/nvidiaNimConnector.test.js src/test/geminiConnector.test.js src/test/policyEnforcementService.test.js src/test/ConnectorSetupPanel.test.jsx
```
Expected: All PASS, 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors/warnings on touched files.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/free-tier-cloud-providers
```

(Do not open/merge a PR without explicit user confirmation — branch protection on `main` requires PR + green CI per the source doc §8; that gate step is a separate user decision, not part of this implementation plan.)

---

## Explicit boundaries (carried from source doc §1/§9)

- No Vertex AI, no NVIDIA metered/enterprise tier — free-tier endpoints only.
- Do not add `nvidia_nim` or `gemini` to `PAID_OR_METERED_CONNECTORS`.
- Do not skip the disclosure copy in Task 6 — it's a user-trust requirement.
- §4 (model-diversity picker UI) and §6 (onboarding integration) are separate follow-up plans, not part of this PR.
