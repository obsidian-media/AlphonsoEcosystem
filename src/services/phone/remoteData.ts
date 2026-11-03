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
import type { BoardroomMirror, MemoryMirror, ProjectMirror } from './phase3Mirror';
import type { PhoneConnector, PhoneSettings, PhoneSkills, PhoneTeam } from './phase3bMirror';
import { fetchPreview, type PreviewStore } from '../../mobile/previewFetch';
import { answerOnPhone, type Ask, type PhoneEngine } from './phoneAnswer';

export interface PhoneTransport {
  call(name: PhoneCallName, args: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }>;
  onMirror(fn: (msg: { kind: 'snapshot' | 'change'; store: MirroredStore; data: unknown; version: number }) => void): () => void;
  onStatus(fn: (online: boolean, sinceMs: number | null) => void): () => void;
  online(): boolean;
  offlineSince(): number | null;
}

/** `answeredBy`: answered on the phone (phase 4); `note`: why a waiting message is still waiting. */
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; atMs: number; queued?: boolean; answeredBy?: PhoneEngine; note?: string }
export interface ChatData {
  messages(): ChatMessage[];
  send(text: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  readOnly: boolean;
  /** Phase 4: answer a waiting message on the phone with the engine the user picked. */
  answerHere(messageId: string, engine: PhoneEngine): Promise<void>;
  /** The message being answered on the phone, or null. */
  answering(): string | null;
}

/** The phone's own models (phase 4): each gives a way to ask, or null when it can't be used now. */
export interface PhoneAnswerParts { asks: Partial<Record<PhoneEngine, () => Promise<Ask | null>>> }

const ENGINE_UNAVAILABLE: Record<PhoneEngine, string> = {
  phone: "Apple's model isn't available on this phone.",
  openrouter: 'Add a free OpenRouter key in Settings → On this phone first.',
};

const MIRROR_KEY = 'alphonso_phone_mirror_v1';
const QUEUE_KEY = 'alphonso_phone_outbox_v1';
const LOCAL_ANSWERS_KEY = 'alphonso_phone_local_answers_v1';
type LocalAnswer = { messageId: string; question: string; answer: string; answeredBy: PhoneEngine; atMs: number; copied: boolean };

export function offlineLine(sinceMs: number | null): string {
  if (!sinceMs) return 'Your computer is offline.';
  const d = new Date(sinceMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `Your computer is offline since ${hh}:${mm}.`;
}

type Content = { projects: PhoneProject[]; brands: Array<{ id: string; name: string }>; calendar: CalendarItem[] };
type Mirror = {
  requests: JoseRequest[]; stepOutputs: Record<string, StepOutput[]>; chat: ChatMessage[]; computer: Record<string, unknown>; content: Content;
  memory: MemoryMirror; projects: ProjectMirror[]; boardroom: BoardroomMirror;
  settings: PhoneSettings | null; teams: PhoneTeam[]; skills: PhoneSkills; connectors: PhoneConnector[];
};
const EMPTY: Mirror = {
  requests: [], stepOutputs: {}, chat: [], computer: {}, content: { projects: [], brands: [], calendar: [] },
  memory: { decisions: [], cleanup: null }, projects: [], boardroom: { threads: [], messages: {} },
  settings: null, teams: [], skills: { skills: [], refused: [] }, connectors: [],
};

/** Why a call was refused (empty when it wasn't). */
export function reasonOf(result: { ok: boolean } & { reason?: string }): string { return result.ok ? '' : String(result.reason || ''); }

/** Memory, Projects and Boardroom on the phone (phase 3 part A): the mirrored stores and their calls. */
export interface MoreData {
  memory(): MemoryMirror;
  projects(): ProjectMirror[];
  boardroom(): BoardroomMirror;
  /** Part B: null until the computer sends its settings. */
  settings(): PhoneSettings | null;
  teams(): PhoneTeam[];
  skills(): PhoneSkills;
  connectors(): PhoneConnector[];
  call(name: PhoneCallName, args: Record<string, unknown>): Promise<{ ok: true; value: any } | { ok: false; reason: string }>;
  subscribe(listener: () => void): () => void;
  readonly readOnly: boolean;
  readonly readOnlyReason?: string;
}

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

/** `memoryOnly` (the demo, phone phase 3 part C): nothing is read from or written to the phone's storage. */
export function createRemoteData(transport: PhoneTransport, parts: PhonePreviewParts = {}, options: { memoryOnly?: boolean } = {}, answer: PhoneAnswerParts = { asks: {} }) {
  const memoryOnly = options.memoryOnly === true;
  let mirror: Mirror = { ...EMPTY, ...(memoryOnly ? {} : load<Partial<Mirror>>(MIRROR_KEY, {})) };
  const versions = new Map<MirroredStore, number | null>();
  let outbox: Array<{ messageId: string; text: string; atMs: number; note?: string }> = memoryOnly ? [] : load(QUEUE_KEY, []);
  let localAnswers: LocalAnswer[] = memoryOnly ? [] : load(LOCAL_ANSWERS_KEY, []);
  let answeringId: string | null = null;
  const sending = new Set<string>();
  const listeners = new Set<() => void>();
  const inMirrorChat = (id: string) => (mirror.chat || []).some((m) => m.id === id);
  const saveLocalAnswers = () => { if (memoryOnly) return; try { localStorage.setItem(LOCAL_ANSWERS_KEY, JSON.stringify(localAnswers)); } catch { /* kept in memory */ } };
  const changed = () => {
    // A phone answer the computer now holds is shown from its copy.
    const kept = localAnswers.filter((a) => !(a.copied && inMirrorChat(a.messageId)));
    if (kept.length !== localAnswers.length) { localAnswers = kept; saveLocalAnswers(); }
    if (!memoryOnly) { try { localStorage.setItem(MIRROR_KEY, JSON.stringify(mirror)); } catch { /* full: the screen still has it */ } }
    for (const l of listeners) l();
  };
  const saveOutbox = () => { if (memoryOnly) return; try { localStorage.setItem(QUEUE_KEY, JSON.stringify(outbox)); } catch { /* kept in memory */ } };

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

  // Phase 4: what the phone answered while the computer was off joins its conversation, once.
  async function copyPhoneAnswers() {
    for (const a of localAnswers.filter((x) => !x.copied)) {
      if (!transport.online()) return;
      const result = await transport.call('chat.phoneAnswered', { messageId: a.messageId, question: a.question, answer: a.answer, answeredBy: a.answeredBy, atMs: a.atMs });
      if (result.ok) { a.copied = true; saveLocalAnswers(); }
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
    await copyPhoneAnswers();
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

  const putBack = (item: { messageId: string; text: string; atMs: number }, note: string) => {
    outbox = [...outbox, { ...item, note }].sort((a, b) => a.atMs - b.atMs);
    saveOutbox();
  };

  const chat: ChatData = {
    messages: () => [
      ...mirror.chat,
      ...localAnswers.filter((a) => !inMirrorChat(a.messageId)).flatMap((a): ChatMessage[] => [
        { id: a.messageId, role: 'user', text: a.question, atMs: a.atMs },
        { id: `${a.messageId}-a`, role: 'assistant', text: a.answer, atMs: a.atMs, answeredBy: a.answeredBy },
      ]),
      ...outbox.map((o) => ({ id: o.messageId, role: 'user' as const, text: o.text, atMs: o.atMs, queued: true, ...(o.note ? { note: o.note } : {}) })),
    ],
    answering: () => answeringId,
    answerHere: async (messageId, engine) => {
      const item = outbox.find((o) => o.messageId === messageId);
      if (answeringId || !item) return;
      answeringId = messageId;
      // Out of the outbox first, so a computer coming back meanwhile doesn't also get it.
      outbox = outbox.filter((o) => o.messageId !== messageId);
      saveOutbox();
      changed();
      try {
        const history = chat.messages().filter((m) => !m.queued).map((m) => ({ role: m.role, text: m.text }));
        const ask = await (answer.asks[engine]?.() ?? Promise.resolve(null)).catch(() => null);
        if (!ask) { putBack(item, ENGINE_UNAVAILABLE[engine]); return; }
        const result = await answerOnPhone({ text: item.text, history, decisions: mirror.memory?.decisions || [], ask });
        if (result.kind === 'answer') {
          localAnswers = [...localAnswers, { messageId, question: item.text, answer: result.text, answeredBy: engine, atMs: item.atMs, copied: false }];
          saveLocalAnswers();
        } else {
          putBack(item, result.reason);
        }
      } finally {
        answeringId = null;
        changed();
      }
      // The computer may have come back while the phone was answering: copy the answer, or send
      // a message that went back to waiting, now rather than at the next reconnect.
      if (transport.online()) { await copyPhoneAnswers(); await flushOutbox(); }
    },
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

  const more: MoreData = {
    memory: () => mirror.memory || EMPTY.memory,
    projects: () => mirror.projects || EMPTY.projects,
    boardroom: () => mirror.boardroom || EMPTY.boardroom,
    settings: () => mirror.settings || EMPTY.settings,
    teams: () => mirror.teams || EMPTY.teams,
    skills: () => mirror.skills || EMPTY.skills,
    connectors: () => mirror.connectors || EMPTY.connectors,
    call: studio.call,
    subscribe: board.subscribe,
    get readOnly() { return !transport.online(); },
    get readOnlyReason() { return transport.online() ? undefined : offlineLine(transport.offlineSince()); },
  };

  return { board, chat, studio, more, reconnected };
}
