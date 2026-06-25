# JUNE CANDY 2026 — Feature Backlog & Handoff Package

**Owner:** Shayan  
**Controller:** Claude Code (reviews, fixes, merges to main)  
**Workflow:** Each item = one branch. Pass the item to a fresh agent. Claude Code reviews the output, fixes issues, merges to main.  
**Repo:** `D:\AgentDevWork\repos\AlphonsoEcosystem` — branch `main`  
**Read first:** `docs/ALPHONSO_GROUND_TRUTH.md` and `CLAUDE.md` before touching anything.

---

## Known Deferred Issues (tackle next session)

These were discovered during the JUNE CANDY sprint and deferred. Fix before considering any item "fully closed":

| Issue | Severity | File | Description |
|---|---|---|---|
| OpenHands `-it` flag | Medium | `src-tauri/src/runtime_manager.rs` | `openHands` ToolDef uses `-it` Docker flag which requires a real TTY. `tokio::process::Command` has none — Start button will fail. Fix: remove `-it`, keep only `--rm`, add `-d` for detached. |
| ChromaDB ID matching | Low | `src/services/echoMemoryService.js` | `searchEchoMemorySemantic` matches by `m.id === r.id || m.content?.memoryId === r.id` without verifying `listMemoryItems()` shape. May silently return empty results. Verify against actual memoryService output shape. |
| Telegram `/research` output quality | Low | `src/services/telegramCompanionService.js` | `/research` routes through generic `createJoseCommandRoute` — returns Jose pipeline summary, not actual Hector research content. Should call `researchWithHector()` directly and format the sources list for Telegram. |
| MCP bridge Phase 2 — real kv_store | Medium | `bridge/server.js` | `alphonso_get_receipts` still returns empty. Phase 2: frontend polls bridge queue + bridge reads kv_store via SQLite directly. Requires implementing a shared SQLite path convention. |

---

## Priority Order

| # | Feature | Branch Name | Effort | Value |
|---|---|---|---|---|
| 1 | OpenHands via ACC Bridge + Runtime Hub | `feat/openhand-runtime` | Low | 🔥🔥🔥 |
| 2 | ChromaDB local vector DB for Echo | `feat/chromadb-echo` | Medium | 🔥🔥🔥 |
| 3 | n8n local instance + webhook trigger | `feat/n8n-runtime` | Low | 🔥🔥🔥 |
| 4 | Telegram mobile control panel expansion | `feat/telegram-mobile-control` | Low | 🔥🔥 |
| 5 | Scheduled tasks / cron for Jose | `feat/jose-scheduler` | Medium | 🔥🔥🔥 |
| 6 | File system watcher → Echo auto-ingest | `feat/echo-file-watcher` | Low | 🔥🔥 |
| 7 | Expose Alphonso as MCP server | `feat/alphonso-mcp-server` | Medium | 🔥🔥🔥 |
| 8 | Whisper meeting transcription → Echo | `feat/whisper-meeting-ingest` | Low | 🔥🔥 |
| 9 | Perplexity API as Hector fallback | `feat/perplexity-hector` | Low | 🔥🔥 |

---

---

# ITEM 1 — OpenHands via ACC Bridge + Runtime Hub

**Branch:** `feat/openhand-runtime`  
**Base branch:** `main`

## What this is

OpenHands (formerly OpenDevin) is an open-source AI software agent that can write code, execute terminal commands, browse the web, and edit files — all inside a Docker sandbox. Alphonso already has an ACC Bridge service (`src/services/agentWorkshop/accBridgeService.js`) that can route tasks to external agent control centers. The goal is to: (a) add OpenHands as a startable tool in the Runtime Hub, and (b) wire the ACC Bridge to point at the local OpenHands instance so Jose can delegate "write and run code" tasks to it.

## What already exists (do NOT recreate)

- `src/services/agentWorkshop/accBridgeService.js` — ACC Bridge service, reads config from `alphonso_acc_bridge_config_v1` localStorage key, sends tasks via HTTP POST
- `src/components/SettingsView.tsx` — has `AccBridgeSettings` component at the bottom that lets users set the ACC Bridge base URL and auth token
- `src-tauri/src/runtime_manager.rs` — `TOOLS` array, already has entries for ollama, comfyui, whisper, voice-os, openwebui etc. This is where OpenHands gets added.
- `src/components/RuntimeManagerView.jsx` — `TOOL_META` object maps tool names to icons/colors/categories. Add `openHands` entry here.
- `src/services/voiceOsService.js` — reference for how a sidecar service is started via Runtime Hub

## Exact tasks

### Task A — Add OpenHands to Runtime Hub (Rust)

File: `src-tauri/src/runtime_manager.rs`

Add to the `TOOLS` array (after the `openwebui` entry, before the closing `];`):

```rust
ToolDef {
  name: "openHands",
  display_name: "OpenHands",
  description: "AI software agent — writes code, runs terminal commands, browses web in a Docker sandbox",
  repo_url: None,
  pip_packages: &[],
  requirements_file: None,
  port: Some(3000),
  health_path: Some("/api/health"),
  exe: "docker",
  args: &[
    "run", "-it", "--rm",
    "-p", "3000:3000",
    "-e", "SANDBOX_RUNTIME_CONTAINER_IMAGE=ghcr.io/all-hands-ai/runtime:0.38",
    "-v", "/var/run/docker.sock:/var/run/docker.sock",
    "--add-host", "host.docker.internal:host-gateway",
    "ghcr.io/all-hands-ai/openhands:main"
  ],
},
```

### Task B — Add OpenHands to TOOL_META (Frontend)

File: `src/components/RuntimeManagerView.jsx`

In the `TOOL_META` object, add:

```js
openHands: {
  icon: Bot,
  category: 'Agent',
  docsUrl: 'https://github.com/All-Hands-AI/OpenHands',
  color: 'text-cyan-400',
  bg: 'bg-cyan-500/10 border-cyan-500/20',
},
```

Also add `'Agent'` to the category filter pills if it doesn't exist yet (look for the filter button row near the top of `RuntimeManagerView`).

### Task C — ACC Bridge auto-configure UI hint

File: `src/components/SettingsView.tsx`

In the `AccBridgeSettings` component (at the bottom of the file), add a helper button that pre-fills the URL to `http://localhost:3000` (the OpenHands default):

```tsx
<button
  onClick={() => setCfg(c => ({ ...c, baseUrl: 'http://localhost:3000' }))}
  className="text-xs text-cyan-400 hover:text-cyan-300 underline"
>
  Use local OpenHands (Runtime Hub)
</button>
```

Place it just below the base URL input field.

### Task D — Jose routing hint for code tasks

File: `src/services/joseExecutionEngineService.js`

Find the agent routing/assignment section where Jose picks which agent handles a task. Add a comment block (no logic change needed, just documentation for future wiring):

```js
// ACC Bridge routing: tasks assigned to 'openHands' agent are forwarded
// to the ACC Bridge (accBridgeService.sendTask). See accBridgeService.js.
// OpenHands runs locally via Runtime Hub on port 3000.
```

## Verification

1. `cargo check` from `src-tauri/` — must pass clean
2. `npm run test` — all 1930+ tests must pass
3. `npm run build` — must build without errors
4. Manual: Open Runtime Hub, confirm OpenHands appears in the Agent category
5. Manual: Settings → Backup → ACC Bridge — confirm "Use local OpenHands" button pre-fills URL

## What to NOT do

- Do not create a new service file for OpenHands — ACC Bridge already handles the HTTP communication
- Do not change the ACC Bridge HTTP protocol — it works as-is
- Do not add a new Tauri command — Runtime Hub's existing `runtime_start_tool` command handles it
- Do not install OpenHands in this PR — it's a runtime dependency the user installs separately via Docker

---

---

# ITEM 2 — ChromaDB Local Vector DB for Echo Memory

**Branch:** `feat/chromadb-echo`  
**Base branch:** `main`

## What this is

Echo currently stores memories in localStorage and SQLite using keyword-based retrieval. ChromaDB is a local vector database that runs as a Docker container on port 8000. Adding it gives Echo **semantic search** — instead of finding memories that contain the exact word, Echo finds memories that are *conceptually related*. This is a massive quality upgrade for memory retrieval without changing any agent logic.

## What already exists (do NOT recreate)

- `src/services/echoMemoryService.js` — Echo's memory service. Has `synthesizeMemory`, `classifyRetention`, `normalizeMemoryConfidence`. This is where the ChromaDB calls get added.
- `src-tauri/src/runtime_manager.rs` — add ChromaDB as a Runtime Hub tool
- `src/components/RuntimeManagerView.jsx` — add to TOOL_META
- `src/components/SettingsView.tsx` — EchoTimeline component already exists in the Memory section. Add a "Semantic Search" toggle here.
- `src/lib/durableStore.js` — `durableGet/Set/Remove` for persisting config

## Architecture

```
Echo saves memory → localStorage (keep, for offline)
                  → ChromaDB via HTTP (new, for semantic search)

Echo retrieves memory → if ChromaDB healthy: semantic vector search
                      → if ChromaDB offline: fall back to localStorage keyword search
```

ChromaDB runs locally: `docker run -p 8000:8000 chromadb/chroma`

ChromaDB HTTP API (no SDK needed, raw fetch):
- `POST /api/v1/collections` — create collection
- `POST /api/v1/collections/{name}/add` — add documents with embeddings
- `POST /api/v1/collections/{name}/query` — semantic search

**Embeddings:** ChromaDB can generate embeddings itself using its default embedding function — no separate embedding model needed for the basic implementation.

## Exact tasks

### Task A — Add ChromaDB to Runtime Hub

File: `src-tauri/src/runtime_manager.rs`

Add to TOOLS array:

```rust
ToolDef {
  name: "chromadb",
  display_name: "ChromaDB",
  description: "Local vector database for semantic memory search — powers Echo's intelligent memory retrieval",
  repo_url: None,
  pip_packages: &[],
  requirements_file: None,
  port: Some(8000),
  health_path: Some("/api/v1/heartbeat"),
  exe: "docker",
  args: &["run", "--rm", "-p", "8000:8000", "chromadb/chroma"],
},
```

File: `src/components/RuntimeManagerView.jsx` — add to TOOL_META:

```js
chromadb: {
  icon: Database,
  category: 'Memory',
  docsUrl: 'https://docs.trychroma.com',
  color: 'text-emerald-400',
  bg: 'bg-emerald-500/10 border-emerald-500/20',
},
```

### Task B — ChromaDB client service

Create: `src/services/chromaDbService.js`

```js
const CHROMA_BASE = 'http://127.0.0.1:8000';
const COLLECTION = 'alphonso_echo_memory';

export async function isChromaHealthy() {
  try {
    const r = await fetch(`${CHROMA_BASE}/api/v1/heartbeat`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export async function ensureCollection() {
  await fetch(`${CHROMA_BASE}/api/v1/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COLLECTION, get_or_create: true })
  });
}

export async function addMemoryToChroma(memory) {
  await ensureCollection();
  await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids: [memory.id],
      documents: [`${memory.title} ${memory.content}`],
      metadatas: [{ retentionTier: memory.retentionTier, agent: memory.agent || 'echo', createdAt: memory.createdAtMs || Date.now() }]
    })
  });
}

export async function semanticSearchMemory(query, nResults = 10) {
  const healthy = await isChromaHealthy();
  if (!healthy) return null; // caller falls back to localStorage
  await ensureCollection();
  const r = await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_texts: [query], n_results: nResults })
  });
  if (!r.ok) return null;
  const data = await r.json();
  return (data.ids?.[0] || []).map((id, i) => ({
    id,
    score: data.distances?.[0]?.[i] ?? 1,
    metadata: data.metadatas?.[0]?.[i] || {}
  }));
}

export async function deleteMemoryFromChroma(id) {
  await fetch(`${CHROMA_BASE}/api/v1/collections/${COLLECTION}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id] })
  });
}
```

### Task C — Wire into echoMemoryService.js

File: `src/services/echoMemoryService.js`

At the top, add:
```js
import { addMemoryToChroma, semanticSearchMemory, deleteMemoryFromChroma, isChromaHealthy } from './chromaDbService.js';
```

Find the function that saves a memory entry (look for where memories are written to localStorage). After the localStorage write, add:
```js
addMemoryToChroma(memoryEntry).catch(() => {}); // fire-and-forget, non-blocking
```

Find the function that retrieves/searches memories. Wrap it:
```js
// Try semantic search first, fall back to localStorage keyword match
const semanticResults = await semanticSearchMemory(query);
if (semanticResults) {
  // re-hydrate full memory objects from localStorage using returned IDs
  const allMemories = getStoredMemories();
  return semanticResults
    .map(r => allMemories.find(m => m.id === r.id))
    .filter(Boolean);
}
// fallback: existing keyword search logic
```

### Task D — Status indicator in SettingsView Memory section

File: `src/components/SettingsView.tsx`

In the Memory section (`activeSection === 'memory'`), add a small status row above the EchoTimeline:

```tsx
<ChromaDbStatus />
```

Implement `ChromaDbStatus` as a small component that calls `isChromaHealthy()` on mount and shows a green dot ("Vector search active") or amber dot ("Vector search offline — start ChromaDB in Runtime Hub").

## Verification

1. `cargo check` — clean
2. `npm run test` — all pass (add tests for `chromaDbService.js` in `src/test/chromaDbService.test.js` — mock fetch, test healthy/unhealthy/add/search)
3. `npm run build` — clean
4. Manual: Start ChromaDB via Runtime Hub, save a memory, search with a related-but-not-identical phrase — should find it

## What to NOT do

- Do not replace localStorage — ChromaDB is additive. Offline must still work.
- Do not add a Python embedding step — use ChromaDB's built-in default embedding function
- Do not create a new Settings section — wire into the existing Memory section

---

---

# ITEM 3 — n8n Local Instance + Webhook Trigger

**Branch:** `feat/n8n-runtime`  
**Base branch:** `main`

## What this is

n8n is a self-hosted workflow automation platform with 400+ integrations (LinkedIn, Airtable, Gmail, Google Sheets, Discord, and hundreds more). Running it locally via Docker gives Alphonso's Marcus agent the ability to trigger any n8n workflow via a webhook — without building individual connectors for each service. One Docker container = 400 connectors.

## What already exists (do NOT recreate)

- `src/services/marcusExecutionService.js` — Marcus's execution service. Handles distribution/publishing tasks. This is where n8n webhook calls get added.
- `src-tauri/src/runtime_manager.rs` — add n8n to Runtime Hub
- `src/components/RuntimeManagerView.jsx` — add to TOOL_META
- `src/components/ConnectorSetupPanel.jsx` — already has CredentialSection pattern. Add n8n webhook URL field here.
- `src/services/connectors/connectorAuth.js` — `getConnectorCredential` / `saveConnectorApiKey` — use these for storing the n8n webhook URL

## Exact tasks

### Task A — Add n8n to Runtime Hub

File: `src-tauri/src/runtime_manager.rs`

```rust
ToolDef {
  name: "n8n",
  display_name: "n8n",
  description: "Self-hosted workflow automation — 400+ integrations. Trigger any workflow from Alphonso via webhook.",
  repo_url: None,
  pip_packages: &[],
  requirements_file: None,
  port: Some(5678),
  health_path: Some("/healthz"),
  exe: "docker",
  args: &[
    "run", "--rm",
    "-p", "5678:5678",
    "-v", "n8n_data:/home/node/.n8n",
    "--name", "n8n",
    "n8nio/n8n"
  ],
},
```

File: `src/components/RuntimeManagerView.jsx` — TOOL_META:

```js
n8n: {
  icon: Zap,
  category: 'Automation',
  docsUrl: 'https://n8n.io',
  color: 'text-orange-400',
  bg: 'bg-orange-500/10 border-orange-500/20',
},
```

Add `'Automation'` to category filter pills if not present.

### Task B — n8n connector service

Create: `src/services/connectors/n8nConnector.js`

```js
import { getConnectorCredential } from './connectorAuth.js';

export async function triggerN8nWebhook(webhookPath, payload = {}) {
  const baseUrl = getConnectorCredential('n8n', 'N8N_BASE_URL') || 'http://localhost:5678';
  const url = `${baseUrl}/webhook/${webhookPath}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'alphonso', ...payload })
  });
  if (!r.ok) throw new Error(`n8n webhook failed: ${r.status}`);
  return r.json().catch(() => ({ ok: true }));
}

export async function isN8nHealthy() {
  try {
    const baseUrl = getConnectorCredential('n8n', 'N8N_BASE_URL') || 'http://localhost:5678';
    const r = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}
```

### Task C — Wire into Marcus execution service

File: `src/services/marcusExecutionService.js`

Add import at top:
```js
import { triggerN8nWebhook, isN8nHealthy } from './connectors/n8nConnector.js';
```

Find where Marcus handles distribution tasks. Add n8n as an available distribution channel:

```js
// n8n webhook distribution — triggers configured n8n workflows
if (task.channel === 'n8n' || task.useN8n) {
  const healthy = await isN8nHealthy();
  if (healthy) {
    return triggerN8nWebhook(task.webhookPath || 'alphonso-distribute', {
      taskId: task.id,
      content: task.content,
      agent: 'marcus',
      metadata: task.metadata || {}
    });
  }
}
```

### Task D — Credential UI in ConnectorSetupPanel

File: `src/components/ConnectorSetupPanel.jsx`

Add state variable with others:
```js
const [n8nBaseUrl, setN8nBaseUrl] = useState(() => getConnectorCredential('n8n', 'N8N_BASE_URL') || 'http://localhost:5678');
```

Add CredentialSection after the Brave Search section:

```jsx
{/* n8n */}
<CredentialSection
  title="n8n (Local Automation)"
  icon={Zap}
  borderColor="border-orange-300/20"
  bgColor="bg-orange-500/8"
  accentColor="text-orange-400"
  fields={[{ label: 'n8n Base URL', placeholder: 'http://localhost:5678', value: n8nBaseUrl, onChange: setN8nBaseUrl, key: 'N8N_BASE_URL', secret: false }]}
  onSave={() => saveConnectorApiKey('n8n', { N8N_BASE_URL: n8nBaseUrl })}
  hint="Start n8n via Runtime Hub (runs on port 5678). Then build workflows at localhost:5678 and trigger them from Alphonso via Marcus. Webhook path is set per-task."
  savedLabel="n8n URL saved"
/>
```

## Verification

1. `cargo check` — clean
2. `npm run test` — all pass (add `src/test/n8nConnector.test.js` — mock fetch, test triggerN8nWebhook happy path + unhealthy fallback)
3. `npm run build` — clean
4. Manual: Runtime Hub → n8n → Start. Confirm n8n UI loads at `localhost:5678`.

## What to NOT do

- Do not build specific n8n workflow templates — that's user configuration in n8n's UI
- Do not add n8n auth token support in this PR — basic webhook auth is enough for local use
- Do not replace any existing Marcus connectors (GitHub, Slack) — n8n is additive

---

---

# ITEM 4 — Telegram Mobile Control Panel Expansion

**Branch:** `feat/telegram-mobile-control`  
**Base branch:** `main`

## What this is

The Telegram companion bot already has 17 commands (`/help`, `/report`, `/files`, `/status`, `/memory`, `/ping`, `/agents`, `/nova`, `/scan`, etc.) in `src/services/telegramCompanionService.js`. This feature adds 4 power commands that make Alphonso fully controllable from your phone: `/image`, `/research`, `/code`, `/workflow`. These let you trigger Miya, Hector, OpenHands (via ACC), and Jose pipelines from Telegram.

## What already exists (do NOT recreate)

- `src/services/telegramCompanionService.js` — 17 commands already implemented. Add new cases to the existing command router.
- `src/services/hectorResearchService.js` — `runHectorLiveResearch(query)` — call this for `/research`
- `src/services/connectors/connectorImageGenerators.js` — `generateComfyUiImage({promptText})` — call this for `/image`
- `src/services/accBridgeService.js` — `sendTask(task)` — call this for `/code` (routes to OpenHands)
- `src/services/joseExecutionEngineService.js` — `runJoseCommandExecutionPipeline({commandText, source})` — call this for `/workflow`
- `src/services/connectors/connectorOutbound.js` — `sendTelegramMessage(chatId, text)` — use this to reply back

## Exact tasks

### Task A — Add 4 commands to telegramCompanionService.js

File: `src/services/telegramCompanionService.js`

Find the command router (the big `if/else if` or `switch` that handles command strings). Add after the last existing command:

```js
// /image [prompt] — triggers Miya Studio image generation via ComfyUI
if (command === '/image') {
  const prompt = args.join(' ').trim();
  if (!prompt) return reply('Usage: /image [your prompt]');
  reply('🎨 Generating image… (this may take 30-60s)');
  try {
    const result = await generateComfyUiImage({ promptText: prompt, source: 'telegram' });
    if (result?.ok && result.imageUrls?.length) {
      return reply(`✅ Image ready:\n${result.imageUrls.join('\n')}`);
    }
    return reply('⚠️ Image generation failed. Is ComfyUI running in Runtime Hub?');
  } catch (e) {
    return reply(`❌ Error: ${e.message}`);
  }
}

// /research [topic] — triggers Hector live research
if (command === '/research') {
  const topic = args.join(' ').trim();
  if (!topic) return reply('Usage: /research [topic]');
  reply(`🔍 Researching: "${topic}"…`);
  try {
    const result = await runHectorLiveResearch(topic);
    const summary = result?.summary || 'No summary available.';
    const sources = (result?.sources || []).slice(0, 3).map(s => `• ${s.title}: ${s.url}`).join('\n');
    return reply(`📋 *Research: ${topic}*\n\n${summary}${sources ? '\n\n*Sources:*\n' + sources : ''}`);
  } catch (e) {
    return reply(`❌ Research failed: ${e.message}`);
  }
}

// /code [task description] — routes to OpenHands via ACC Bridge
if (command === '/code') {
  const task = args.join(' ').trim();
  if (!task) return reply('Usage: /code [describe what you want built or fixed]');
  reply(`💻 Sending to OpenHands: "${task}"…`);
  try {
    const result = await sendTask({ description: task, source: 'telegram', agent: 'openHands' });
    return reply(`✅ Task sent to OpenHands.\n${result?.message || 'Check the Alphonso desktop for progress.'}`);
  } catch (e) {
    return reply(`❌ Failed: ${e.message}\nIs OpenHands running in Runtime Hub?`);
  }
}

// /workflow [command] — triggers Jose execution pipeline
if (command === '/workflow') {
  const commandText = args.join(' ').trim();
  if (!commandText) return reply('Usage: /workflow [natural language command for Jose]');
  reply(`⚙️ Jose is processing: "${commandText}"…`);
  try {
    const result = await runJoseCommandExecutionPipeline({ commandText: `ask jose: ${commandText}`, source: 'telegram', zeroCostMode: true });
    const summary = result?.command?.shayanReport?.summary || 'Pipeline completed.';
    return reply(`✅ *Workflow done*\n${summary}`);
  } catch (e) {
    return reply(`❌ Workflow failed: ${e.message}`);
  }
}
```

Add the required imports at the top of the file:
```js
import { generateComfyUiImage } from './connectors/connectorImageGenerators.js';
import { runHectorLiveResearch } from './hectorResearchService.js';
import { sendTask } from './agentWorkshop/accBridgeService.js';
import { runJoseCommandExecutionPipeline } from './joseExecutionEngineService.js';
```

### Task B — Update /help response

In the existing `/help` command handler, add the new commands to the help text:
```
/image [prompt] — Generate an image via Miya + ComfyUI
/research [topic] — Hector live web research
/code [task] — Send a coding task to OpenHands
/workflow [command] — Run a Jose pipeline
```

### Task C — Update ALPHONSO_GROUND_TRUTH.md

In `docs/ALPHONSO_GROUND_TRUTH.md`, find the line listing Telegram commands (currently says "17 commands") and update to "21 commands: + /image, /research, /code, /workflow".

## Verification

1. `npm run test` — all pass (add `src/test/telegramCompanionExpanded.test.js` — mock all imported services, test each new command happy path + missing args path)
2. `npm run build` — clean
3. No Rust changes needed — no `cargo check` required

## What to NOT do

- Do not create new service files — all logic delegates to existing services
- Do not change the Telegram send/receive infrastructure
- Do not add more than these 4 commands — keep it focused

---

---

# ITEM 5 — Scheduled Tasks / Cron for Jose

**Branch:** `feat/jose-scheduler`  
**Base branch:** `main`

## What this is

Adds a cron/scheduler system so Jose can run pipelines on a schedule — "every morning at 9am, research AI news and send to Telegram", "every Monday, generate a weekly report". This makes Alphonso **proactive** rather than reactive. The scheduler runs in the frontend using `setInterval` + localStorage persistence for schedule definitions.

## What already exists (do NOT recreate)

- `src/services/joseExecutionEngineService.js` — `runJoseCommandExecutionPipeline({commandText, source, zeroCostMode})` — this is what the scheduler calls
- `src/services/orchestrationQueueService.js` — existing queue with dead-letter retry — the scheduler can enqueue here instead of calling Jose directly
- `src/lib/durableStore.js` — `durableGet/Set` — use for persisting schedule definitions
- `src/components/AutomationView.jsx` — existing Automation page. Add a "Schedules" tab here.
- `src/App.tsx` — already starts background services (Sentinel scans, Ollama checks). Add scheduler init here.

## Data model

```js
// Stored at: alphonso_jose_schedules_v1
// Array of:
{
  id: string,           // uuid
  name: string,         // "Morning AI briefing"
  commandText: string,  // "ask jose: research today's AI news and send summary to Telegram"
  cronExpression: string, // "0 9 * * *" (9am daily) — human-readable only, not executed as cron
  intervalMs: number,   // computed from cronExpression for setInterval
  enabled: boolean,
  lastRunAt: number | null,  // timestamp ms
  nextRunAt: number | null,  // timestamp ms
  createdAt: number
}
```

**Note:** Do NOT use a real cron parser library. Implement a simple preset system with fixed intervals: Daily (9am → 24h interval), Weekdays (Mon-Fri 9am → check day before firing), Weekly (Monday 9am → 7 days), Hourly, Every 30 minutes. Store `intervalMs` and fire on that interval. Check `lastRunAt` to avoid double-firing after restart.

## Exact tasks

### Task A — Scheduler service

Create: `src/services/joseSchedulerService.js`

```js
import { durableGet, durableSet } from '../lib/durableStore.js';
import { runJoseCommandExecutionPipeline } from './joseExecutionEngineService.js';

const SCHEDULES_KEY = 'alphonso_jose_schedules_v1';

export const SCHEDULE_PRESETS = [
  { label: 'Every 30 minutes', intervalMs: 30 * 60 * 1000 },
  { label: 'Hourly', intervalMs: 60 * 60 * 1000 },
  { label: 'Daily (every 24h)', intervalMs: 24 * 60 * 60 * 1000 },
  { label: 'Weekly', intervalMs: 7 * 24 * 60 * 60 * 1000 },
];

export function listSchedules() {
  try { return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || '[]'); }
  catch { return []; }
}

export function saveSchedule(schedule) {
  const schedules = listSchedules();
  const idx = schedules.findIndex(s => s.id === schedule.id);
  if (idx >= 0) schedules[idx] = schedule;
  else schedules.push(schedule);
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  durableSet(SCHEDULES_KEY, JSON.stringify(schedules));
}

export function deleteSchedule(id) {
  const schedules = listSchedules().filter(s => s.id !== id);
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
}

export function createSchedule({ name, commandText, intervalMs }) {
  const schedule = {
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name, commandText, intervalMs,
    enabled: true,
    lastRunAt: null,
    nextRunAt: Date.now() + intervalMs,
    createdAt: Date.now()
  };
  saveSchedule(schedule);
  return schedule;
}

let _timerHandle = null;

export function startScheduler(onFire) {
  if (_timerHandle) return;
  _timerHandle = setInterval(async () => {
    const now = Date.now();
    const schedules = listSchedules();
    for (const sched of schedules) {
      if (!sched.enabled) continue;
      if (sched.nextRunAt && now < sched.nextRunAt) continue;
      // Fire
      sched.lastRunAt = now;
      sched.nextRunAt = now + sched.intervalMs;
      saveSchedule(sched);
      try {
        const result = await runJoseCommandExecutionPipeline({
          commandText: sched.commandText,
          source: 'scheduler',
          zeroCostMode: true
        });
        onFire?.({ scheduleId: sched.id, name: sched.name, ok: true, result });
      } catch (e) {
        onFire?.({ scheduleId: sched.id, name: sched.name, ok: false, error: e.message });
      }
    }
  }, 60_000); // check every minute
  return () => { clearInterval(_timerHandle); _timerHandle = null; };
}

export function stopScheduler() {
  if (_timerHandle) { clearInterval(_timerHandle); _timerHandle = null; }
}
```

### Task B — Start scheduler in App.tsx

File: `src/App.tsx`

Add import:
```ts
import { startScheduler } from './services/joseSchedulerService';
```

In the `useEffect` that starts background services (look for where `startScheduledScans` is called for Sentinel), add:
```ts
const stopScheduler = startScheduler(({ name, ok }) => {
  window.dispatchEvent(new CustomEvent('alphonso:toast', {
    detail: { message: ok ? `✅ Scheduled: "${name}" ran` : `⚠️ Schedule "${name}" failed`, type: ok ? 'success' : 'warning' }
  }));
});
return () => { stopScheduler?.(); };
```

### Task C — Schedules UI in AutomationView

File: `src/components/AutomationView.jsx`

Add a "Schedules" tab to the existing tab bar (look for the Builder/Operations/etc tabs). In the Schedules tab, render `<JoseSchedulerPanel />`.

Create the `JoseSchedulerPanel` component inline in AutomationView.jsx:

- List all schedules (from `listSchedules()`) in cards showing name, command, interval, last run, next run, enabled toggle
- "New Schedule" button opens a simple inline form: Name field, Command field (textarea), Interval dropdown (SCHEDULE_PRESETS), Create button
- Each schedule card has: Enable/Disable toggle, Delete button, "Run Now" button (calls `runJoseCommandExecutionPipeline` immediately)

### Task D — Add tests

Create: `src/test/joseSchedulerService.test.js`

Test:
- `createSchedule` creates with correct `nextRunAt`
- `listSchedules` reads from localStorage
- `deleteSchedule` removes by id
- `startScheduler` fires callback when `nextRunAt` is in the past (use `vi.useFakeTimers()` + `vi.advanceTimersByTime`)

## Verification

1. `npm run test` — all pass including new scheduler tests
2. `npm run build` — clean
3. Manual: AutomationView → Schedules tab — create a 30-min schedule, confirm it appears in list, Run Now fires correctly

## What to NOT do

- Do not use a real cron library (no npm install) — preset intervals only
- Do not add server-side scheduling — frontend setInterval is enough for a desktop app
- Do not touch orchestrationQueueService — call Jose directly

---

---

# ITEM 6 — File System Watcher → Echo Auto-Ingest

**Branch:** `feat/echo-file-watcher`  
**Base branch:** `main`

## What this is

A watched folder (`~/alphonso-inbox/` by default, configurable). Drop any file — PDF, Markdown, TXT, DOCX — and Alphonso automatically reads it, extracts text, summarizes it with Ollama, and saves it to Echo's memory. Makes Alphonso your personal knowledge assistant: drop meeting notes, articles, research papers → they become searchable memory.

## What already exists (do NOT recreate)

- `src-tauri/src/workspace.rs` — has `read_workspace_file`, `list_workspace_directory`, `search_workspace_files` Tauri commands — use these for file reading
- `src/services/echoMemoryService.js` — `synthesizeMemory(content, source)` — call this to save ingested content
- `src/lib/ollama.js` — `generateOllamaResponse({model, prompt})` — use for summarization
- `src/components/SettingsView.tsx` — Memory section — add watcher config here
- `src-tauri/src/lib.rs` — Tauri command registry — add new watcher commands here

## Exact tasks

### Task A — Rust: file watcher Tauri command

File: `src-tauri/src/workspace.rs`

Add two commands:

```rust
#[tauri::command]
pub fn watch_inbox_poll(inbox_dir: String) -> Result<Vec<String>, String> {
  // Returns list of new files (not yet processed) in inbox_dir
  // "Not yet processed" = not in the processed_files set stored at {inbox_dir}/.alphonso_processed
  let dir = std::path::Path::new(&inbox_dir);
  if !dir.exists() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let processed_path = dir.join(".alphonso_processed");
  let processed: std::collections::HashSet<String> = std::fs::read_to_string(&processed_path)
    .unwrap_or_default()
    .lines()
    .map(String::from)
    .collect();

  let mut new_files = Vec::new();
  if let Ok(entries) = std::fs::read_dir(dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_file() {
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        if !["txt", "md", "pdf", "docx", "json"].contains(&ext.as_str()) { continue; }
        if !processed.contains(&name) {
          new_files.push(path.to_string_lossy().to_string());
        }
      }
    }
  }
  Ok(new_files)
}

#[tauri::command]
pub fn mark_inbox_file_processed(inbox_dir: String, filename: String) -> Result<(), String> {
  let processed_path = std::path::Path::new(&inbox_dir).join(".alphonso_processed");
  let mut existing = std::fs::read_to_string(&processed_path).unwrap_or_default();
  existing.push_str(&filename);
  existing.push('\n');
  std::fs::write(&processed_path, existing).map_err(|e| e.to_string())
}
```

Register both in `src-tauri/src/lib.rs` in the `.invoke_handler(tauri::generate_handler![...])` call.

### Task B — Frontend watcher service

Create: `src/services/echoFileWatcherService.js`

```js
import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../lib/ollama.js';
import { synthesizeMemory } from './echoMemoryService.js';

const WATCHER_CONFIG_KEY = 'alphonso_echo_watcher_v1';

export function getWatcherConfig() {
  try { return JSON.parse(localStorage.getItem(WATCHER_CONFIG_KEY) || '{}'); }
  catch { return {}; }
}

export function saveWatcherConfig(config) {
  localStorage.setItem(WATCHER_CONFIG_KEY, JSON.stringify(config));
}

async function readFileText(filePath) {
  // Use existing read_workspace_file Tauri command
  return invoke('read_workspace_file', { path: filePath });
}

async function summarizeContent(filename, content) {
  const prompt = `Summarize the following document for memory storage. Extract the key facts, decisions, and insights. Be concise.\n\nFile: ${filename}\n\nContent:\n${content.slice(0, 4000)}`;
  const result = await generateOllamaResponse({ prompt });
  return result?.response || content.slice(0, 500);
}

let _watcherHandle = null;

export function startFileWatcher(onIngest) {
  if (_watcherHandle) return;
  const config = getWatcherConfig();
  if (!config.enabled || !config.inboxDir) return;

  _watcherHandle = setInterval(async () => {
    try {
      const newFiles = await invoke('watch_inbox_poll', { inboxDir: config.inboxDir });
      for (const filePath of newFiles) {
        const filename = filePath.split(/[/\\]/).pop();
        try {
          const content = await readFileText(filePath);
          if (!content?.trim()) continue;
          const summary = await summarizeContent(filename, content);
          await synthesizeMemory(summary, `file-inbox:${filename}`);
          await invoke('mark_inbox_file_processed', { inboxDir: config.inboxDir, filename });
          onIngest?.({ filename, ok: true });
        } catch (e) {
          onIngest?.({ filename, ok: false, error: e.message });
        }
      }
    } catch { /* Tauri not available or dir doesn't exist yet */ }
  }, 30_000); // poll every 30 seconds

  return () => { clearInterval(_watcherHandle); _watcherHandle = null; };
}

export function stopFileWatcher() {
  if (_watcherHandle) { clearInterval(_watcherHandle); _watcherHandle = null; }
}
```

### Task C — Start watcher in App.tsx

File: `src/App.tsx`

```ts
import { startFileWatcher } from './services/echoFileWatcherService';
// In the background services useEffect:
const stopWatcher = startFileWatcher(({ filename, ok }) => {
  window.dispatchEvent(new CustomEvent('alphonso:toast', {
    detail: { message: ok ? `📄 Echo ingested: ${filename}` : `⚠️ Failed to ingest ${filename}`, type: ok ? 'success' : 'warning' }
  }));
});
return () => { stopWatcher?.(); };
```

### Task D — Config UI in SettingsView Memory section

File: `src/components/SettingsView.tsx`

At the top of the Memory section (before EchoTimeline), add an inbox folder configuration card:

- Toggle: "Enable file inbox watcher"
- Folder path input (text field, defaults to `C:\Users\{username}\alphonso-inbox`)
- "Browse" button using existing `pick_folder` invoke pattern (see how Output Folder is done in the same file)
- Status: "Watching X files" or "Watcher disabled"
- Save button

## Verification

1. `cargo check` — clean
2. `npm run test` — all pass (add `src/test/echoFileWatcherService.test.js` — mock invoke and echoMemoryService, test polling logic)
3. `npm run build` — clean
4. Manual: Enable watcher in Settings, drop a .txt file in inbox folder, within 30s confirm Echo memory contains summary

## What to NOT do

- Do not use native Rust file system events (notify crate) — polling every 30s is sufficient and simpler
- Do not handle ZIP or RAR files in this PR
- Do not delete files from inbox after processing — only mark them processed in `.alphonso_processed`

---

---

# ITEM 7 — Expose Alphonso as an MCP Server

**Branch:** `feat/alphonso-mcp-server`  
**Base branch:** `main`

## What this is

MCP (Model Context Protocol) is an open standard that lets AI tools (Claude Desktop, Cursor, Windsurf, Zed, etc.) call external tools and agents. By exposing Alphonso as an MCP server, every AI coding tool can call Alphonso's 9 agents, run Jose pipelines, search Echo memory, and trigger workflows — from inside their own chat interface. One implementation = Alphonso callable from everywhere.

## Architecture

An MCP server is an HTTP server (or stdio process) that responds to JSON-RPC calls with a specific schema. The simplest approach: a FastAPI Python server (small, like voice/backend/) that exposes MCP-compatible endpoints and calls Alphonso's services via the same localhost API that the voice backend uses.

**Alternative (recommended):** A Node.js/Express server (no new language runtime needed since Node is already used). Put it in `mcp-server/` at the repo root, similar to `gateway/whatsapp-cloud/`.

## MCP tools to expose

| MCP Tool Name | What it does | Alphonso service called |
|---|---|---|
| `alphonso_run_pipeline` | Run a Jose pipeline with a command | `runJoseCommandExecutionPipeline` via HTTP |
| `alphonso_search_memory` | Search Echo memory | `listMemoryItems` + filter |
| `alphonso_research` | Hector live research | `runHectorLiveResearch` |
| `alphonso_get_agents` | List agent status | connector registry status |
| `alphonso_get_receipts` | Get recent orchestration receipts | `listOrchestrationReceipts` |

## Exact tasks

### Task A — MCP server (Node.js)

Create directory: `mcp-server/`

Create: `mcp-server/package.json`
```json
{
  "name": "alphonso-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.18.0" }
}
```

Create: `mcp-server/server.js`

```js
import express from 'express';

const app = express();
app.use(express.json());

const PORT = Number(process.env.MCP_PORT || 3333);
// Alphonso exposes a local API bridge — this is the URL
// In practice, the MCP server reads from shared localStorage via the Alphonso
// frontend, or Alphonso exposes a tiny HTTP bridge (see Task B).
const ALPHONSO_BRIDGE = process.env.ALPHONSO_BRIDGE_URL || 'http://localhost:4444';

// MCP manifest
app.get('/', (req, res) => res.json({
  name: 'alphonso',
  version: '1.0.0',
  description: 'Alphonso AI ecosystem — 9 agents, memory, research, pipelines',
  tools: [
    {
      name: 'alphonso_run_pipeline',
      description: 'Run a Jose orchestration pipeline. Decomposes the command across 9 specialist AI agents.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Natural language command, e.g. "research AI news and summarize"' },
          zeroCostMode: { type: 'boolean', description: 'Use only local models (default true)' }
        },
        required: ['command']
      }
    },
    {
      name: 'alphonso_search_memory',
      description: 'Search Echo memory for relevant stored knowledge.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query']
      }
    },
    {
      name: 'alphonso_research',
      description: 'Run Hector live web research on a topic.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' } },
        required: ['topic']
      }
    }
  ]
}));

// MCP tool call handler
app.post('/call', async (req, res) => {
  const { tool, input } = req.body;
  try {
    const r = await fetch(`${ALPHONSO_BRIDGE}/tool/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const result = await r.json();
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '127.0.0.1', () => console.log(`Alphonso MCP server running on :${PORT}`));
```

### Task B — Alphonso HTTP bridge (tiny Express server embedded in the Tauri app)

This is the local HTTP server that the MCP server calls. It translates HTTP requests into calls to Alphonso's frontend services.

Create: `src/services/alphonsoBridgeServer.js`

This runs inside the Tauri webview context using `XMLHttpRequest`/`fetch` loops. Because Tauri webview can't bind a TCP port directly, the bridge runs as a **separate Node.js process** launched via Tauri sidecar, similar to voice/backend/.

Place the bridge at: `bridge/server.js`

```js
// bridge/server.js — lightweight HTTP bridge for MCP
import express from 'express';
import { createRequire } from 'module';

const app = express();
app.use(express.json());
const PORT = 4444;

// These endpoints are called by the MCP server
// They read from the same localStorage via a shared SQLite file (kv_store)
// For now, return placeholder responses — wire to real kv_store in Phase 2

app.post('/tool/alphonso_run_pipeline', (req, res) => {
  // In Phase 2: write request to kv_store, Alphonso frontend polls and executes
  res.json({ ok: true, message: `Pipeline queued: ${req.body.command}`, note: 'Full execution requires Alphonso desktop to be open.' });
});

app.post('/tool/alphonso_search_memory', (req, res) => {
  res.json({ ok: true, results: [], note: 'Connect to running Alphonso instance for live results.' });
});

app.post('/tool/alphonso_research', (req, res) => {
  res.json({ ok: true, message: `Research task queued: ${req.body.topic}` });
});

app.listen(PORT, '127.0.0.1', () => console.log(`Alphonso bridge on :${PORT}`));
```

**Note for the implementing agent:** The full bidirectional bridge (MCP → kv_store → Alphonso frontend polls → executes → writes result → MCP reads result) is Phase 2. This PR ships the MCP server structure and the bridge skeleton. The manifest and tool schema must be correct and working.

### Task C — Add MCP server to Runtime Hub

File: `src-tauri/src/runtime_manager.rs`

```rust
ToolDef {
  name: "mcp-server",
  display_name: "MCP Server",
  description: "Exposes Alphonso as an MCP tool server — callable from Claude Desktop, Cursor, Windsurf, and any MCP-compatible AI tool",
  repo_url: None,
  pip_packages: &[],
  requirements_file: None,
  port: Some(3333),
  health_path: None,
  exe: "node",
  args: &["mcp-server/server.js"],
},
```

TOOL_META in `RuntimeManagerView.jsx`:
```js
'mcp-server': {
  icon: Server,
  category: 'Integration',
  docsUrl: 'https://modelcontextprotocol.io',
  color: 'text-purple-400',
  bg: 'bg-purple-500/10 border-purple-500/20',
},
```

### Task D — Setup instructions in SettingsView

In SettingsView, under the Connectors section, add a read-only info card:

```
MCP Server — Connect to Claude Desktop, Cursor, Windsurf
1. Start MCP Server in Runtime Hub
2. Add to your MCP client config:
   {"mcpServers": {"alphonso": {"url": "http://localhost:3333"}}}
3. Alphonso's agents become available as tools in your AI editor
```

## Verification

1. `npm run build` (for mcp-server: `npm install && node server.js` in `mcp-server/`)
2. `npm run test` — all existing pass
3. Manual: Start MCP server via Runtime Hub. `curl http://localhost:3333/` returns the tool manifest JSON.
4. Manual: `curl -X POST http://localhost:3333/call -d '{"tool":"alphonso_run_pipeline","input":{"command":"test"}}' -H 'Content-Type: application/json'` returns a response.

## What to NOT do

- Do not implement full kv_store bidirectional sync in this PR — Phase 2
- Do not add authentication in this PR — localhost only, auth is Phase 2
- Do not use stdio MCP transport — HTTP is simpler and works the same way

---

---

# ITEM 8 — Whisper Meeting Transcription → Echo Memory

**Branch:** `feat/whisper-meeting-ingest`  
**Base branch:** `main`

## What this is

Whisper is already in the Runtime Hub. This feature adds a "Transcribe Meeting" drop zone in the UI: drag in an audio file (MP3, WAV, M4A, MP4) → Whisper transcribes it → Ollama summarizes key decisions and action items → Echo saves it to memory. Your meeting notes become searchable AI memory automatically.

## What already exists (do NOT recreate)

- `src-tauri/src/runtime_manager.rs` — Whisper is already in TOOLS as a CLI tool. The `runtime_start_tool` command can invoke it.
- `src/services/echoMemoryService.js` — `synthesizeMemory(content, source)` — save the transcript summary here
- `src/lib/ollama.js` — `generateOllamaResponse({prompt})` — summarize the transcript
- `src/components/SettingsView.tsx` — Memory section — add transcription UI here
- Existing Tauri file-reading infrastructure in `workspace.rs`

## Exact tasks

### Task A — Rust: run Whisper on a file

File: `src-tauri/src/workspace.rs`

Add command:
```rust
#[tauri::command]
pub async fn transcribe_audio_file(audio_path: String, model: Option<String>) -> Result<String, String> {
  let model_name = model.as_deref().unwrap_or("base");
  // Find whisper in venv or PATH
  let whisper_exe = crate::runtime_manager::resolve_tool_exe("whisper")
    .ok_or_else(|| "Whisper not found. Install it via Runtime Hub.".to_string())?;

  let output = tokio::process::Command::new(&whisper_exe)
    .args([
      &audio_path,
      "--model", model_name,
      "--output_format", "txt",
      "--output_dir", std::env::temp_dir().to_str().unwrap_or("/tmp"),
    ])
    .output()
    .await
    .map_err(|e| e.to_string())?;

  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).to_string());
  }

  // Whisper writes to {audio_filename}.txt in output_dir — read it
  let audio_stem = std::path::Path::new(&audio_path)
    .file_stem().unwrap_or_default()
    .to_string_lossy();
  let txt_path = std::env::temp_dir().join(format!("{}.txt", audio_stem));
  std::fs::read_to_string(&txt_path).map_err(|e| e.to_string())
}
```

Register in `lib.rs`.

### Task B — Frontend transcription service

Create: `src/services/whisperTranscriptionService.js`

```js
import { invoke } from '@tauri-apps/api/core';
import { generateOllamaResponse } from '../lib/ollama.js';
import { synthesizeMemory } from './echoMemoryService.js';

export async function transcribeAndIngest(audioFilePath, filename, onProgress) {
  onProgress?.('transcribing');
  const transcript = await invoke('transcribe_audio_file', {
    audioPath: audioFilePath,
    model: 'base'
  });

  onProgress?.('summarizing');
  const prompt = `You are extracting key information from a meeting transcript. Extract:
1. Key decisions made
2. Action items and who owns them  
3. Main topics discussed
4. Any important numbers or deadlines

Meeting transcript:
${transcript.slice(0, 6000)}

Format as concise bullet points.`;

  const summary = await generateOllamaResponse({ prompt });
  const summaryText = summary?.response || transcript.slice(0, 1000);

  onProgress?.('saving');
  await synthesizeMemory(
    `MEETING TRANSCRIPT: ${filename}\n\nSUMMARY:\n${summaryText}\n\nFULL TRANSCRIPT:\n${transcript.slice(0, 2000)}`,
    `meeting-transcript:${filename}`
  );

  return { transcript, summary: summaryText };
}
```

### Task C — UI in SettingsView Memory section

File: `src/components/SettingsView.tsx`

Add a `MeetingTranscriptionPanel` component and render it in the Memory section, above EchoTimeline:

```tsx
function MeetingTranscriptionPanel() {
  const [status, setStatus] = useState<'idle' | 'transcribing' | 'summarizing' | 'saving' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ filename: string; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setStatus('transcribing');
    setError(null);
    try {
      // Write file to temp location, get path
      // Use existing open_file_dialog or accept via drag
      const { transcribeAndIngest } = await import('../services/whisperTranscriptionService.js');
      // Note: In Tauri, file.path is available via the file input
      const path = (file as any).path || file.name;
      const res = await transcribeAndIngest(path, file.name, setStatus as any);
      setResult({ filename: file.name, summary: res.summary });
      setStatus('done');
    } catch (e: any) {
      setError(e.message);
      setStatus('error');
    }
  };

  return (
    <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-3">
      <div className="text-sm font-semibold text-white flex items-center gap-2">
        <Mic className="w-4 h-4 text-indigo-400" /> Meeting Transcription → Echo Memory
      </div>
      <p className="text-xs text-zinc-500">Drop an audio file (MP3, WAV, M4A). Whisper transcribes it, Ollama summarizes it, Echo remembers it.</p>
      <input ref={fileRef} type="file" accept=".mp3,.wav,.m4a,.mp4,.ogg,.webm" className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <button onClick={() => fileRef.current?.click()}
        disabled={status !== 'idle' && status !== 'done' && status !== 'error'}
        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 text-white text-xs rounded-xl transition-colors">
        {status === 'idle' || status === 'done' || status === 'error' ? 'Choose Audio File' : `${status}…`}
      </button>
      {result && <div className="text-xs text-emerald-400">✓ {result.filename} saved to Echo memory</div>}
      {error && <div className="text-xs text-red-400">✗ {error} — Is Whisper installed in Runtime Hub?</div>}
    </div>
  );
}
```

## Verification

1. `cargo check` — clean
2. `npm run test` — all pass
3. `npm run build` — clean
4. Manual: Install Whisper via Runtime Hub. Drop a short WAV file. Confirm Echo memory contains the summary.

## What to NOT do

- Do not stream the Whisper output — wait for the full transcript (Whisper CLI doesn't stream)
- Do not add speaker diarization in this PR
- Do not use the Tauri sidecar mechanism — call Whisper CLI directly via `Command::new`

---

---

# ITEM 9 — Perplexity API as Hector Tier-2 Fallback

**Branch:** `feat/perplexity-hector`  
**Base branch:** `main`

## What this is

Hector's current research fallback chain: **Brave Search → DuckDuckGo HTML scrape → RSS feeds**. Perplexity has a cheap API (~$5/mo, 1000 requests) that returns real-time web answers with citations. Adding it between Brave and DDG gives Hector a high-quality fallback when Brave API key is missing or quota-exceeded. Single new connector, plugs into existing chain.

## What already exists (do NOT recreate)

- `src/services/hectorResearchService.js` — the main research service. Has `runHectorLiveResearch(query)`, `fetchRssSources()`, fallback chain logic. **This is the only file that changes significantly.**
- `src/components/ConnectorSetupPanel.jsx` — `CredentialSection` pattern — add Perplexity key here
- `src/services/connectors/connectorAuth.js` — `getConnectorCredential` — read key from here

## Exact tasks

### Task A — Perplexity connector

Create: `src/services/connectors/perplexityConnector.js`

```js
import { getConnectorCredential } from './connectorAuth.js';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

export function isPerplexityConfigured() {
  return Boolean(getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY'));
}

export async function searchPerplexity(query, { maxTokens = 512 } = {}) {
  const apiKey = getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY');
  if (!apiKey) throw new Error('Perplexity API key not configured');

  const r = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{ role: 'user', content: query }],
      max_tokens: maxTokens,
      return_citations: true
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Perplexity API error ${r.status}: ${err}`);
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];

  return {
    summary: content,
    sources: citations.map((url, i) => ({ url, title: `Source ${i + 1}`, relevance: 0.8 })),
    confidenceLevel: 'high',
    provider: 'perplexity'
  };
}
```

### Task B — Wire into hectorResearchService.js

File: `src/services/hectorResearchService.js`

Add import at top:
```js
import { searchPerplexity, isPerplexityConfigured } from './connectors/perplexityConnector.js';
```

Find the fallback chain in `runHectorLiveResearch`. It will look something like:
```js
// Try Brave
// If fails → try DDG
// If fails → try RSS
```

Insert Perplexity between Brave and DDG:
```js
// After Brave fails and before DDG:
if (isPerplexityConfigured()) {
  try {
    const result = await searchPerplexity(query);
    if (result?.summary) return result;
  } catch (e) {
    // Perplexity failed, continue to DDG
  }
}
```

### Task C — Credential UI in ConnectorSetupPanel

File: `src/components/ConnectorSetupPanel.jsx`

Add state:
```js
const [perplexityApiKey, setPerplexityApiKey] = useState(() => getConnectorCredential('perplexity', 'PERPLEXITY_API_KEY'));
```

Add CredentialSection after the Brave Search section:
```jsx
{/* Perplexity */}
<CredentialSection
  title="Perplexity (Hector Fallback)"
  icon={Search}
  borderColor="border-sky-300/20"
  bgColor="bg-sky-500/8"
  accentColor="text-sky-400"
  fields={[{ label: 'API Key', placeholder: 'pplx-...', value: perplexityApiKey, onChange: setPerplexityApiKey, key: 'PERPLEXITY_API_KEY' }]}
  onSave={() => saveConnectorApiKey('perplexity', { PERPLEXITY_API_KEY: perplexityApiKey })}
  hint="~$5/month for 1,000 searches. Get your key at perplexity.ai/settings/api. Hector uses this when Brave Search is unavailable or quota-exceeded."
  savedLabel="Perplexity key saved"
/>
```

### Task D — Tests

Create: `src/test/perplexityConnector.test.js`

Test:
- `isPerplexityConfigured()` returns false when no key set
- `searchPerplexity` builds correct request (mock fetch)
- `searchPerplexity` parses citations from response
- `searchPerplexity` throws on non-ok response

## Verification

1. `npm run test` — all pass including new connector tests
2. `npm run build` — clean
3. Manual: Add Perplexity key in Settings → Connectors. Ask Hector a question without Brave key configured. Confirm Perplexity is used (check browser network tab or add a console.log).

## What to NOT do

- Do not make Perplexity the primary research source — it's a fallback
- Do not add rate limiting logic in this PR — Perplexity handles it server-side
- Do not change the RSS fallback position in the chain

---

---

# Notes for the Controller (Claude Code)

When each branch comes in for review:

1. Run `npm run test` — all 1930+ must pass, plus any new tests the agent added
2. Run `cargo check` from `src-tauri/` — for items touching Rust (1, 2, 3, 6, 8)
3. Run `npm run build` — must complete without errors
4. Check: did the agent read `docs/ALPHONSO_GROUND_TRUTH.md`? Did they accidentally recreate something from the Do Not Duplicate table in `CLAUDE.md`?
5. Merge to `main` only after all three checks pass
6. Update `docs/ALPHONSO_GROUND_TRUTH.md` last-verified line and `docs/CHANGELOG.md` with each merged feature

**Branch naming is fixed — do not deviate:**
- `feat/openhand-runtime`
- `feat/chromadb-echo`
- `feat/n8n-runtime`
- `feat/telegram-mobile-control`
- `feat/jose-scheduler`
- `feat/echo-file-watcher`
- `feat/alphonso-mcp-server`
- `feat/whisper-meeting-ingest`
- `feat/perplexity-hector`
