import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/echo/echoSteps', () => ({ extractDecisions: vi.fn() }));

import { extractDecisions } from '../../../services/echo/echoSteps';
import { saveRequestDecisions, NOTHING_NEW } from '../../../services/jose/joseFinish';
import { createJoseRequest, getJoseRequest, setJoseRequestStatus, appendRequestNote } from '../../../services/jose/joseRequestStore';
import type { PlanStep } from '../../../services/jose/stepGraph';

const echo = vi.mocked(extractDecisions);

const steps: PlanStep[] = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] },
  { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'] },
];
let n = 0;
const newRequest = (planSteps = steps, source = 'user') => {
  n += 1;
  const request = createJoseRequest({ commandId: `c-${n}`, source, text: 'Research the launch price', kind: 'normal', steps: planSteps });
  setJoseRequestStatus(request.id, 'done');
  return getJoseRequest(request.id)!;
};
const notes = (id: string) => (getJoseRequest(id)!.changeLog || []).map((c) => c.text);
const outputs = { facts: { summary: 'Rivals charge $25 to $35.', sources: ['https://example.com/prices'] }, value: { summary: 'Price it at $29.' } };

beforeEach(() => {
  localStorage.clear();
  echo.mockReset();
});

// Agent phase 7: Echo writes down a finished request's decisions, wherever it came from.
describe('saveRequestDecisions', () => {
  it("gives Echo the request, each step's work, the change log and the sources, and notes each decision", async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [{ id: 'd1', text: 'The price is $29.' }] } as never);
    const request = newRequest();
    appendRequestNote(request.id, 'You approved Nova\'s step.');
    const result = await saveRequestDecisions(getJoseRequest(request.id)!, outputs);
    expect(result).toEqual({ saved: true, note: 'Echo remembered: The price is $29.' });
    const arg = echo.mock.calls[0][0];
    expect(arg).toMatchObject({ request: 'Research the launch price', surface: 'chat', requestId: request.id, stepIds: ['facts', 'value'], sources: ['https://example.com/prices'], packetId: request.id });
    expect(arg.work).toContain('Hector: Rivals charge $25 to $35.');
    expect(arg.work).toContain('Nova: Price it at $29.');
    expect(arg.changeLog).toContain("You approved Nova's step.");
    expect(notes(request.id)).toContain('Echo remembered: The price is $29.');
  });

  it('a Telegram request is remembered as decided on Telegram', async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    await saveRequestDecisions(newRequest(steps, 'telegram'), outputs);
    expect(echo.mock.calls[0][0].surface).toBe('telegram');
  });

  it('nothing decided → says so', async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    const request = newRequest();
    expect(await saveRequestDecisions(request, outputs)).toEqual({ saved: true, note: NOTHING_NEW });
    expect(NOTHING_NEW).toBe('Echo found nothing new to remember.');
  });

  it("does not ask again when the plan had Echo's own save step", async () => {
    const withSave = newRequest([...steps, { stepId: 'remember', agent: 'echo', actionType: 'memory_preservation', effects: ['write_own_work'], needs: ['value'] }]);
    expect((await saveRequestDecisions(withSave, {})).saved).toBe(false);
    expect(echo).not.toHaveBeenCalled();
  });

  // Found in the real app: a cleanup (or a forget) request then saved new decisions from its own result.
  it("a request that was only Echo's memory work (recall, forget, cleanup) is not saved from", async () => {
    for (const actionType of ['memory_recall', 'memory_forget', 'memory_cleanup', 'memory_digest']) {
      const only = newRequest([{ stepId: 'echo', agent: 'echo', actionType, effects: ['write_own_work'], needs: [] }]);
      expect(await saveRequestDecisions(only, { echo: { summary: 'Forgot: The launch is on Friday.' } })).toMatchObject({ saved: false });
    }
    expect(echo).not.toHaveBeenCalled();
  });

  // Found in the real app: a line of the email Alphonso wrote was saved as a decision.
  it('a draft (writing, creative or design work) is not something to save decisions from', async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    const drafted = newRequest([...steps, { stepId: 'write', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: ['value'] }]);
    await saveRequestDecisions(drafted, { ...outputs, write: { summary: 'Launch Announcement: Friday the 14th – $29.' } });
    expect(String(echo.mock.calls[0][0].work)).not.toContain('Launch Announcement');
    expect(String(echo.mock.calls[0][0].work)).toContain('Price it at $29.');
  });

  it('a request that was only a draft still gives Echo the request', async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    const onlyDraft = newRequest([{ stepId: 'write', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [] }]);
    await saveRequestDecisions(onlyDraft, { write: { summary: 'Dear Sam …' } });
    expect(echo.mock.calls[0][0]).toMatchObject({ request: 'Research the launch price', work: '' });
  });

  it("with other work too, Echo's own memory step is left out of what he saves from", async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    const mixed = newRequest([...steps, { stepId: 'ask', agent: 'echo', actionType: 'memory_recall', effects: ['read'], needs: [] }]);
    await saveRequestDecisions(mixed, { ...outputs, ask: { summary: 'Decided 26 Oct (Chat): the launch is Friday.' } });
    expect(String(echo.mock.calls[0][0].work)).not.toContain('Decided 26 Oct');
    expect(String(echo.mock.calls[0][0].work)).toContain('Price it at $29.');
  });

  // Agent roles Part C2: the weekly digest is his own memory work too.
  it('a weekly digest beside other work is left out the same way', async () => {
    echo.mockResolvedValueOnce({ ok: true, saved: [] } as never);
    const mixed = newRequest([...steps, { stepId: 'digest', agent: 'echo', actionType: 'memory_digest', effects: ['read'], needs: [] }]);
    await saveRequestDecisions(mixed, { ...outputs, digest: { summary: "This week's decisions (1): launch" } });
    expect(echo).toHaveBeenCalled();
    expect(String(echo.mock.calls[0][0].work)).not.toContain("This week's decisions");
  });

  it("notes Echo's failure and leaves the request as it was", async () => {
    echo.mockResolvedValueOnce({ ok: false, reason: "his model didn't give an answer he could read." } as never);
    const request = newRequest();
    const result = await saveRequestDecisions(request, {});
    expect(result).toEqual({ saved: false, note: "Echo couldn't save what was decided: his model didn't give an answer he could read." });
    expect(getJoseRequest(request.id)!.status).toBe('done');
  });

  it('an error thrown is noted too', async () => {
    echo.mockRejectedValueOnce(new Error('disk full'));
    const request = newRequest();
    expect(await saveRequestDecisions(request, {})).toEqual({ saved: false, note: "Echo couldn't save what was decided: disk full" });
  });
});
