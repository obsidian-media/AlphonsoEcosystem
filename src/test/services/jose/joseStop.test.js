// Jose phase 7: stopping a running request. Finished work is kept, the running step's model
// call is cancelled, nothing new starts, and the request ends "stopped".
import { beforeEach, describe, expect, it, vi } from 'vitest';

let signalNow = null;
const calls = [];
vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  withAgentModel: async (_a, _m, fn) => fn(),
  getAgentModelOverride: () => null,
  generateAgentLlmResponse: vi.fn(async (_agent, opts) => {
    if (_agent !== 'alphonso') return { response: '{"decisions": []}' };
    // Alphonso's three steps run in order: the first call is A, then B, then C.
    const step = 'ABC'[calls.length] || '?';
    const { getAgentSignal } = await import('../../../lib/agentSignals');
    signalNow = opts?.signal || getAgentSignal('alphonso');
    calls.push({ step, signal: signalNow });
    if (step === 'B') {
      const { listJoseRequests } = await import('../../../services/jose/joseRequestStore');
      const { stopRequest } = await import('../../../services/jose/joseStop');
      const { claimProject } = await import('../../../services/alphonso/projectLock');
      const signal = signalNow;
      claimProject('D:/shop', listJoseRequests()[0].id);
      stopRequest(listJoseRequests()[0].id);
      if (globalThis.__bFinishes) return { response: 'B finished.' };
      await new Promise((resolve, reject) => {
        if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        setTimeout(resolve, 2000);
      });
      return { response: 'B finished late.' };
    }
    return { response: `Done ${step}.` };
  }),
}));
vi.mock('../../../services/jose/joseStop', async (orig) => ({
  ...(await orig()),
  stopWaitsFor: (assignment) => Boolean(globalThis.__bFinishes) && assignment.stepId === 'b',
}));

import { runJoseCommandExecutionPipeline, carryOnRequest } from '../../../services/joseExecutionEngineService';
import { getJoseRequest, listJoseRequests } from '../../../services/jose/joseRequestStore';
import { stopRequest, NOT_RUNNING, STOPPED_LINE } from '../../../services/jose/joseStop';
import { projectHolder } from '../../../services/alphonso/projectLock';

const step = (id, needs) => ({
  agent: 'alphonso', actionType: 'assistant_write', stepId: id, title: `STEP-${id.toUpperCase()}`, rationale: 't', riskLevel: 'low',
  requiresApproval: false, commandPreview: `STEP-${id.toUpperCase()}`, fragments: [], effects: ['write_own_work'], needs, instruction: `STEP-${id.toUpperCase()}`,
});
const run = () => runJoseCommandExecutionPipeline({
  commandText: 'Write three notes', source: 'test', zeroCostMode: true,
  assignments: [step('a', []), step('b', ['a']), step('c', ['b'])],
});
const statusOf = (request, id) => request.steps.find((s) => s.stepId === id)?.status;

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  globalThis.__bFinishes = false;
});

describe('stopping a running request', () => {
  it('stops after the running step: finished work kept, nothing new starts, status stopped', async () => {
    const result = await run();
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(request.status).toBe('stopped');
    expect(statusOf(request, 'a')).toBe('done');
    expect(statusOf(request, 'b')).toBe('stopped');
    expect(statusOf(request, 'c')).toBe('not_run');
    expect(calls.find((c) => c.step === 'B').signal.aborted).toBe(true);
    expect(calls.some((c) => c.step === 'C')).toBe(false);
    expect(calls.filter((c) => c.step === 'B')).toHaveLength(1);
    expect(request.changeLog.at(-1).text).toBe(STOPPED_LINE);
  });

  it('a step that must finish (a send) finishes once, then the request stops', async () => {
    globalThis.__bFinishes = true;
    const result = await run();
    const request = getJoseRequest(`jose-request-${result.commandId}`);
    expect(calls.find((c) => c.step === 'B').signal).toBeNull();
    expect(statusOf(request, 'b')).toBe('done');
    expect(statusOf(request, 'c')).toBe('not_run');
    expect(request.status).toBe('stopped');
  });

  it('stopping releases the project lock the request holds', async () => {
    await run();
    expect(projectHolder('D:/shop')).toBeNull();
  });

  it('a stopped request cannot carry on', async () => {
    const result = await run();
    expect((await carryOnRequest(`jose-request-${result.commandId}`)).ok).toBe(false);
  });

  it("refuses a request that isn't running", async () => {
    const result = await run();
    expect(stopRequest(`jose-request-${result.commandId}`)).toEqual({ ok: false, summary: NOT_RUNNING });
    expect(stopRequest('nope')).toEqual({ ok: false, summary: NOT_RUNNING });
    expect(listJoseRequests()).toHaveLength(1);
  });
});
