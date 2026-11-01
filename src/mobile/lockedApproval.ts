// A step that spends, sends or publishes, or deletes (LOCKED_EFFECTS) is approved from the
// phone only after Face ID / fingerprint confirms (owner, 2026-10-31), whether or not the
// app's own lock is on. The computer still decides everything else.
import { agentName } from '../services/jose/agentNames';
import { LOCKED_EFFECTS, type JoseEffect } from '../services/jose/joseEffects';
import type { BoardData } from '../services/phone/boardData';
import type { PhoneLock } from './MobileApp';

export const NOT_CONFIRMED = "Not approved: Face ID / fingerprint didn't confirm it.";

/** True when the step spends, sends or publishes, or deletes; a step the phone doesn't know yet counts as locked. */
export function isLockedStep(board: Pick<BoardData, 'request'>, requestId: string, stepId: string): { locked: boolean; agent?: string } {
  const step = board.request(requestId)?.steps?.find((s) => s.stepId === stepId);
  if (!step) return { locked: true };
  const effects = (step.effects || []) as JoseEffect[];
  return { locked: effects.some((e) => LOCKED_EFFECTS.includes(e)), agent: step.agent };
}

export function withLockedConfirm<T extends Pick<BoardData, 'request' | 'approveStep'>>(board: T, lock: PhoneLock): T {
  // The board's getters (readOnly) stay live: the wrapper inherits them instead of copying.
  const wrapped = Object.create(board) as T;
  return Object.assign(wrapped, {
    approveStep: async (requestId: string, stepId: string) => {
      const { locked, agent } = isLockedStep(board, requestId, stepId);
      if (locked) {
        const who = agent ? `${agentName(agent)}'s step` : 'this step';
        if (!(await lock.confirm(`Approve ${who}`, { strict: true }))) return NOT_CONFIRMED;
      }
      return board.approveStep(requestId, stepId);
    },
  });
}
