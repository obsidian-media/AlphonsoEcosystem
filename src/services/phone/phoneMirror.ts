// What the computer mirrors to a paired phone (phone app, phase 1): the requests, their
// step outputs, the phone's conversation and a few facts about the computer. Never a
// secret: secret-named fields are dropped and keys inside text are hidden before anything
// leaves the computer. A phone asks for everything when it connects (the `mirror.snapshot`
// call); after that, changes come at most once per MIRROR_BATCH_MS per store.
import { listJoseRequests, onRequestStatusChange } from '../jose/joseRequestStore';
import { listStepOutputs } from '../jose/joseStepOutputs';
import { stripSecretFields } from '../workspaceExportService';
import { redactText } from '../sentinel/exactChecks';
import { listPhoneChat, onPhoneChatChange } from './phoneChatLog';
import type { MirroredStore } from './phoneProtocol';

export const MIRROR_BATCH_MS = 500;
export const MIRROR_REQUESTS = 50;
const MIRROR_OUTPUT_REQUESTS = 20;

function clean(value: unknown): unknown {
  const stripped = stripSecretFields(value);
  const hide = (v: unknown): unknown => {
    if (typeof v === 'string') return redactText(v);
    if (Array.isArray(v)) return v.map(hide);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hide(x)]));
    return v;
  };
  return hide(stripped);
}

function settings(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem('alphonso_settings') || '{}') || {}; } catch { return {}; }
}

function storeData(store: MirroredStore): unknown {
  if (store === 'requests') return clean(listJoseRequests().slice(0, MIRROR_REQUESTS));
  if (store === 'stepOutputs') {
    const out: Record<string, unknown> = {};
    for (const r of listJoseRequests().slice(0, MIRROR_OUTPUT_REQUESTS)) out[r.commandId] = listStepOutputs(r.commandId);
    return clean(out);
  }
  if (store === 'chat') return clean(listPhoneChat());
  const s = settings();
  return { zeroCostMode: s.zeroCostMode !== false, paidModelsAllowed: !!s.paidModels?.allowed, model: typeof s.selectedModel === 'string' ? s.selectedModel : null };
}

export function mirrorSnapshots(): Record<MirroredStore, unknown> {
  return { requests: storeData('requests'), stepOutputs: storeData('stepOutputs'), chat: storeData('chat'), computer: storeData('computer') };
}

/** Send changes to the phones as they happen, batched. Returns stop(). */
export function startPhoneMirror(deps: { publish: (store: MirroredStore, data: unknown, kind: 'snapshot' | 'change') => void }): () => void {
  const timers = new Map<MirroredStore, ReturnType<typeof setTimeout>>();
  const schedule = (store: MirroredStore) => {
    if (timers.has(store)) return;
    timers.set(store, setTimeout(() => { timers.delete(store); deps.publish(store, storeData(store), 'change'); }, MIRROR_BATCH_MS));
  };
  const offRequests = onRequestStatusChange(() => { schedule('requests'); schedule('stepOutputs'); });
  const offChat = onPhoneChatChange(() => schedule('chat'));
  return () => { offRequests(); offChat(); for (const t of timers.values()) clearTimeout(t); timers.clear(); };
}
