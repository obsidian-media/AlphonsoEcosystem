// The phone's Memory, Projects and Boardroom calls (phone app phase 3 part A, 2026-11-02). Each maps to
// the function the computer's own screen uses; a phone gets nothing the computer lacks. A refusal is
// thrown, so the phone gets it as the call's error.
import { listAgentProfiles } from '../../agents/agentRegistry';
import { searchDecisions } from '../echo/recall';
import { applyCleanupStep, dismissCleanupStep } from '../echo/echoPicks';
import { openCleanup } from '../echo/cleanupStore';
import { saveProject, startProject, PROJECT_NEEDS_TEXT, type ProjectIntake } from '../projects/projectStore';
import {
  acknowledgeThreadMessage, confirmThreadMessage, createThread, getThread, listThreadMessages,
} from '../boardroomThreadService';
import { concludeThread, creativeBriefThread, distributeThread, phoneApprove, runBoardroomReplies } from '../boardroomReplies';
import { redactText } from '../sentinel/exactChecks';
import { stripSecretFields } from '../workspaceExportService';
import { phoneMessage, PHONE_THREAD_MESSAGES } from './phase3Mirror';

export type Phase3CallName =
  | 'memory.search' | 'memory.applyCleanup' | 'memory.dismissCleanup'
  | 'project.create' | 'project.start'
  | 'boardroom.createThread' | 'boardroom.send' | 'boardroom.earlier' | 'boardroom.acknowledge' | 'boardroom.reveal'
  | 'boardroom.conclude' | 'boardroom.distribute' | 'boardroom.creativeBrief';

export const STALE = "This changed on your computer; here's the latest.";
export const PHONE_SEARCH_RESULTS = 20;
const THREAD_GONE = 'That thread is no longer on your computer.';
const MESSAGE_GONE = 'That message is no longer on your computer.';
const SEEN_LIMIT = 500;

type Args = Record<string, unknown>;
type Call = (args: Args, fromDeviceId: string) => Promise<unknown>;

let seen = new Set<string>();
export function resetPhase3CallsForTests(): void { seen = new Set(); }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const hidden = <T>(value: T): T => {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactText(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(stripSecretFields(value)) as T;
};

function openSetStep(args: Args): { requestId: string; stepId: string } {
  const set = openCleanup();
  if (!set || set.id !== str(args.setId)) throw new Error(STALE);
  return { requestId: str(args.requestId), stepId: str(args.stepId) };
}

function asIntake(value: unknown): ProjectIntake {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const priority = v.priority === 'low' || v.priority === 'high' ? v.priority : 'medium';
  const field = (k: string) => str(v[k]).slice(0, 4000);
  return {
    name: field('name').slice(0, 200), description: field('description'), stack: field('stack'), deadline: field('deadline'),
    type: field('type'), features: field('features'), constraints: field('constraints'), risks: field('risks'), priority,
  };
}

const inBackground = (work: unknown): void => { Promise.resolve(work).catch(() => undefined); };

/** The computer's own Settings for a run started from the phone, as the Projects page passes them. */
function runSettings(): { endpoint?: string; zeroCostMode?: boolean } {
  let s: Record<string, unknown> = {};
  try { s = JSON.parse(localStorage.getItem('alphonso_settings') || '{}') || {}; } catch { /* defaults */ }
  return {
    ...(typeof s.endpoint === 'string' ? { endpoint: s.endpoint } : {}),
    ...(typeof s.zeroCostMode === 'boolean' ? { zeroCostMode: s.zeroCostMode } : {}),
  };
}

function threadOf(args: Args) {
  const thread = getThread(str(args.threadId));
  if (!thread) throw new Error(THREAD_GONE);
  return thread;
}

export const PHASE3_CALLS: Record<Phase3CallName, Call> = {
  'memory.search': async (args) => {
    const query = str(args.query).trim().slice(0, 500);
    if (!query) throw new Error('Type something to search for.');
    return hidden((await searchDecisions(query, { limit: PHONE_SEARCH_RESULTS })).slice(0, PHONE_SEARCH_RESULTS));
  },
  'memory.applyCleanup': async (args) => {
    const { requestId, stepId } = openSetStep(args);
    const result = await applyCleanupStep(requestId, stepId);
    if (!result.ok) throw new Error(result.summary);
    return result;
  },
  'memory.dismissCleanup': async (args) => {
    const { requestId, stepId } = openSetStep(args);
    const result = await dismissCleanupStep(requestId, stepId);
    if (!result.ok) throw new Error(result.summary);
    return result;
  },

  'project.create': async (args) => {
    const intake = asIntake(args.intake);
    if (!intake.name.trim() || !intake.description.trim()) throw new Error(PROJECT_NEEDS_TEXT);
    return saveProject(intake);
  },
  // Answers once the run has started (the phone gives up after 30 s; a run takes longer).
  'project.start': async (args) => {
    let started: (requestId: string) => void = () => undefined;
    const startedRun = new Promise<{ ok: true; requestId: string; reason?: string }>((resolve) => { started = (requestId) => resolve({ ok: true, requestId }); });
    const run = startProject(str(args.id), { settings: runSettings(), onStarted: (requestId) => started(requestId) });
    const result = await Promise.race([startedRun, run]);
    if (!result.ok) throw new Error(result.reason || 'The project could not start.');
    return result;
  },

  'boardroom.createThread': async (args) => {
    const topic = str(args.topic).trim().slice(0, 200);
    if (!topic) throw new Error('Give the thread a topic.');
    return createThread({ topic, participants: (listAgentProfiles() as Array<{ id: string }>).map((p) => p.id) });
  },
  'boardroom.send': async (args) => {
    const thread = threadOf(args);
    const text = str(args.text).trim().slice(0, 8000);
    const messageId = str(args.messageId);
    if (!text || !messageId) throw new Error('Nothing to send.');
    // A message sent again (the link dropped before the answer arrived) starts nothing new.
    if (!seen.has(messageId)) {
      seen.add(messageId);
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
      void runBoardroomReplies({ threadId: thread.id, text, approve: phoneApprove }).catch(() => undefined);
    }
    return { messageId };
  },
  'boardroom.earlier': async (args) => {
    const thread = threadOf(args);
    const before = Number(args.beforeSeq);
    const older = listThreadMessages(thread.id).filter((m) => m.seq < (Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER));
    return hidden(older.slice(-PHONE_THREAD_MESSAGES).map(phoneMessage));
  },
  'boardroom.acknowledge': async (args) => {
    const updated = acknowledgeThreadMessage(str(args.messageId));
    if (!updated) throw new Error(MESSAGE_GONE);
    return hidden(phoneMessage(updated));
  },
  // The phone asks for Face ID or the fingerprint before it sends this (the screen, not the call, holds the lock).
  'boardroom.reveal': async (args) => {
    const updated = confirmThreadMessage(str(args.messageId));
    if (!updated) throw new Error(MESSAGE_GONE);
    return hidden(updated);
  },

  // The agents work in the background (a model's answer often takes longer than the phone waits);
  // what happened is posted in the thread, which the phone sees through the mirror.
  'boardroom.conclude': async (args) => { inBackground(concludeThread(threadOf(args).id)); return { started: true }; },
  'boardroom.distribute': async (args) => {
    const thread = threadOf(args);
    if (!thread.governance) throw new Error('Conclude the thread first.');
    const mode = args.mode === 'slack' ? 'slack' : 'review';
    const channel = str(args.channel).trim();
    if (mode === 'slack' && !channel) throw new Error('Name the Slack channel.');
    inBackground(distributeThread(thread.id, mode, channel));
    return { started: true };
  },
  'boardroom.creativeBrief': async (args) => { inBackground(creativeBriefThread(threadOf(args).id)); return { started: true }; },
};
