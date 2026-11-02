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
import { contentMirrorData } from './contentMirror';
import { boardroomMirrorData, memoryMirrorData, projectsMirrorData } from './phase3Mirror';
import { connectorsMirrorData, refreshModelChoices, settingsMirrorData, skillsMirrorData, teamsMirrorData } from './phase3bMirror';
import type { MirroredStore } from './phoneProtocol';

export const MIRROR_BATCH_MS = 500;
export const MIRROR_REQUESTS = 50;
const MIRROR_OUTPUT_REQUESTS = 20;
/** The content stores have no change events (the Calendar page polls too), so the mirror looks every 5 s and sends only what changed. */
export const CONTENT_POLL_MS = 5000;
export const MODEL_CHOICES_MS = 60_000;

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
  if (store === 'content') return clean(contentMirrorData(Date.now()));
  if (store === 'memory') return clean(memoryMirrorData());
  if (store === 'projects') return clean(projectsMirrorData());
  if (store === 'boardroom') return clean(boardroomMirrorData());
  if (store === 'settings') return clean(settingsMirrorData());
  if (store === 'teams') return clean(teamsMirrorData());
  if (store === 'skills') return clean(skillsMirrorData());
  if (store === 'connectors') return clean(connectorsMirrorData());
  const s = settings();
  return { zeroCostMode: s.zeroCostMode !== false, paidModelsAllowed: !!s.paidModels?.allowed, model: typeof s.selectedModel === 'string' ? s.selectedModel : null };
}

export function mirrorSnapshots(): Record<MirroredStore, unknown> {
  return { requests: storeData('requests'), stepOutputs: storeData('stepOutputs'), chat: storeData('chat'), computer: storeData('computer'), content: storeData('content'), memory: storeData('memory'), projects: storeData('projects'), boardroom: storeData('boardroom'), settings: storeData('settings'), teams: storeData('teams'), skills: storeData('skills'), connectors: storeData('connectors') };
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
  // These stores have no change events (the Calendar page polls too), so the mirror looks every 5 s and sends only what changed.
  const polled: MirroredStore[] = ['content', 'memory', 'projects', 'boardroom', 'settings', 'teams', 'skills', 'connectors'];
  // Model choices come from the computer's own lists (Ollama, cloud providers): read now and every minute.
  void refreshModelChoices();
  const choicesTimer = setInterval(() => { void refreshModelChoices(); }, MODEL_CHOICES_MS);
  const last = new Map(polled.map((s) => [s, JSON.stringify(storeData(s))]));
  const contentTimer = setInterval(() => {
    for (const store of polled) {
      const data = storeData(store);
      const text = JSON.stringify(data);
      if (text !== last.get(store)) { last.set(store, text); deps.publish(store, data, 'change'); }
    }
  }, CONTENT_POLL_MS);
  return () => { offRequests(); offChat(); clearInterval(contentTimer); clearInterval(choicesTimer); for (const t of timers.values()) clearTimeout(t); timers.clear(); };
}
