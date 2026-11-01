// The computer's side of phone access (phone app, phase 1): its keys, pairing a phone by
// QR code, the connection to the Obsidian Media relay, and sending or receiving sealed
// messages. The computer decides everything; a phone only asks (phoneCalls.ts says what
// it may ask).
//
// Pairing: the QR code carries the computer's public key and a one-time secret, good for
// PAIRING_WINDOW_MS. The phone's first message is sealed to that key and carries the
// secret and the phone's own key, so the relay can neither read nor swap it. A device
// the computer doesn't list (never paired, or removed) is refused whatever the relay
// forwards.
import { randomHex, randomId } from '../../lib/randomId';
import { secureGet, secureSet } from '../secureStorageService';
import { generateKeyPair } from './phoneCrypto';
import {
  decodeMessage, encodeMessage, openPairingRequest, pairingPayload, relayHttpBase,
  type MirroredStore, type PhoneMessage, type PhoneNotification,
} from './phoneProtocol';

export const PHONE_ACCESS_KEY = 'alphonso_phone_access_v1';
export const PHONES_KEY = 'alphonso_phones_v1';
const COMPUTER_ID_KEY = 'alphonso_phone_computer_id_v1';
const PUBLIC_KEY_KEY = 'alphonso_phone_link_public_key_v1';
const PRIVATE_KEY_SECRET = 'alphonso_phone_link_private_key';
export const PAIRING_WINDOW_MS = 10 * 60_000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

export interface PairedPhone { deviceId: string; name: string; publicKey: string; pairedAtMs: number; lastSeenMs: number | null }
export interface PhoneAuth { idToken(): Promise<string | null> }
export interface RelaySocket {
  send(text: string): void;
  close(): void;
  onMessage(fn: (text: string) => void): void;
  onClose(fn: () => void): void;
  onOpen(fn: () => void): void;
}
export type SocketFactory = (url: string) => RelaySocket;
type CallHandler = (msg: Extract<PhoneMessage, { kind: 'call' }>, fromDeviceId: string) => Promise<unknown>;

interface LinkState {
  keys: { publicKey: string; privateKey: string } | null;
  pairing: { secret: string; expiresAtMs: number } | null;
  socket: RelaySocket | null;
  stopped: boolean;
  handlers: Set<CallHandler>;
  accessListeners: Set<() => void>;
  versions: Map<MirroredStore, number>;
  now: () => number;
}

let state: LinkState = freshState();
function freshState(): LinkState {
  return { keys: null, pairing: null, socket: null, stopped: true, handlers: new Set(), accessListeners: new Set(), versions: new Map(), now: () => Date.now() };
}
export function resetPhoneLinkForTests(): void { state.socket?.close(); state = freshState(); }

// ── Saved settings ─────────────────────────────────────────────────────────

export function listPhones(): PairedPhone[] {
  try {
    const v = JSON.parse(localStorage.getItem(PHONES_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function savePhones(phones: PairedPhone[]): void { localStorage.setItem(PHONES_KEY, JSON.stringify(phones)); }

/** On only when the user switched it on and a phone is paired. */
export function phoneAccessOn(): boolean {
  return localStorage.getItem(PHONE_ACCESS_KEY) === 'on' && listPhones().length > 0;
}
export function setPhoneAccess(on: boolean): void {
  localStorage.setItem(PHONE_ACCESS_KEY, on ? 'on' : 'off');
  for (const listener of state.accessListeners) listener();
}

function computerId(): string {
  let id = localStorage.getItem(COMPUTER_ID_KEY);
  if (!id) { id = randomId('pc'); localStorage.setItem(COMPUTER_ID_KEY, id); }
  return id;
}

/** This computer's key pair. The private key lives only in the OS keychain. */
export async function computerKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (state.keys) return state.keys;
  const privateKey = await secureGet(PRIVATE_KEY_SECRET);
  const publicKey = localStorage.getItem(PUBLIC_KEY_KEY);
  if (privateKey && publicKey) { state.keys = { publicKey, privateKey }; return state.keys; }
  const pair = await generateKeyPair();
  await secureSet(PRIVATE_KEY_SECRET, pair.privateKey);
  localStorage.setItem(PUBLIC_KEY_KEY, pair.publicKey);
  state.keys = pair;
  return pair;
}

// ── Pairing ─────────────────────────────────────────────────────────────────

/** The text for the pairing QR code; its secret works once, for PAIRING_WINDOW_MS. */
export async function pairingQr(input: { relayUrl: string; computerName: string; nowMs?: number }): Promise<string> {
  const keys = await computerKeys();
  const secret = randomHex(32);
  state.pairing = { secret, expiresAtMs: (input.nowMs ?? state.now()) + PAIRING_WINDOW_MS };
  return pairingPayload({ computerId: computerId(), computerPublicKey: keys.publicKey, computerName: input.computerName, relayUrl: input.relayUrl, pairingSecret: secret });
}

async function tryPairing(deviceId: string, frame: string): Promise<boolean> {
  const pending = state.pairing;
  if (!pending || state.now() > pending.expiresAtMs) return false;
  const request = await openPairingRequest(frame, await computerKeys());
  if (!request || request.pairingSecret !== pending.secret) return false;
  state.pairing = null;
  savePhones([...listPhones().filter((p) => p.deviceId !== deviceId), { deviceId, name: request.phoneName, publicKey: request.phonePublicKey, pairedAtMs: state.now(), lastSeenMs: state.now() }]);
  setPhoneAccess(true);
  return true;
}


/** Unpair a phone: forgotten here at once, then unpaired at the relay. */
export async function removePhone(deviceId: string, deps: { relayUrl: string; auth: PhoneAuth; fetchImpl?: typeof fetch }): Promise<void> {
  savePhones(listPhones().filter((p) => p.deviceId !== deviceId));
  if (listPhones().length === 0) setPhoneAccess(false);
  const token = await deps.auth.idToken();
  if (!token) return;
  await (deps.fetchImpl ?? fetch)(`${relayHttpBase(deps.relayUrl)}/pair/${encodeURIComponent(deviceId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
}

// ── The link ────────────────────────────────────────────────────────────────

export function onPhoneCall(handler: CallHandler): () => void {
  state.handlers.add(handler);
  return () => state.handlers.delete(handler);
}

async function sendTo(phone: PairedPhone, msg: PhoneMessage, type: 'to' | 'push' = 'to'): Promise<void> {
  const socket = state.socket;
  if (!socket) return;
  const keys = await computerKeys();
  const sealed = await encodeMessage(msg, { theirPublic: phone.publicKey, myPrivate: keys.privateKey });
  socket.send(JSON.stringify(type === 'to' ? { type, deviceId: phone.deviceId, frame: sealed } : { type, deviceId: phone.deviceId, sealed }));
}

async function onFrame(deviceId: string, frame: string): Promise<void> {
  const phone = listPhones().find((p) => p.deviceId === deviceId);
  if (!phone) { await tryPairing(deviceId, frame); return; }
  const keys = await computerKeys();
  const msg = await decodeMessage(frame, { theirPublic: phone.publicKey, myPrivate: keys.privateKey });
  if (!msg || msg.kind !== 'call') return;
  const [handler] = [...state.handlers];
  if (!handler) { await sendTo(phone, { id: msg.id, kind: 'result', ok: false, error: 'Not available from the phone yet.' }); return; }
  try {
    const value = await handler(msg, deviceId);
    await sendTo(phone, { id: msg.id, kind: 'result', ok: true, value });
  } catch (error) {
    await sendTo(phone, { id: msg.id, kind: 'result', ok: false, error: String((error as Error)?.message || error) });
  }
}

/** Connect to the relay and keep connected (backing off after a drop) until stopped or
 *  phone access is turned off while no pairing is waiting. Returns stop(). */
export function startPhoneLink(deps: {
  relayUrl: string;
  auth: PhoneAuth;
  socket: SocketFactory;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  fetchImpl?: typeof fetch;
}): () => void {
  if (deps.now) state.now = deps.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let delay = BACKOFF_START_MS;
  let timer: unknown = null;
  state.stopped = false;

  // Connected only while phone access is on (a phone is paired) or a pairing code is still
  // valid: an open connection keeps the relay busy, which is what it costs (owner, 2026-11-01).
  const pairingOpen = () => !!state.pairing && state.now() <= state.pairing.expiresAtMs;
  const wanted = () => !state.stopped && (phoneAccessOn() || pairingOpen());
  let expiryTimer: unknown = null;
  const closeWhenPairingEnds = () => {
    if (phoneAccessOn() || !state.pairing) return;
    expiryTimer = setTimer(() => {
      expiryTimer = null;
      if (!wanted()) state.socket?.close();
    }, Math.max(0, state.pairing.expiresAtMs - state.now()) + 1);
  };
  const connect = () => {
    if (!wanted()) return;
    const socket = deps.socket(deps.relayUrl);
    state.socket = socket;
    if (!expiryTimer) closeWhenPairingEnds();
    socket.onOpen(async () => {
      const idToken = await deps.auth.idToken();
      if (!idToken) { socket.close(); return; }
      socket.send(JSON.stringify({ type: 'hello', idToken, deviceId: computerId(), role: 'computer' }));
    });
    socket.onMessage((text) => {
      let msg: { type?: string; deviceId?: string; frame?: string };
      try { msg = JSON.parse(text); } catch { return; }
      if (msg.type === 'ready') { delay = BACKOFF_START_MS; return; }
      if (msg.type === 'from' && typeof msg.deviceId === 'string' && typeof msg.frame === 'string') void onFrame(msg.deviceId, msg.frame);
    });
    socket.onClose(() => {
      if (state.socket === socket) state.socket = null;
      if (state.stopped) return;
      timer = setTimer(() => { timer = null; connect(); }, delay);
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
    });
  };
  const onAccess = () => {
    if (localStorage.getItem(PHONE_ACCESS_KEY) === 'off') {
      state.stopped = true;
      if (timer) clearTimer(timer);
      state.socket?.close();
      state.socket = null;
    }
  };
  state.accessListeners.add(onAccess);
  connect();
  return () => {
    state.stopped = true;
    state.accessListeners.delete(onAccess);
    if (timer) clearTimer(timer);
    if (expiryTimer) clearTimer(expiryTimer);
    state.socket?.close();
    state.socket = null;
  };
}

/** Send a store's snapshot or change to every paired phone (a phone that is offline misses
 *  it and gets a snapshot when it connects again). */
export function publish(store: MirroredStore, data: unknown, kind: 'snapshot' | 'change'): void {
  const version = (state.versions.get(store) ?? 0) + 1;
  state.versions.set(store, version);
  for (const phone of listPhones()) void sendTo(phone, { id: randomId('m'), kind, store, data, version });
}

/** A notification for every paired phone, through the relay's push. */
export function pushNotice(notification: PhoneNotification): void {
  for (const phone of listPhones()) void sendTo(phone, { id: randomId('n'), kind: 'notice', notification }, 'push');
}

/** The real connection: the window's own WebSocket. */
export const webSocketFactory: SocketFactory = (url) => {
  const ws = new WebSocket(url);
  return {
    send: (text) => { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    close: () => ws.close(),
    onMessage: (fn) => { ws.onmessage = (e) => fn(String(e.data)); },
    onClose: (fn) => { ws.onclose = () => fn(); },
    onOpen: (fn) => { ws.onopen = () => fn(); },
  };
};
