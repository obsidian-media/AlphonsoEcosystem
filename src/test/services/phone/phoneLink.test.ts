import { describe, it, expect, beforeEach, vi } from 'vitest';

const keychain = new Map<string, string>();
vi.mock('../../../services/secureStorageService', () => ({
  secureGet: vi.fn(async (k: string) => keychain.get(k) ?? null),
  secureSet: vi.fn(async (k: string, v: string) => { keychain.set(k, v); return true; }),
  secureDelete: vi.fn(async (k: string) => { keychain.delete(k); }),
}));

import { generateKeyPair } from '../../../services/phone/phoneCrypto';
import { decodeMessage, encodeMessage, readPairingPayload, sealPairingRequest } from '../../../services/phone/phoneProtocol';
import {
  PHONE_ACCESS_KEY, computerKeys, listPhones, onPhoneCall, pairingQr, phoneAccessOn, removePhone, resetPhoneLinkForTests, setPhoneAccess, startPhoneLink,
  type RelaySocket,
} from '../../../services/phone/phoneLink';

const RELAY = 'wss://relay.test/link';

function fakeSocketFactory() {
  const sockets: Array<RelaySocket & { sent: unknown[]; emit(m: unknown): void; drop(): void; closed: boolean }> = [];
  const factory = (url: string) => {
    let onMsg: (m: string) => void = () => {};
    let onClose: () => void = () => {};
    let onOpen: () => void = () => {};
    const s = {
      url, sent: [] as unknown[], closed: false,
      send(text: string) { this.sent.push(JSON.parse(text)); },
      close() { this.closed = true; },
      onMessage(fn: (m: string) => void) { onMsg = fn; },
      onClose(fn: () => void) { onClose = fn; },
      onOpen(fn: () => void) { onOpen = fn; queueMicrotask(() => onOpen()); },
      emit(m: unknown) { onMsg(JSON.stringify(m)); },
      drop() { onClose(); },
    };
    sockets.push(s);
    return s;
  };
  return { factory, sockets };
}

const auth = { idToken: async () => 'tok-ann' };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function pairOnePhone(sockets: ReturnType<typeof fakeSocketFactory>['sockets']) {
  const qr = readPairingPayload(await pairingQr({ relayUrl: RELAY, computerName: 'Studio PC' }))!;
  const phone = await generateKeyPair();
  const frame = await sealPairingRequest({ phonePublicKey: phone.publicKey, pairingSecret: qr.pairingSecret, phoneName: 'Ann iPhone' }, qr.computerPublicKey);
  sockets.at(-1)!.emit({ type: 'from', deviceId: 'ph-1', frame });
  await flush(); await flush();
  return { phone, qr };
}

describe('phoneLink', () => {
  beforeEach(() => { keychain.clear(); localStorage.clear(); resetPhoneLinkForTests(); });

  it('phone access is off until a phone is paired', async () => {
    const { factory, sockets } = fakeSocketFactory();
    setPhoneAccess(true);
    expect(phoneAccessOn()).toBe(false);
    const stop = startPhoneLink({ relayUrl: RELAY, auth, socket: factory });
    await flush();
    expect(sockets[0].sent[0]).toMatchObject({ type: 'hello', idToken: 'tok-ann', role: 'computer' });
    await pairOnePhone(sockets);
    expect(listPhones().map((p) => p.name)).toEqual(['Ann iPhone']);
    expect(phoneAccessOn()).toBe(true);
    stop();
  });

  it('a pairing secret works once, and not after its time', async () => {
    let t = 1_000;
    const { factory, sockets } = fakeSocketFactory();
    startPhoneLink({ relayUrl: RELAY, auth, socket: factory, now: () => t });
    await flush();
    const qr = readPairingPayload(await pairingQr({ relayUrl: RELAY, computerName: 'PC', nowMs: t }))!;
    const late = await generateKeyPair();
    t += 11 * 60_000;
    sockets[0].emit({ type: 'from', deviceId: 'ph-late', frame: await sealPairingRequest({ phonePublicKey: late.publicKey, pairingSecret: qr.pairingSecret, phoneName: 'Late' }, qr.computerPublicKey) });
    await flush(); await flush();
    expect(listPhones()).toEqual([]);
  });

  it('a frame from a removed device is refused', async () => {
    const { factory, sockets } = fakeSocketFactory();
    const handler = vi.fn(async () => 'ok');
    onPhoneCall(handler);
    startPhoneLink({ relayUrl: RELAY, auth, socket: factory, fetchImpl: vi.fn(async () => new Response('{"ok":true}')) });
    await flush();
    const { phone, qr } = await pairOnePhone(sockets);
    const call = (id: string) => encodeMessage({ id, kind: 'call', name: 'request.stop', args: { requestId: 'r1' } }, { theirPublic: qr.computerPublicKey, myPrivate: phone.privateKey });
    sockets[0].emit({ type: 'from', deviceId: 'ph-1', frame: await call('c1') });
    await flush(); await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    const reply = sockets[0].sent.at(-1) as { type: string; deviceId: string; frame: string };
    expect(reply).toMatchObject({ type: 'to', deviceId: 'ph-1' });
    expect(await decodeMessage(reply.frame, { theirPublic: qr.computerPublicKey, myPrivate: phone.privateKey })).toEqual({ id: 'c1', kind: 'result', ok: true, value: 'ok' });
    await removePhone('ph-1', { relayUrl: RELAY, auth, fetchImpl: vi.fn(async () => new Response('{"ok":true}')) });
    sockets[0].emit({ type: 'from', deviceId: 'ph-1', frame: await call('c2') });
    await flush(); await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(listPhones()).toEqual([]);
  });

  it('the link reconnects with backoff after the relay closes, and stops when phone access is turned off', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const { factory, sockets } = fakeSocketFactory();
    startPhoneLink({ relayUrl: RELAY, auth, socket: factory, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {} });
    await flush();
    await pairOnePhone(sockets);
    sockets[0].drop();
    expect(timers.at(-1)!.ms).toBe(1000);
    timers.at(-1)!.fn();
    await flush();
    expect(sockets).toHaveLength(2);
    sockets[1].drop();
    expect(timers.at(-1)!.ms).toBe(2000);
    timers.at(-1)!.fn();
    await flush();
    expect(sockets).toHaveLength(3);
    setPhoneAccess(false);
    expect(sockets[2].closed).toBe(true);
    sockets[2].drop();
    await flush();
    expect(sockets).toHaveLength(3);
  });

  it("the computer's private key is read from the keychain and never written to localStorage", async () => {
    const keys = await computerKeys();
    expect(keychain.get('alphonso_phone_link_private_key')).toBe(keys.privateKey);
    const everything = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('|');
    expect(everything).not.toContain(keys.privateKey);
    expect((await computerKeys()).privateKey).toBe(keys.privateKey);
    expect(localStorage.getItem(PHONE_ACCESS_KEY)).toBeNull();
  });
});
