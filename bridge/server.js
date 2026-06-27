/**
 * Alphonso Bridge — HTTP server
 * Default port: 4444. Override via ALPHONSO_BRIDGE_PORT env var.
 * Called by the MCP server. Routes tool calls to Ollama for live responses.
 */

import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Default port 4444; override with ALPHONSO_BRIDGE_PORT env var
const PORT = Number(process.env.ALPHONSO_BRIDGE_PORT || process.env.BRIDGE_PORT || 4444);
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

async function ollamaChat(systemPrompt, userMessage) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
}

async function isOllamaOnline() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return { online: true, models: (data.models || []).map(m => m.name) };
  } catch {
    return { online: false, models: [] };
  }
}

// ── Tool endpoints ────────────────────────────────────────────────────────────

app.post('/tool/alphonso_run_pipeline', async (req, res) => {
  const { command, zeroCostMode = true } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command is required' });

  try {
    const reply = await ollamaChat(
      'You are Alphonso, an AI ecosystem assistant. The user has sent a command via the MCP bridge. Execute the task and provide a clear, helpful response. Keep it concise.',
      command
    );
    res.json({ ok: true, result: reply, provider: 'ollama', model: OLLAMA_MODEL, zeroCostMode });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: `Ollama unavailable: ${err.message}`,
      hint: 'Start Ollama or open the Alphonso Runtime Hub to launch it.'
    });
  }
});

app.post('/tool/alphonso_search_memory', async (req, res) => {
  const { query, limit = 10 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query is required' });

  try {
    const reply = await ollamaChat(
      'You are a memory retrieval assistant for the Alphonso AI ecosystem. The user is searching their personal memory store. Provide a helpful summary of what you know about the topic based on general context. Note that live memory sync requires the Alphonso desktop app.',
      `Search my memory for: ${query}`
    );
    res.json({
      ok: true,
      query,
      results: [{ content: reply, source: 'ollama-synthesis', relevance: 0.8 }],
      note: 'Results synthesized by Ollama. Live memory sync requires Alphonso desktop running.',
      limit
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: `Ollama unavailable: ${err.message}`, results: [] });
  }
});

app.post('/tool/alphonso_research', async (req, res) => {
  const { topic } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  try {
    const reply = await ollamaChat(
      'You are Hector, the research agent in the Alphonso AI ecosystem. Provide a thorough research summary on the given topic. Include key facts, context, and relevant insights. Structure your response clearly.',
      `Research topic: ${topic}`
    );
    res.json({ ok: true, topic, summary: reply, provider: 'ollama', model: OLLAMA_MODEL });
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: `Ollama unavailable: ${err.message}`,
      hint: 'Start Ollama or use Brave Search via the Alphonso desktop app.'
    });
  }
});

app.post('/tool/alphonso_get_status', async (req, res) => {
  const ollamaStatus = await isOllamaOnline();
  res.json({
    ok: true,
    status: {
      bridge: 'online',
      bridgePort: PORT,
      ollama: ollamaStatus.online ? 'online' : 'offline',
      ollamaModels: ollamaStatus.models || [],
      ollamaBase: OLLAMA_BASE
    }
  });
});

app.post('/tool/alphonso_get_receipts', (req, res) => {
  res.json({
    ok: true,
    receipts: [],
    note: 'Receipt sync requires Alphonso frontend connection. Coming in Phase 2.'
  });
});

// ── Module registry ───────────────────────────────────────────────────────────
// Returns an empty list — module state lives in the Tauri frontend's localStorage.
// This route satisfies runtimeApiService.listModulesRemote() so it doesn't always
// 404-then-fallback silently.
app.get('/modules', (_req, res) => {
  res.json([]);
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  const ollamaStatus = await isOllamaOnline();
  res.json({ ok: true, port: PORT, ollama: ollamaStatus });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Alphonso bridge running on http://localhost:${PORT}`);
  console.log(`Ollama target: ${OLLAMA_BASE} (model: ${OLLAMA_MODEL})`);
});
