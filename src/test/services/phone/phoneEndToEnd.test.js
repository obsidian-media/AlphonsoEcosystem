// Phone app phase 1, end to end: the real relay server (gateway/phone-relay, with its memory
// store and a stand-in sign-in check), the computer's real link (phoneLink + phoneCalls) and
// the phone's real session (phoneSession), talking over real WebSockets with real
// encryption. Jose's own functions are stand-ins at the boundary the phone calls (the same
// functions the board and Telegram use; their behaviour has its own tests).
// The five checks: pair; chat; approve a waiting step (once); stop a running request; the
// computer goes away and the phone says since when.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';

const h = vi.hoisted(() => {
  const requests = new Map();
  const keychain = new Map();
  return {
    requests,
    keychain,
    engine: {
      approveRequestStep: vi.fn(async () => ({ ok: true })),
      rejectRequestStep: vi.fn(() => ({ ok: true, summary: 'Rejected.' })),
      carryOnRequest: vi.fn(async () => ({ ok: true })),
      cancelRequest: vi.fn(() => ({ ok: true, summary: 'Cancelled.' })),
    },
    stop: { stopRequest: vi.fn(() => ({ ok: true, summary: 'Stopped by you.' })) },
    inbound: {
      answerOrPlan: vi.fn(async () => ({ kind: 'answer', text: 'Paris.' })),
      inboundReply: (r) => (r.kind === 'answer' ? r.text : 'Jose is on it.'),
      outcomeLine: () => 'Done.',
    },
  };
});
vi.mock('../../../services/joseExecutionEngineService', () => h.engine);
vi.mock('../../../services/jose/joseStop', () => h.stop);
vi.mock('../../../services/jose/submitToJose', () => ({ runApprovedPlan: vi.fn(), cancelPlan: vi.fn() }));
vi.mock('../../../services/jose/joseInbound', () => h.inbound);
vi.mock('../../../services/jose/joseRequestStore', () => ({ getJoseRequest: (id) => h.requests.get(id) || null }));
vi.mock('../../../services/phone/phoneMirror', () => ({ mirrorSnapshots: async () => ({}) }));
vi.mock('../../../services/secureStorageService', () => ({
  secureGet: async (k) => h.keychain.get(k) ?? null,
  secureSet: async (k, v) => { h.keychain.set(k, v); },
  secureDelete: async (k) => { h.keychain.delete(k); },
}));

import { createServer } from '../../../../gateway/phone-relay/src/server.js';
import { createMemoryStore } from '../../../../gateway/phone-relay/src/memoryStore.js';
import { listPhones, onPhoneCall, pairingQr, resetPhoneLinkForTests, startPhoneLink } from '../../../services/phone/phoneLink';
import { handlePhoneCall, ALREADY_DONE, resetPhoneCallsForTests } from '../../../services/phone/phoneCalls';
import { connectPhone, pairPhone } from '../../../mobile/phoneSession';

const auth = { idToken: async () => 'tok-ann' };
const verifyToken = async (t) => { if (t !== 'tok-ann') throw new Error('bad'); return 'ann'; };

/** The `ws` client as the link's socket. */
const wsFactory = (url) => {
  const ws = new WebSocket(url);
  return {
    send: (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    close: () => ws.close(),
    onMessage: (fn) => { ws.on('message', (d) => fn(String(d))); },
    onClose: (fn) => { ws.on('close', () => fn()); },
    onOpen: (fn) => { ws.on('open', () => fn()); },
  };
};

const phoneSecrets = (() => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } };
})();

describe('phone app phase 1, end to end over the real relay', () => {
  let server;
  let relayUrl;
  let stopComputer;
  let offCalls;
  let phone;

  beforeAll(async () => {
    localStorage.clear();
    resetPhoneLinkForTests();
    resetPhoneCallsForTests();
    ({ server } = createServer({ verifyToken, store: createMemoryStore(), push: async () => {} }));
    await new Promise((r) => server.listen(0, '127.0.0.1', () => r()));
    relayUrl = `ws://127.0.0.1:${server.address().port}/link`;
  });

  afterAll(async () => {
    phone?.stop();
    stopComputer?.();
    offCalls?.();
    await new Promise((r) => server.close(() => r()));
  });

  it('pairs: the phone scans the code, the computer lists it', async () => {
    const qr = await pairingQr({ relayUrl, computerName: 'Test computer' });
    offCalls = onPhoneCall(handlePhoneCall);
    stopComputer = startPhoneLink({ relayUrl, auth, socket: wsFactory });
    // The relay accepts the pairing once the computer has said hello.
    await vi.waitFor(async () => {
      const r = await pairPhone(qr, { auth, secrets: phoneSecrets, phoneName: 'Test phone', fetchImpl: fetch });
      if (!r.ok) throw new Error(r.reason);
    }, { timeout: 10_000, interval: 200 });
    phone = connectPhone({ socket: wsFactory, auth, secrets: phoneSecrets });
    await vi.waitFor(() => expect(listPhones().map((p) => p.name)).toEqual(['Test phone']), { timeout: 10_000 });
  }, 20_000);

  it('chat: a message from the phone is answered by the computer', async () => {
    const r = await phone.call('chat.send', { text: 'What is the capital of France?', messageId: 'm-1' });
    expect(r).toEqual({ ok: true, value: { messageId: 'm-1', reply: 'Paris.' } });
    expect(h.inbound.answerOrPlan).toHaveBeenCalledWith('What is the capital of France?', expect.objectContaining({ source: 'phone' }));
  }, 20_000);

  it('approve: a waiting step approved from the phone runs once', async () => {
    h.requests.set('r1', { id: 'r1', status: 'waiting_approval', steps: [{ stepId: 'marcus', agent: 'marcus', status: 'waiting_approval', effects: ['publish_or_send'] }] });
    const first = await phone.call('request.approveStep', { requestId: 'r1', stepId: 'marcus' });
    expect(first).toEqual({ ok: true, value: 'Approved. It carries on.' });
    const again = await phone.call('request.approveStep', { requestId: 'r1', stepId: 'marcus' });
    expect(again).toEqual({ ok: true, value: ALREADY_DONE });
    expect(h.engine.approveRequestStep).toHaveBeenCalledTimes(1);
    expect(h.engine.approveRequestStep).toHaveBeenCalledWith('r1', 'marcus');
  }, 20_000);

  it('stop: a running request is stopped from the phone', async () => {
    const r = await phone.call('request.stop', { requestId: 'r2' });
    expect(r).toEqual({ ok: true, value: 'Stopped by you.' });
    expect(h.stop.stopRequest).toHaveBeenCalledWith('r2');
  }, 20_000);

  it('offline: with the computer gone, the phone says since when', async () => {
    stopComputer();
    // A call sent in the same instant would reach the closing connection and be lost (the
    // phone then says the computer didn't answer); give the relay a moment to see it go.
    await new Promise((r) => setTimeout(r, 500));
    // The relay records when the computer left; the phone learns it on its next call.
    await vi.waitFor(async () => {
      const r = await phone.call('mirror.snapshot', {});
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/offline since/i);
    }, { timeout: 10_000, interval: 300 });
    expect(phone.online()).toBe(false);
    expect(typeof phone.offlineSince()).toBe('number');
  }, 20_000);
});
