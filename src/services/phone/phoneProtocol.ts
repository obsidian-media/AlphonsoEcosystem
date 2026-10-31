// The messages a paired phone and computer send each other through the relay (phone
// app, phase 1). Every message is sealed (phoneCrypto.ts); the relay only sees the
// sealed text. The QR code the computer shows carries pairingPayload().
import { open, seal } from './phoneCrypto';

export const PHONE_PROTOCOL_VERSION = 1;
export const PHONE_MAX_FRAME_BYTES = 4 * 1024 * 1024;
const PAIR_PREFIX = 'alphonso-pair:';

/** What a phone may ask the computer to do (phoneCalls.ts maps each to the computer's own function). */
export type PhoneCallName = 'chat.send' | 'request.approveStep' | 'request.rejectStep' | 'request.stop' | 'request.carryOn' | 'request.cancel' | 'plan.run' | 'plan.cancel';
/** What the computer mirrors to a phone. `computer`: its name, model and modes, never secrets. */
export type MirroredStore = 'requests' | 'stepOutputs' | 'chat' | 'computer';
export interface PhoneNotification {
  key: string;
  title: string;
  body: string;
  requestId: string;
  stepId?: string;
  actions: Array<'approve' | 'reject' | 'open'>;
}

export type PhoneMessage =
  | { id: string; kind: 'call'; name: PhoneCallName; args: unknown }
  | { id: string; kind: 'result'; ok: boolean; value?: unknown; error?: string }
  | { id: string; kind: 'snapshot'; store: MirroredStore; data: unknown; version: number }
  | { id: string; kind: 'change'; store: MirroredStore; data: unknown; version: number }
  | { id: string; kind: 'notice'; notification: PhoneNotification };

export interface PhoneKeys { theirPublic: string; myPrivate: string }

export interface PairingInfo {
  version: number;
  computerId: string;
  computerPublicKey: string;
  computerName: string;
  relayUrl: string;
}

export function pairingPayload(input: { computerId: string; computerPublicKey: string; computerName: string; relayUrl: string }): string {
  return PAIR_PREFIX + JSON.stringify({ version: PHONE_PROTOCOL_VERSION, ...input });
}

/** The pairing info in a scanned QR code, or null when it isn't Alphonso's (or is a version this app doesn't speak). */
export function readPairingPayload(text: string): PairingInfo | null {
  if (typeof text !== 'string' || !text.startsWith(PAIR_PREFIX)) return null;
  try {
    const v = JSON.parse(text.slice(PAIR_PREFIX.length));
    const fields = ['computerId', 'computerPublicKey', 'computerName', 'relayUrl'] as const;
    if (v?.version !== PHONE_PROTOCOL_VERSION || fields.some((f) => typeof v[f] !== 'string' || !v[f])) return null;
    return { version: v.version, computerId: v.computerId, computerPublicKey: v.computerPublicKey, computerName: v.computerName, relayUrl: v.relayUrl };
  } catch {
    return null;
  }
}

const KINDS = new Set(['call', 'result', 'snapshot', 'change', 'notice']);
function isMessage(v: unknown): v is PhoneMessage {
  const m = v as { id?: unknown; kind?: unknown } | null;
  return !!m && typeof m === 'object' && typeof m.id === 'string' && KINDS.has(String(m.kind));
}

export async function encodeMessage(msg: PhoneMessage, keys: PhoneKeys): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(msg));
  if (bytes.length > PHONE_MAX_FRAME_BYTES) throw new Error(`Message too large to send (${bytes.length} bytes; the limit is ${PHONE_MAX_FRAME_BYTES}).`);
  return seal(bytes, keys.theirPublic, keys.myPrivate);
}

/** The message, or null when the frame doesn't open or isn't a message this version knows. */
export async function decodeMessage(frame: string, keys: PhoneKeys): Promise<PhoneMessage | null> {
  const bytes = await open(frame, keys.theirPublic, keys.myPrivate);
  if (!bytes) return null;
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return isMessage(v) ? v : null;
  } catch {
    return null;
  }
}
