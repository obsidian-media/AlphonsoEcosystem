// A stand-in Hermes API server for the desktop check (Hermes gateway, 2026-10-30).
// It answers the parts of Hermes 0.19's API server Alphonso uses: /health,
// /v1/models, POST /v1/runs, the run's event stream, /approval and /stop, and
// records every call. What a run does depends on its input:
//   "approve-me" → once armed (armApproval()), a tool starts, then it asks to run
//                  `ls build` and waits for the answer: "once" finishes with "Done after
//                  approval.", "deny" with "I did not run it." One step can make several
//                  model calls, so only the first such run after arming asks.
//   "keep-going" → a tool starts and the run keeps going until it is stopped.
//   anything else → answers at once.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export async function startHermesStandIn({ key }) {
  const runs = new Map();
  let armed = false;
  const calls = { runs: [], approvals: [], stops: [] };

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const authorized = (req) => req.headers.authorization === `Bearer ${key}`;
  const readBody = (req) => new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
  const emit = (run, event) => {
    run.events.push(event);
    for (const res of run.listeners) res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (/^run\.(completed|failed|cancelled)$/.test(event.event)) {
      for (const res of run.listeners) res.end();
      run.listeners.clear();
      run.done = true;
    }
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url.pathname === '/v1/models') return send(res, 200, { data: [{ id: 'hermes-agent' }] });

    if (req.method === 'POST' && url.pathname === '/v1/runs') {
      const body = await readBody(req);
      const id = `run_${randomUUID().slice(0, 8)}`;
      const input = String(body.input || '');
      const run = { id, input, events: [], listeners: new Set(), done: false };
      runs.set(id, run);
      calls.runs.push({ id, input, instructions: body.instructions || null, sessionId: body.session_id || null });
      setTimeout(() => {
        if (input.includes('approve-me') && armed) {
          armed = false;
          run.asks = true;
          emit(run, { event: 'tool.started', tool: 'terminal', preview: 'ls build' });
          emit(run, { event: 'approval.request', command: 'ls build', description: 'List the build folder', choices: ['once', 'session', 'always', 'deny'] });
        } else if (input.includes('keep-going')) {
          emit(run, { event: 'tool.started', tool: 'web_search', preview: 'bees' });
        } else {
          emit(run, { event: 'message.delta', delta: 'Hello from Hermes.' });
          emit(run, { event: 'run.completed', output: 'Hello from Hermes.' });
        }
      }, 200);
      return send(res, 202, { run_id: id, status: 'started' });
    }

    const match = url.pathname.match(/^\/v1\/runs\/([^/]+)\/(events|approval|stop)$/);
    const run = match && runs.get(match[1]);
    if (!run) return send(res, 404, { error: 'no such run' });

    if (req.method === 'GET' && match[2] === 'events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      for (const event of run.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (run.done) return res.end();
      run.listeners.add(res);
      const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 5000);
      res.on('close', () => { clearInterval(keepAlive); run.listeners.delete(res); });
      return undefined;
    }
    if (req.method === 'POST' && match[2] === 'approval') {
      const body = await readBody(req);
      const waiting = run.asks && !run.answered;
      if (!waiting || run.done) return send(res, 409, { error: 'no pending approval' });
      run.answered = true;
      calls.approvals.push({ runId: run.id, choice: body.choice });
      send(res, 200, { ok: true });
      const text = body.choice === 'once' ? 'Done after approval.' : 'I did not run it.';
      if (body.choice === 'once') emit(run, { event: 'tool.completed', tool: 'terminal' });
      emit(run, { event: 'message.delta', delta: text });
      emit(run, { event: 'run.completed', output: text });
      return undefined;
    }
    if (req.method === 'POST' && match[2] === 'stop') {
      calls.stops.push(run.id);
      send(res, 200, { ok: true });
      if (!run.done) emit(run, { event: 'run.cancelled' });
      return undefined;
    }
    return send(res, 404, { error: 'not found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    calls,
    armApproval: () => { armed = true; },
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
