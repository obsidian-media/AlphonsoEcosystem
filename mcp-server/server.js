/**
 * Alphonso MCP Server
 * Exposes Alphonso's 9 agents as MCP tools callable from Claude Desktop, Cursor, Windsurf, etc.
 *
 * Usage:
 *   cd mcp-server && npm install && node server.js
 *
 * Add to your MCP client config:
 *   { "mcpServers": { "alphonso": { "url": "http://localhost:3333" } } }
 *
 * Alphonso desktop must be running for live results.
 * The bridge at http://localhost:4444 connects this server to the running Alphonso frontend.
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = Number(process.env.MCP_PORT || 3333);
const BRIDGE_URL = process.env.ALPHONSO_BRIDGE_URL || 'http://localhost:4444';

// ── MCP tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'alphonso_run_pipeline',
    description: 'Run a Jose orchestration pipeline. Decomposes the command across 9 specialist AI agents (Hector research, Miya creative, Maria governance, Echo memory, etc.). Returns a summary when complete.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Natural language command, e.g. "research AI news and summarize", "create a campaign plan for product X"' },
        zeroCostMode: { type: 'boolean', description: 'Use only local Ollama models (default: true)' }
      },
      required: ['command']
    }
  },
  {
    name: 'alphonso_search_memory',
    description: 'Search Echo memory for relevant stored knowledge, decisions, research findings, and past work. Uses semantic search via ChromaDB when available, falls back to keyword search.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "launch plan decisions", "AI research notes"' },
        limit: { type: 'number', description: 'Max results to return (default: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'alphonso_research',
    description: 'Run Hector live web research on a topic. Returns a structured summary with cited sources.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Research topic, e.g. "latest developments in AI agents 2026"' }
      },
      required: ['topic']
    }
  },
  {
    name: 'alphonso_get_status',
    description: 'Get Alphonso system status: Ollama online/offline, pending approvals, recent agent activity, Jose commands today.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'alphonso_get_receipts',
    description: 'Get recent orchestration receipts — completed agent tasks with their results and timing.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of receipts to return (default: 10)' }
      }
    }
  }
];

// ── MCP manifest endpoint ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    name: 'alphonso',
    version: '1.0.0',
    description: 'Alphonso AI ecosystem — 9 specialist agents, memory, research, orchestration pipelines. Requires Alphonso desktop running.',
    tools: TOOLS
  });
});

// ── Tool call handler ─────────────────────────────────────────────────────────

app.post('/call', async (req, res) => {
  const { tool, input } = req.body || {};
  if (!tool) return res.status(400).json({ error: 'Missing tool name' });

  try {
    const r = await fetch(`${BRIDGE_URL}/tool/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {})
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: `Bridge error ${r.status}: ${text}` });
    }
    const result = await r.json();
    res.json({ result });
  } catch (e) {
    res.status(503).json({
      error: `Could not reach Alphonso bridge at ${BRIDGE_URL}. Make sure Alphonso desktop is running.`,
      detail: e.message
    });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true, port: PORT, bridge: BRIDGE_URL }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Alphonso MCP server running on http://localhost:${PORT}`);
  console.log(`Tool manifest: http://localhost:${PORT}/`);
  console.log(`Bridge: ${BRIDGE_URL}`);
});
