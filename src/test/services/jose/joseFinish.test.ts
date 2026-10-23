import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/echoMemoryService', () => ({
  runEchoPreservation: vi.fn(),
}));

import { runEchoPreservation } from '../../../services/echoMemoryService';
import { saveRequestDecisions } from '../../../services/jose/joseFinish';
import { createJoseRequest, getJoseRequest, setJoseRequestStatus } from '../../../services/jose/joseRequestStore';
import type { PlanStep } from '../../../services/jose/stepGraph';

const echo = vi.mocked(runEchoPreservation);

const steps: PlanStep[] = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] },
  { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'] },
];
const newRequest = (planSteps = steps) => {
  const request = createJoseRequest({ commandId: `c-${Math.random()}`, source: 'test', text: 'Research the launch', kind: 'normal', steps: planSteps });
  setJoseRequestStatus(request.id, 'done');
  return getJoseRequest(request.id)!;
};
const notes = (id: string) => (getJoseRequest(id)!.changeLog || []).map((c) => c.text);

beforeEach(() => {
  localStorage.clear();
  echo.mockReset();
});

describe('saveRequestDecisions', () => {
  it('asks Echo once to save what a finished request decided', async () => {
    echo.mockResolvedValueOnce({ ok: true } as never);
    const request = newRequest();
    const outputs = { facts: { summary: 'Launch is in May.' }, value: { summary: 'Worth doing.' } };
    expect(await saveRequestDecisions(request, outputs, { draftDisabled: true })).toEqual({ saved: true, note: 'Echo saved what was decided.' });
    expect(echo).toHaveBeenCalledTimes(1);
    expect(echo).toHaveBeenCalledWith('Research the launch', { packetId: request.id }, outputs, expect.objectContaining({ draftDisabled: true }));
    expect(notes(request.id)).toContain('Echo saved what was decided.');
  });

  it('does not ask again when the plan had an Echo step', async () => {
    const request = newRequest([...steps, { stepId: 'remember', agent: 'echo', actionType: 'memory_preserve', effects: ['write_own_work'], needs: ['value'] }]);
    expect((await saveRequestDecisions(request, {})).saved).toBe(false);
    expect(echo).not.toHaveBeenCalled();
  });

  it('notes an Echo failure and leaves the request as it was', async () => {
    echo.mockRejectedValueOnce(new Error('disk full'));
    const request = newRequest();
    const result = await saveRequestDecisions(request, {});
    expect(result).toEqual({ saved: false, note: "Echo couldn't save what was decided: disk full" });
    expect(getJoseRequest(request.id)!.status).toBe('done');
    expect(notes(request.id)).toContain("Echo couldn't save what was decided: disk full");
  });
});
