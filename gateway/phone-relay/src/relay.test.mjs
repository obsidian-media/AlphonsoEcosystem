// Run with: node --test gateway/phone-relay/src/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from './routing.js';
import { createLimiter, LIMITS } from './limits.js';
import { createMemoryStore } from './memoryStore.js';

const TOKENS = { 'tok-ann': 'ann', 'tok-bob': 'bob' };
const verifyToken = async (t) => { if (!TOKENS[t]) throw new Error('bad'); return TOKENS[t]; };

function conn() {
  return {
    sent: [], closedWith: null,
    send(obj) { this.sent.push(obj); },
    close(code) { this.closedWith = code; },
  };
}

async function setup({ now = () => 1000, limits } = {}) {
  const store = createMemoryStore();
  const pushed = [];
  const relay = createRelay({ verifyToken, store, limiter: createLimiter(limits || LIMITS), now, push: async (token, sealed) => pushed.push({ token, sealed }) });
  const computer = conn();
  await relay.hello(computer, { type: 'hello', idToken: 'tok-ann', deviceId: 'pc-1', role: 'computer' });
  await relay.pair({ idToken: 'tok-ann', computerId: 'pc-1', phoneDeviceId: 'ph-1' });
  const phone = conn();
  await relay.hello(phone, { type: 'hello', idToken: 'tok-ann', deviceId: 'ph-1', role: 'phone', fcmToken: 'fcm-1' });
  return { relay, store, computer, phone, pushed };
}

test('a frame is forwarded only between devices paired under the same account', async () => {
  const { relay, computer, phone } = await setup();
  assert.deepEqual(computer.sent.at(-1), { type: 'ready' });
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'sealed-1' });
  assert.deepEqual(computer.sent.at(-1), { type: 'from', deviceId: 'ph-1', frame: 'sealed-1' });
  await relay.message(computer, { type: 'to', deviceId: 'ph-1', frame: 'sealed-2' });
  assert.deepEqual(phone.sent.at(-1), { type: 'from', deviceId: 'pc-1', frame: 'sealed-2' });
  // Bob's computer is connected, but not paired with Ann's phone.
  const bob = conn();
  await relay.hello(bob, { type: 'hello', idToken: 'tok-bob', deviceId: 'pc-bob', role: 'computer' });
  await relay.message(phone, { type: 'to', deviceId: 'pc-bob', frame: 'sealed-3' });
  assert.equal(bob.sent.filter((m) => m.type === 'from').length, 0);
  assert.equal(phone.sent.at(-1).type, 'error');
});

test('a bad ID token closes with 4401', async () => {
  const { relay } = await setup();
  const c = conn();
  await relay.hello(c, { type: 'hello', idToken: 'nope', deviceId: 'pc-9', role: 'computer' });
  assert.equal(c.closedWith, 4401);
});

test('an unpaired device closes with 4403', async () => {
  const { relay } = await setup();
  const strayPhone = conn();
  await relay.hello(strayPhone, { type: 'hello', idToken: 'tok-ann', deviceId: 'ph-stray', role: 'phone' });
  assert.equal(strayPhone.closedWith, 4403);
  // Another account can't take over Ann's computer id.
  const thief = conn();
  await relay.hello(thief, { type: 'hello', idToken: 'tok-bob', deviceId: 'pc-1', role: 'computer' });
  assert.equal(thief.closedWith, 4403);
  // Nor pair a phone to it.
  await assert.rejects(relay.pair({ idToken: 'tok-bob', computerId: 'pc-1', phoneDeviceId: 'ph-bob' }), /not yours/i);
});

test('frames over the size limit are refused', async () => {
  const { relay, computer, phone } = await setup();
  const before = computer.sent.length;
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'x'.repeat(LIMITS.maxFrameChars + 1) });
  assert.equal(computer.sent.length, before);
  assert.deepEqual(phone.sent.at(-1), { type: 'error', reason: 'too_large' });
});

test('a device over the per-second or daily limit is refused', async () => {
  let t = 1000;
  const { relay, computer, phone } = await setup({ now: () => t, limits: { ...LIMITS, framesPerSecond: 3, bytesPerDay: 50 } });
  for (let i = 0; i < 4; i += 1) await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'ab' });
  assert.deepEqual(phone.sent.at(-1), { type: 'error', reason: 'too_fast' });
  t += 1500;
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'ok' });
  assert.equal(computer.sent.at(-1).frame, 'ok');
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'y'.repeat(60) });
  assert.deepEqual(phone.sent.at(-1), { type: 'error', reason: 'daily_limit' });
  t += 24 * 3600 * 1000;
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'next-day' });
  assert.equal(computer.sent.at(-1).frame, 'next-day');
});

test("the computer's absence is answered with offline and its last-seen time", async () => {
  let t = 1000;
  const { relay, computer, phone } = await setup({ now: () => t });
  t = 5000;
  await relay.closed(computer);
  t = 9000;
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'hello?' });
  assert.deepEqual(phone.sent.at(-1), { type: 'offline', deviceId: 'pc-1', sinceMs: 5000 });
});

test('a removed pairing stops forwarding at once and drops the phone', async () => {
  const { relay, computer, phone } = await setup();
  await relay.removePair({ idToken: 'tok-ann', phoneDeviceId: 'ph-1' });
  assert.equal(phone.closedWith, 4403);
  const before = computer.sent.length;
  await relay.message(phone, { type: 'to', deviceId: 'pc-1', frame: 'late' });
  assert.equal(computer.sent.length, before);
});

test("a push goes only to a paired phone's notification token", async () => {
  const { relay, computer, phone, pushed } = await setup();
  await relay.message(computer, { type: 'push', deviceId: 'ph-1', sealed: 'note' });
  assert.deepEqual(pushed, [{ token: 'fcm-1', sealed: 'note' }]);
  await relay.message(phone, { type: 'push', deviceId: 'pc-1', sealed: 'x' });
  assert.equal(pushed.length, 1);
});

test('a message before hello, or of an unknown type, is refused', async () => {
  const { relay } = await setup();
  const c = conn();
  await relay.message(c, { type: 'to', deviceId: 'pc-1', frame: 'x' });
  assert.equal(c.closedWith, 4401);
});
