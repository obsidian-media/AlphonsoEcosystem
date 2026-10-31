// The phone's side of the link (phone app, phase 1): pairing from the computer's QR code,
// the connection to the relay, calls to the computer and their answers, the mirror, and
// whether the computer can be reached. Only frames that open with the paired computer's
// key are read.
import { randomId } from '../lib/randomId';
import { generateKeyPair } from '../services/phone/phoneCrypto';
import {
  decodeMessage, encodeMessage, readPairingPayload, relayHttpBase, sealPairingRequest,
  type MirroredStore, type PhoneCallName, type PhoneNotification,
} from '../services/phone/phoneProtocol';
import type { PhoneAuth, SocketFactory } from '../services/phone/phoneLink';
import { offlineLine, type PhoneTransport } from '../services/phone/remoteData';

export const NOT_ALPHONSO_QR = "That QR code isn't from Alphonso. On your computer, open Settings → Runtime → Remote Access → Phones and scan the code shown there.";
const PAIRING_KEY = 'alphonso_phone_pairing_v1';
const PRIVATE_KEY = 'alphonso_phone_private_key';
const CALL_TIMEOUT_MS = 30_000;
const PROBE_MS = 20_000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

/** The phone's secure storage (Keychain / Keystore), given by the app's packaging. */
export interface PhoneSecrets { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }

export interface SavedPairing {
  deviceId: string;
  phoneName: string;
  phonePublicKey: string;
  computerId: string;
  computerPublicKey: string;
  computerName: string;
  relayUrl: string;
  /** Until the computer has the phone's key: the QR code's one-time secret. */
  pairingSecret: string | null;
}

export function savedPairing(): SavedPairing | null {
  try { return JSON.parse(localStorage.getItem(PAIRING_KEY) || 'null'); } catch { return null; }
}
function savePairing(p: SavedPairing): void { localStorage.setItem(PAIRING_KEY, JSON.stringify(p)); }

export async function pairPhone(qrText: string, deps: { auth: PhoneAuth; secrets: PhoneSecrets; phoneName: string; fetchImpl?: typeof fetch }): Promise<{ ok: boolean; reason?: string }> {
  const info = readPairingPayload(qrText);
  if (!info) return { ok: false, reason: NOT_ALPHONSO_QR };
  const idToken = await deps.auth.idToken();
  if (!idToken) return { ok: false, reason: 'Sign in first, with the same account as on your computer.' };
  const keys = await generateKeyPair();
  const deviceId = randomId('ph');
  const res = await (deps.fetchImpl ?? fetch)(`${relayHttpBase(info.relayUrl)}/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken, computerId: info.computerId, phoneDeviceId: deviceId }),
  }).catch(() => null);
  if (!res || !res.ok) {
    const body: any = res ? await res.json().catch(() => ({})) : {};
    return { ok: false, reason: body?.error || "Couldn't reach Alphonso's relay. Check the phone's internet connection." };
  }
  await deps.secrets.set(PRIVATE_KEY, keys.privateKey);
  savePairing({ deviceId, phoneName: deps.phoneName, phonePublicKey: keys.publicKey, computerId: info.computerId, computerPublicKey: info.computerPublicKey, computerName: info.computerName, relayUrl: info.relayUrl, pairingSecret: info.pairingSecret });
  return { ok: true };
}

export interface PhoneLink extends PhoneTransport {
  onNotice(fn: (n: PhoneNotification) => void): () => void;
  stop(): void;
}

export function connectPhone(deps: { socket: SocketFactory; auth: PhoneAuth; secrets: PhoneSecrets; fcmToken?: string; now?: () => number }): PhoneLink {
  const now = deps.now ?? (() => Date.now());
  const mirrorFns = new Set<Parameters<PhoneTransport['onMirror']>[0]>();
  const statusFns = new Set<Parameters<PhoneTransport['onStatus']>[0]>();
  const noticeFns = new Set<(n: PhoneNotification) => void>();
  const pending = new Map<string, { resolve: (r: { ok: boolean; value?: unknown; error?: string }) => void; timer: ReturnType<typeof setTimeout> }>();
  let socket: ReturnType<SocketFactory> | null = null;
  let online = false;
  let since: number | null = now();
  let stopped = false;
  let delay = BACKOFF_START_MS;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let probe: ReturnType<typeof setInterval> | null = null;

  const setStatus = (isOnline: boolean, sinceMs: number | null) => {
    if (online === isOnline && (isOnline || since === sinceMs)) return;
    online = isOnline;
    since = isOnline ? null : sinceMs;
    if (!isOnline) for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: offlineLine(since) }); pending.delete(id); }
    for (const fn of statusFns) fn(online, since);
  };

  const keys = async () => {
    const p = savedPairing();
    const privateKey = await deps.secrets.get(PRIVATE_KEY);
    return p && privateKey ? { pairing: p, privateKey } : null;
  };

  const onFrame = async (deviceId: string, frame: string) => {
    const k = await keys();
    if (!k || deviceId !== k.pairing.computerId) return;
    const msg = await decodeMessage(frame, { theirPublic: k.pairing.computerPublicKey, myPrivate: k.privateKey });
    if (!msg) return;
    if (k.pairing.pairingSecret) savePairing({ ...k.pairing, pairingSecret: null });
    if (!online) setStatus(true, null);
    if (msg.kind === 'result') {
      const p = pending.get(msg.id);
      if (p) { clearTimeout(p.timer); pending.delete(msg.id); p.resolve(msg.ok ? { ok: true, value: msg.value } : { ok: false, error: msg.error }); }
    } else if (msg.kind === 'snapshot' || msg.kind === 'change') {
      for (const fn of mirrorFns) fn({ kind: msg.kind, store: msg.store as MirroredStore, data: msg.data, version: msg.version });
    } else if (msg.kind === 'notice') {
      for (const fn of noticeFns) fn(msg.notification);
    }
  };

  const connect = async () => {
    const k = await keys();
    if (stopped || !k) return;
    const s = deps.socket(k.pairing.relayUrl);
    socket = s;
    s.onOpen(async () => {
      const idToken = await deps.auth.idToken();
      if (!idToken) { s.close(); return; }
      s.send(JSON.stringify({ type: 'hello', idToken, deviceId: k.pairing.deviceId, role: 'phone', ...(deps.fcmToken ? { fcmToken: deps.fcmToken } : {}) }));
    });
    s.onMessage((text) => {
      let m: any;
      try { m = JSON.parse(text); } catch { return; }
      if (m.type === 'ready') {
        delay = BACKOFF_START_MS;
        void (async () => {
          const p = savedPairing();
          if (p?.pairingSecret) {
            const intro = await sealPairingRequest({ phonePublicKey: p.phonePublicKey, pairingSecret: p.pairingSecret, phoneName: p.phoneName }, p.computerPublicKey);
            s.send(JSON.stringify({ type: 'to', deviceId: p.computerId, frame: intro }));
          }
          // Hopeful: the snapshot call that follows finds out whether the computer answers.
          setStatus(true, null);
        })();
      } else if (m.type === 'from' && typeof m.frame === 'string') {
        void onFrame(String(m.deviceId), m.frame);
      } else if (m.type === 'offline') {
        setStatus(false, typeof m.sinceMs === 'number' ? m.sinceMs : now());
      }
    });
    s.onClose(() => {
      if (socket === s) socket = null;
      setStatus(false, since ?? now());
      if (stopped) return;
      retry = setTimeout(() => { retry = null; void connect(); }, delay);
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
    });
  };

  // While the relay is up but the computer isn't answering, ask again now and then.
  probe = setInterval(() => { if (!online && socket && !stopped) setStatus(true, null); }, PROBE_MS);
  void connect();

  return {
    async call(name: PhoneCallName, args: unknown) {
      const k = await keys();
      if (!online || !socket || !k) return { ok: false, error: offlineLine(since) };
      const id = randomId('call');
      const frame = await encodeMessage({ id, kind: 'call', name, args }, { theirPublic: k.pairing.computerPublicKey, myPrivate: k.privateKey });
      const s = socket;
      return new Promise((resolve) => {
        const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: "Your computer didn't answer in time." }); }, CALL_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        s.send(JSON.stringify({ type: 'to', deviceId: k.pairing.computerId, frame }));
      });
    },
    onMirror(fn) { mirrorFns.add(fn); return () => mirrorFns.delete(fn); },
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    onNotice(fn) { noticeFns.add(fn); return () => noticeFns.delete(fn); },
    online: () => online,
    offlineSince: () => since,
    stop() {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (probe) clearInterval(probe);
      socket?.close();
      socket = null;
    },
  };
}
