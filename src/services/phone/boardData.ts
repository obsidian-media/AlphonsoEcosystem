// Where the Requests board reads its data and sends its actions (phone app, phase 1).
// On the computer: the stores and the engine directly (localBoardData, today's behaviour).
// On the phone: the mirror and named calls (remoteData.ts). The board itself is the same.
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { getJoseRequest, listJoseRequests, type JoseRequest } from '../jose/joseRequestStore';
import { getStepOutput, type StepOutput } from '../jose/joseStepOutputs';
import { stopRequest } from '../jose/joseStop';
import { cancelPlan, runApprovedPlan } from '../jose/submitToJose';
import { approveRequestStep, cancelRequest, carryOnRequest, rejectRequestStep } from '../joseExecutionEngineService';
import { sendBackStep } from '../jose/sendBackStep';
import { editSendText } from '../marcus/editSendText';

export interface BoardData {
  requests(): JoseRequest[];
  request(id: string): JoseRequest | null;
  stepOutput(commandId: string, stepId: string): StepOutput | null;
  approveStep(requestId: string, stepId: string): Promise<string>;
  rejectStep(requestId: string, stepId: string): string | Promise<string>;
  /** Send a waiting send's work back with a reason (phone app phase 2). */
  sendBack(requestId: string, stepId: string, reason: string): Promise<string>;
  /** Change the text a waiting send sends; `baseText` is the text you were shown. */
  editSendText(requestId: string, stepId: string, text: string, baseText: string): Promise<string>;
  stop(requestId: string): string | Promise<string>;
  carryOn(requestId: string): Promise<string>;
  cancel(requestId: string): string | Promise<string>;
  runPlan(requestId: string): Promise<string>;
  cancelPlan(requestId: string): string | Promise<string>;
  subscribe(listener: () => void): () => void;
  /** True while the computer can't be reached: buttons that act are off. */
  readOnly: boolean;
  /** True on the computer itself: the board's other tools (edit, templates, pickers) are there. */
  local: boolean;
  /** Why it is read-only, when it is. */
  readOnlyReason?: string;
}

/** The board's words for a run's result (unchanged from before the seam). */
export function runResultText(result: any): string {
  if (result?.reason === 'plan_rejected') return `The plan didn't pass the checks: ${(result.problems || []).join(' ')} It is still waiting.`;
  return result?.command?.userReport?.summary || result?.reason || (result?.ok ? 'Done.' : 'It could not run.');
}

/** The board's words for an edit of a send's text. */
export function sendTextAnswer(result: { ok: boolean; reason?: string }): string {
  return result.ok ? 'Saved. Marcus sends your text once you approve it.' : String(result.reason || 'It could not be saved.');
}

export const localBoardData: BoardData = {
  requests: () => listJoseRequests(),
  request: (id) => getJoseRequest(id),
  stepOutput: (commandId, stepId) => getStepOutput(commandId, stepId),
  approveStep: async (requestId, stepId) => {
    const result: any = await approveRequestStep(requestId, stepId);
    return result?.summary || (result?.ok ? 'Done.' : 'It could not run.');
  },
  // Answered at once on the computer, as before the seam.
  rejectStep: (requestId, stepId) => rejectRequestStep(requestId, stepId).summary,
  sendBack: async (requestId, stepId, reason) => (await sendBackStep(requestId, stepId, reason)).summary,
  editSendText: async (requestId, stepId, text, baseText) => sendTextAnswer(editSendText(requestId, stepId, text, baseText)),
  stop: (requestId) => stopRequest(requestId).summary,
  carryOn: async (requestId) => runResultText(await carryOnRequest(requestId)),
  cancel: (requestId) => cancelRequest(requestId).summary,
  runPlan: async (requestId) => runResultText(await runApprovedPlan(requestId)),
  cancelPlan: (requestId) => { cancelPlan(requestId); return ''; },
  subscribe: () => () => {},
  readOnly: false,
  local: true,
};

const BoardDataContext = createContext<BoardData>(localBoardData);
export function BoardDataProvider({ value, children }: { value: BoardData; children: ReactNode }) {
  return createElement(BoardDataContext.Provider, { value }, children);
}
export function useBoardData(): BoardData { return useContext(BoardDataContext); }
