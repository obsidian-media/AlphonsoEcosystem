// The phone's side of the board and Chat (phone app, phase 1): what the computer last
// sent (kept, so it shows while the computer is off), actions as named calls, and chat
// messages typed while offline, sent once when the computer is back.
import { randomId } from '../../lib/randomId';
import type { JoseRequest } from '../jose/joseRequestStore';
import type { StepOutput } from '../jose/joseStepOutputs';
import type { BoardData } from './boardData';
import type { MirroredStore, PhoneCallName } from './phoneProtocol';
import type { MediaRef, PhoneProject } from './contentMirror';
import type { CalendarItem } from '../contentFactory/calendarView';
import { fetchPreview, type PreviewStore } from '../../mobile/previewFetch';

export interface PhoneTransport {
  call(name: PhoneCallName, args: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }>;
  onMirror(fn: (msg: { kind: 'snapshot' | 'change'; store: MirroredStore; data: unknown; version: number }) => void): () => void;
  onStatus(fn: (online: boolean, sinceMs: number | null) => void): () => void;
  online(): boolean;
  offlineSince(): number | null;
}

export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; atMs: number; queued?: boolean }
export interface ChatData {
  messages(): ChatMessage[];
  send(text: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  readOnly: boolean;
}

const MIRROR_KEY = 'alphonso_phone_mirror_v1';
const QUEUE_KEY = 'alphonso_phone_outbox_v1';

export function offlineLine(sinceMs: number | null): string {
  if (!sinceMs) return 'Your computer is offline.';
  const d = new Date(sinceMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `Your computer is offline since ${hh}:${mm}.`;
}

type Content = { projects: PhoneProject[]; brands: Array<{ id: string; name: string }>; calendar: CalendarItem[] };
type Mirror = { requests: JoseRequest[]; stepOutputs: Record<string, StepOutput[]>; chat: ChatMessage[]; computer: Record<string, unknown>; content: Content };
const EMPTY: Mirror = { requests: [], stepOutputs: {}, chat: [], computer: {}, content: { projects: [], brands: [], calendar: [] } };

/** Miya Studio and the Calendar on the phone (phase 2): the mirrored content store, its calls, previews. */
export interface StudioData {
  projects(): PhoneProject[];
  brands(): Array<{ id: string; name: string }>;
  calendar(): CalendarItem[];
  call(name: PhoneCallName, args: Record<string, unknown>): Promise<{ ok: true; value: any } | { ok: false; reason: string }>;
  preview(ref: MediaRef, confirm: (bytes: number) => Promise<boolean>): Promise<{ ok: true; url: string } | { ok: false; reason: string }>;
  subscribe(listener: () => void): () => void;
  readonly readOnly: boolean;
  readonly readOnlyReason?: string;
}

/** The phone's own parts for previews (mobile/src/native.ts); none in tests. */
export interface PhonePreviewParts { previewStore?: PreviewStore; network?: () => Promise<'wifi' | 'cellular' | 'none'> }
const noStore: PreviewStore = { get: async () => null, put: async () => '', remove: async () => undefined, keys: async () => [] };

function load<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}

export function createRemoteData(transport: PhoneTransport, parts: PhonePreviewParts = {}) {
  let mirror: Mirror = { ...EMPTY, ...load<Partial<Mirror>>(MIRROR_KEY, {}) };
  const versions = new Map<MirroredStore, number | null>();
  let outbox: Array<{ messageId: string; text: string; atMs: number }> = load(QUEUE_KEY, []);
  const sending = new Set<string>();
  const listeners = new Set<() => void>();
  const changed = () => {
    try { localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror)); } catch { /* full: the screen still has it */ }
    for (const l of listeners) l();
  };
  const saveOutbox = () => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(outbox)); } catch { /* kept in memory */ } };

  transport.onMirror((msg) => {
    const last = versions.get(msg.store);
    if (msg.kind === 'change' && last != null && msg.version <= last) return;
    versions.set(msg.store, msg.version);
    mirror = { ...mirror, [msg.store]: msg.data as never };
    changed();
  });

  async function flushOutbox() {
    for (const item of [...outbox]) {
      if (!transport.online() || sending.has(item.messageId)) continue;
      sending.add(item.messageId);
      try {
        const result = await transport.call('chat.send', { messageId: item.messageId, text: item.text });
        if (result.ok) { outbox = outbox.filter((o) => o.messageId !== item.messageId); saveOutbox(); }
      } finally {
        sending.delete(item.messageId);
      }
    }
    changed();
  }

  async function reconnected() {
    // A fresh snapshot replaces everything the phone had: never merged with stale data.
    const result = await transport.call('mirror.snapshot', {});
    if (result.ok && result.value) {
      mirror = { ...EMPTY, ...(result.value as Partial<Mirror>) };
      versions.clear();
      changed();
    }
    await flushOutbox();
  }
  transport.onStatus((online) => { if (online) void reconnected(); else changed(); });

  const act = async (name: PhoneCallName, args: Record<string, string>): Promise<string> => {
    if (!transport.online()) return offlineLine(transport.offlineSince());
    const result = await transport.call(name, args);
    return result.ok ? String(result.value ?? '') : String(result.error || 'It could not run.');
  };

  const board: BoardData = {
    requests: () => mirror.requests,
    request: (id) => mirror.requests.find((r) => r.id === id) || null,
    stepOutput: (commandId, stepId) => (mirror.stepOutputs[commandId] || []).find((o: any) => o.stepId === stepId) || null,
    approveStep: (requestId, stepId) => act('request.approveStep', { requestId, stepId }),
    rejectStep: (requestId, stepId) => act('request.rejectStep', { requestId, stepId }),
    sendBack: (requestId, stepId, reason) => act('request.sendBack', { requestId, stepId, reason }),
    editSendText: (requestId, stepId, text, baseText) => act('request.editSendText', { requestId, stepId, text, baseText }),
    stop: (requestId) => act('request.stop', { requestId }),
    carryOn: (requestId) => act('request.carryOn', { requestId }),
    cancel: (requestId) => act('request.cancel', { requestId }),
    runPlan: (requestId) => act('plan.run', { requestId }),
    cancelPlan: (requestId) => act('plan.cancel', { requestId }),
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    get readOnly() { return !transport.online(); },
    get readOnlyReason() { return transport.online() ? undefined : offlineLine(transport.offlineSince()); },
    local: false,
  };

  const chat: ChatData = {
    messages: () => [
      ...mirror.chat,
      ...outbox.map((o) => ({ id: o.messageId, role: 'user' as const, text: o.text, atMs: o.atMs, queued: true })),
    ],
    send: async (text) => {
      const clean = text.trim();
      if (!clean) return;
      outbox = [...outbox, { messageId: randomId('msg'), text: clean, atMs: Date.now() }];
      saveOutbox();
      changed();
      await flushOutbox();
    },
    subscribe: board.subscribe,
    get readOnly() { return false; },
  };

  const studio: StudioData = {
    projects: () => mirror.content?.projects || [],
    brands: () => mirror.content?.brands || [],
    calendar: () => mirror.content?.calendar || [],
    call: async (name, args) => {
      if (!transport.online()) return { ok: false, reason: offlineLine(transport.offlineSince()) };
      const result = await transport.call(name, args);
      return result.ok ? { ok: true, value: result.value } : { ok: false, reason: String(result.error || 'It could not run.') };
    },
    preview: (ref, confirm) => fetchPreview(ref, {
      call: (name, args) => transport.call(name, args),
      store: parts.previewStore || noStore,
      network: parts.network || (async () => 'wifi'),
      confirm,
    }),
    subscribe: board.subscribe,
    get readOnly() { return !transport.online(); },
    get readOnlyReason() { return transport.online() ? undefined : offlineLine(transport.offlineSince()); },
  };

  return { board, chat, studio, reconnected };
}
