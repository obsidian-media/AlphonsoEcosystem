// What part A of phase 3 mirrors to a paired phone (2026-11-02): Echo's newest decisions and his
// open clean-up, the saved projects with their latest run, and Boardroom's threads with their last
// messages. Kept small on purpose: search and older messages are calls (phase3Calls.ts). A message
// that needs the reveal is masked here, so its text never leaves the computer before it.
import { listDecisions, type Decision } from '../echo/decisions';
import { openCleanup, type CleanupSet } from '../echo/cleanupStore';
import { listProjects, type SavedProject } from '../projects/projectStore';
import { listThreads, listThreadMessages, type BoardroomThread, type BoardroomThreadMessage } from '../boardroomThreadService';

export const PHONE_DECISIONS = 50;
export const PHONE_THREAD_MESSAGES = 30;
export const MASKED_LINE = 'Hidden: reveal it on the phone with Face ID or your fingerprint.';

export type PhoneThreadMessage = BoardroomThreadMessage & { masked?: true };
export interface MemoryMirror {
  decisions: Decision[];
  cleanup: { setId: string; requestId: string; stepId: string; proposals: CleanupSet['proposals'] } | null;
}
export type ProjectMirror = SavedProject & { latestRequestId: string | null };
export interface BoardroomMirror { threads: BoardroomThread[]; messages: Record<string, PhoneThreadMessage[]> }

export function memoryMirrorData(): MemoryMirror {
  const set = openCleanup();
  return {
    decisions: listDecisions().slice(0, PHONE_DECISIONS),
    cleanup: set && set.requestId && set.stepId ? { setId: set.id, requestId: set.requestId, stepId: set.stepId, proposals: set.proposals } : null,
  };
}

export function projectsMirrorData(): ProjectMirror[] {
  return listProjects().map((p) => {
    const newest = [...(p.runs || [])].sort((a, b) => b.atMs - a.atMs)[0];
    return { ...p, latestRequestId: newest?.requestId || null };
  });
}

/** A message as the phone may see it: masked until revealed. */
export function phoneMessage(m: BoardroomThreadMessage): PhoneThreadMessage {
  return m.approvalRequired && !m.confirmed ? { ...m, content: MASKED_LINE, masked: true } : m;
}

export function boardroomMirrorData(): BoardroomMirror {
  const threads = listThreads();
  const messages: Record<string, PhoneThreadMessage[]> = {};
  for (const t of threads) messages[t.id] = listThreadMessages(t.id).slice(-PHONE_THREAD_MESSAGES).map(phoneMessage);
  return { threads, messages };
}
