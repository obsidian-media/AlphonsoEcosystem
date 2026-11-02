import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateKeyPair } from '../../services/phone/phoneCrypto';
import { decodeMessage, encodeMessage, openPairingRequest, pairingPayload } from '../../services/phone/phoneProtocol';
import { COMPUTER_KEY_NAME, NOT_ALPHONSO_QR, RELAY_REFUSED, connectPhone, pairPhone, savedPairing, type PhoneSecrets } from '../../mobile/phoneSession';

const RELAY = 'wss://relay.test/link';

function secrets(): PhoneSecrets & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: async (k) => map.get(k) ?? null, set: async (k, v) => { map.set(k, v); } };
}

function fakeSockets() {
  const sockets: any[] = [];
  const factory = (url: string) => {
    let onMsg: (t: string) => void = () => {};
    let onClose: () => void = () => {};
    const s: any = {
      url, sent: [] as any[], closed: false,
      send(t: string) { this.sent.push(JSON.parse(t)); },
      close() { this.closed = true; },
      onMessage(fn: any) { onMsg = fn; },
      onClose(fn: any) { onClose = fn; },
      onOpen(fn: any) { queueMicrotask(fn); },
      emit(m: unknown) { onMsg(JSON.stringify(m)); },
      drop() { onClose(); },
    };
    sockets.push(s);
    return s;
  };
  return { factory, sockets };
}

const flush = async (n = 3) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const auth = { idToken: async () => 'tok-ann' };

async function paired() {
  const computer = await generateKeyPair();
  const qr = pairingPayload({ computerId: 'pc-1', computerPublicKey: computer.publicKey, computerName: 'Studio PC', relayUrl: RELAY, pairingSecret: 'secret-1' });
  const store = secrets();
  const fetchImpl = vi.fn(async () => new Response('{"ok":true}'));
  const result = await pairPhone(qr, { auth, secrets: store, phoneName: 'Ann iPhone', fetchImpl });
  return { computer, store, fetchImpl, result };
}

describe('phoneSession', () => {
  beforeEach(() => localStorage.clear());

  it('a QR from another app is refused with a plain line', async () => {
    const result = await pairPhone('https://example.com/promo', { auth, secrets: secrets(), phoneName: 'x', fetchImpl: vi.fn() });
    expect(result).toEqual({ ok: false, reason: NOT_ALPHONSO_QR });
  });

  it("pairing records the phone at the relay and keeps the phone's private key in its secure storage", async () => {
    const { store, fetchImpl, result } = await paired();
    expect(result.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://relay.test/pair');
    expect(JSON.parse(String(init.body))).toMatchObject({ idToken: 'tok-ann', computerId: 'pc-1' });
    const saved = savedPairing()!;
    expect(saved.computerName).toBe('Studio PC');
    expect(JSON.stringify(localStorage)).not.toContain(store.map.get('alphonso_phone_private_key')!);
  });

  it("pairing also keeps the computer's public key in secure storage, where the notification extension reads it", async () => {
    const { computer, store } = await paired();
    expect(store.map.get(COMPUTER_KEY_NAME)).toBe(computer.publicKey);
  });

  it("the phone's first message carries its key to the computer, sealed", async () => {
    const { computer, store } = await paired();
    const { factory, sockets } = fakeSockets();
    const link = connectPhone({ socket: factory, auth, secrets: store });
    await flush();
    expect(sockets[0].sent[0]).toMatchObject({ type: 'hello', role: 'phone', idToken: 'tok-ann' });
    sockets[0].emit({ type: 'ready' });
    await flush();
    const intro = sockets[0].sent.find((m: any) => m.type === 'to');
    const request = await openPairingRequest(intro.frame, computer);
    expect(request).toMatchObject({ pairingSecret: 'secret-1', phoneName: 'Ann iPhone' });
    link.stop();
  });

  it("a call's answer comes back to it; the computer's absence makes the phone offline since then", async () => {
    const { computer, store } = await paired();
    const { factory, sockets } = fakeSockets();
    const link = connectPhone({ socket: factory, auth, secrets: store });
    await flush();
    sockets[0].emit({ type: 'ready' });
    await flush();
    const phonePublic = (await openPairingRequest(sockets[0].sent.find((m: any) => m.type === 'to').frame, computer))!.phonePublicKey;
    const pending = link.call('request.stop', { requestId: 'r1' });
    await flush();
    const sent = sockets[0].sent.filter((m: any) => m.type === 'to').at(-1);
    const msg: any = await decodeMessage(sent.frame, { theirPublic: phonePublic, myPrivate: computer.privateKey });
    expect(msg).toMatchObject({ kind: 'call', name: 'request.stop' });
    sockets[0].emit({ type: 'from', deviceId: 'pc-1', frame: await encodeMessage({ id: msg.id, kind: 'result', ok: true, value: 'Stopped by you.' }, { theirPublic: phonePublic, myPrivate: computer.privateKey }) });
    expect(await pending).toEqual({ ok: true, value: 'Stopped by you.' });
    sockets[0].emit({ type: 'offline', deviceId: 'pc-1', sinceMs: 5000 });
    await flush();
    expect(link.online()).toBe(false);
    expect(link.offlineSince()).toBe(5000);
    expect(await link.call('request.stop', { requestId: 'r1' })).toMatchObject({ ok: false });
    link.stop();
  });

  it('frames from anyone but the paired computer are ignored', async () => {
    const { store } = await paired();
    const { factory, sockets } = fakeSockets();
    const link = connectPhone({ socket: factory, auth, secrets: store });
    const mirror = vi.fn();
    link.onMirror(mirror);
    await flush();
    sockets[0].emit({ type: 'ready' });
    const stranger = await generateKeyPair();
    sockets[0].emit({ type: 'from', deviceId: 'pc-other', frame: await encodeMessage({ id: 'x', kind: 'change', store: 'requests', data: [], version: 1 }, { theirPublic: stranger.publicKey, myPrivate: stranger.privateKey }) });
    await flush();
    expect(mirror).not.toHaveBeenCalled();
    link.stop();
  });
  it("a relay refusal ends the oldest waiting call at once, with a plain line", async () => {
    const { store } = await paired();
    const { factory, sockets } = fakeSockets();
    const link = connectPhone({ socket: factory, auth, secrets: store });
    await flush();
    sockets[0].emit({ type: 'ready' });
    await flush();
    const first = link.call('request.stop', { requestId: 'r1' });
    await flush();
    const second = link.call('request.stop', { requestId: 'r2' });
    await flush();
    sockets[0].emit({ type: 'error', reason: 'daily_limit' });
    expect(await first).toEqual({ ok: false, error: RELAY_REFUSED.daily_limit });
    expect(RELAY_REFUSED.daily_limit).toBe("Today's limit for this phone is used up; try again tomorrow.");
    sockets[0].emit({ type: 'error', reason: 'something_new' });
    expect(await second).toEqual({ ok: false, error: "Alphonso's relay couldn't pass that on. Try again." });
    link.stop();
  });
});
