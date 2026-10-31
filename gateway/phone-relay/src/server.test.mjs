// Run with: node --test gateway/phone-relay/src/server.test.mjs
// The real HTTP and WebSocket server, with stand-ins for Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from './server.js';
import { createMemoryStore } from './memoryStore.js';

const verifyToken = async (t) => { if (t !== 'tok-ann') throw new Error('bad'); return 'ann'; };

async function start() {
  const { server } = createServer({ verifyToken, store: createMemoryStore(), push: async () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `127.0.0.1:${server.address().port}`;
  return { server, base };
}

function socket(base) {
  const ws = new WebSocket(`ws://${base}/link`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  const next = () => new Promise((r) => { const m = inbox.shift(); if (m) r(m); else waiters.push(r); });
  const opened = new Promise((r) => ws.on('open', r));
  const closed = new Promise((r) => ws.on('close', (code) => r(code)));
  return { ws, next, opened, closed, send: (o) => ws.send(JSON.stringify(o)) };
}

test('health, pairing and a forwarded frame over the real server', async () => {
  const { server, base } = await start();
  try {
    assert.equal((await fetch(`http://${base}/healthz`)).status, 200);
    const pc = socket(base);
    await pc.opened;
    pc.send({ type: 'hello', idToken: 'tok-ann', deviceId: 'pc-1', role: 'computer' });
    assert.deepEqual(await pc.next(), { type: 'ready' });
    const pair = await fetch(`http://${base}/pair`, { method: 'POST', body: JSON.stringify({ idToken: 'tok-ann', computerId: 'pc-1', phoneDeviceId: 'ph-1' }) });
    assert.equal(pair.status, 200);
    const ph = socket(base);
    await ph.opened;
    ph.send({ type: 'hello', idToken: 'tok-ann', deviceId: 'ph-1', role: 'phone' });
    assert.deepEqual(await ph.next(), { type: 'ready' });
    ph.send({ type: 'to', deviceId: 'pc-1', frame: 'sealed' });
    assert.deepEqual(await pc.next(), { type: 'from', deviceId: 'ph-1', frame: 'sealed' });
    const removed = await fetch(`http://${base}/pair/ph-1`, { method: 'DELETE', headers: { authorization: 'Bearer tok-ann' } });
    assert.equal(removed.status, 200);
    assert.equal(await ph.closed, 4403);
    pc.ws.close();
  } finally {
    server.close();
  }
});

test('a first message that is not hello closes with 4401; a bad pairing is a 400', async () => {
  const { server, base } = await start();
  try {
    const c = socket(base);
    await c.opened;
    c.send({ type: 'to', deviceId: 'x', frame: 'y' });
    assert.equal(await c.closed, 4401);
    const bad = await fetch(`http://${base}/pair`, { method: 'POST', body: JSON.stringify({ idToken: 'tok-ann', computerId: 'nope', phoneDeviceId: 'ph-1' }) });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
