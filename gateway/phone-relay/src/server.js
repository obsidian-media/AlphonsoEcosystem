// The phone relay's HTTP and WebSocket server.
//   WebSocket /link: first message { type: 'hello', idToken, deviceId, role, fcmToken? },
//     then { type: 'to', deviceId, frame } and { type: 'push', deviceId, sealed }.
//   POST /pair { idToken, computerId, phoneDeviceId }, DELETE /pair/:phoneDeviceId
//     (Authorization: Bearer <idToken>), GET /healthz.
// Nothing here reads a frame's contents; logs carry no tokens, frames or device names.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { createRelay } from './routing.js';
import { createLimiter, LIMITS } from './limits.js';

const HELLO_WAIT_MS = 10_000;
const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createServer({ verifyToken, store, push, limits = LIMITS, now }) {
  const relay = createRelay({ verifyToken, store, limiter: createLimiter(limits), now, push });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://relay');
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') return reply(res, 200, { ok: true });
      if (req.method === 'POST' && url.pathname === '/pair') {
        const body = await readJson(req);
        await relay.pair(body);
        return reply(res, 200, { ok: true });
      }
      const m = url.pathname.match(/^\/pair\/([A-Za-z0-9_-]{1,128})$/);
      if (req.method === 'DELETE' && m) {
        const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        await relay.removePair({ idToken, phoneDeviceId: m[1] });
        return reply(res, 200, { ok: true });
      }
      return reply(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      return reply(res, 400, { ok: false, error: String(error?.message || 'Refused.') });
    }
  });

  const wss = new WebSocketServer({ server, path: '/link', maxPayload: limits.maxFrameChars + 4096 });
  wss.on('connection', (socket) => {
    const conn = {
      send(obj) { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj)); },
      close(code) { socket.close(code); },
    };
    let greeted = false;
    const timer = setTimeout(() => { if (!greeted) socket.close(4401); }, HELLO_WAIT_MS);
    let queue = Promise.resolve();
    socket.on('message', (data) => {
      queue = queue.then(async () => {
        let msg;
        try { msg = JSON.parse(String(data)); } catch { conn.send({ type: 'error', reason: 'bad_message' }); return; }
        if (!greeted) {
          if (msg?.type !== 'hello') { socket.close(4401); return; }
          greeted = true;
          clearTimeout(timer);
          await relay.hello(conn, msg);
          return;
        }
        await relay.message(conn, msg);
      }).catch(() => conn.send({ type: 'error', reason: 'relay_error' }));
    });
    socket.on('close', () => { clearTimeout(timer); queue.then(() => relay.closed(conn)); });
  });
  return { server, relay };
}

// Run as a service: Firebase from the environment (Cloud Run's own service account).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { initFirebase } = await import('./firebase.js');
  const deps = await initFirebase();
  const port = Number(process.env.PORT || 8080);
  createServer(deps).server.listen(port, () => console.log(JSON.stringify({ event: 'listening', port })));
}
