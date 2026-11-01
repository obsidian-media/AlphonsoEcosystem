import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRequest, handoffUrl, BAD_REQUEST } from './handoff.js';

test('a request from Alphonso names a local port and a one-time code', () => {
  const r = readRequest('?port=53123&state=' + 'a'.repeat(32) + '&method=google');
  assert.deepEqual(r, { ok: true, port: 53123, state: 'a'.repeat(32), method: 'google', email: '' });
});

test('anything else is refused: no port, a port out of range, a short or odd code, an unknown method', () => {
  for (const q of ['', '?state=' + 'a'.repeat(32), '?port=80&state=' + 'a'.repeat(32), '?port=70000&state=' + 'a'.repeat(32),
    '?port=53123&state=short', '?port=53123&state=' + 'z'.repeat(31) + '<', '?port=53123&state=' + 'a'.repeat(32) + '&method=facebook']) {
    assert.deepEqual(readRequest(q), { ok: false, reason: BAD_REQUEST }, q);
  }
});

test('the sign-in goes back only to this computer, which reads it and clears it from the history', () => {
  const url = new URL(handoffUrl({ port: 53123, state: 'a'.repeat(32) }, 'tok/en+='));
  assert.equal(url.protocol, 'http:');
  assert.equal(url.host, '127.0.0.1:53123');
  assert.equal(url.pathname, '/callback');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('state'), 'a'.repeat(32));
  assert.equal(url.searchParams.get('token'), 'tok/en+=');
});
