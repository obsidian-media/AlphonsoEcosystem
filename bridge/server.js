/**
 * Alphonso Bridge — HTTP server on port 4444
 * Called by the MCP server, queues tasks for the Alphonso frontend to pick up.
 *
 * Phase 1: Returns informative queued-task responses.
 * Phase 2 (future): Write to SQLite kv_store, frontend polls, reads result back.
 */

import express from 'express';

const app = express();
app.use(express.json());

const PORT = Number(process.env.BRIDGE_PORT || 4444);

// In-memory task queue (Phase 1 — no persistence yet)
const taskQueue = [];
const taskResults = new Map();

function queueTask(type, input) {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  taskQueue.push({ id, type, input, createdAt: Date.now(), status: 'queued' });
  return id;
}

// ── Tool endpoints ────────────────────────────────────────────────────────────

app.post('/tool/alphonso_run_pipeline', (req, res) => {
  const { command, zeroCostMode = true } = req.body || {};
  if (!command) return res.status(400).json({ error: 'command is required' });
  const id = queueTask('pipeline', { command, zeroCostMode });
  res.json({
    ok: true,
    taskId: id,
    message: `Pipeline queued: "${command.slice(0, 80)}"`,
    note: 'Open Alphonso desktop to see the task execute. Results appear in the Activity tab.',
    zeroCostMode
  });
});

app.post('/tool/alphonso_search_memory', (req, res) => {
  const { query, limit = 10 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query is required' });
  res.json({
    ok: true,
    query,
    results: [],
    note: 'Live memory search requires Alphonso desktop running with the bridge wired to its kv_store. Coming in Phase 2.',
    suggestion: `Open Alphonso → Settings → Memory and search for "${query}" directly.`
  });
});

app.post('/tool/alphonso_research', (req, res) => {
  const { topic } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'topic is required' });
  const id = queueTask('research', { topic });
  res.json({
    ok: true,
    taskId: id,
    message: `Research task queued: "${topic}"`,
    note: 'Hector will run this when Alphonso processes the queue. Check the Activity tab in Alphonso desktop.'
  });
});

app.post('/tool/alphonso_get_status', (req, res) => {
  res.json({
    ok: true,
    status: {
      bridge: 'online',
      bridgePort: PORT,
      queuedTasks: taskQueue.length,
      note: 'Full status (Ollama health, agent activity) requires the Alphonso frontend to be connected.'
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

// ── Queue inspection (for debugging) ─────────────────────────────────────────

app.get('/queue', (req, res) => res.json({ tasks: taskQueue.slice(-20) }));
app.get('/health', (req, res) => res.json({ ok: true, port: PORT, queuedTasks: taskQueue.length }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Alphonso bridge running on http://localhost:${PORT}`);
  console.log(`Queue: http://localhost:${PORT}/queue`);
});
