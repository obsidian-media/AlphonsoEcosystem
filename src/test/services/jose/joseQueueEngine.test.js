// Jose phase 7: two requests using the local model run one after the other through the pipeline.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = [];
let releaseFirst = () => {};
vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  withAgentModel: async (_a, _m, fn) => fn(),
  getAgentModelOverride: () => null,
  generateAgentLlmResponse: vi.fn(async (agent, opts) => {
    if (agent !== 'alphonso') return { response: '{"decisions": []}' };
    const which = String(opts?.prompt || '').includes('Request: First') ? 'first' : 'second';
    calls.push(which);
    if (which === 'first') await new Promise((resolve) => { releaseFirst = resolve; });
    return { response: `Done ${which}.` };
  }),
}));

import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { listJoseRequests } from '../../../services/jose/joseRequestStore';
import { resetQueueForTests } from '../../../services/jose/joseQueue';

const step = () => ({
  agent: 'alphonso', actionType: 'assistant_write', stepId: 'write', title: 'Write', rationale: 't', riskLevel: 'low',
  requiresApproval: false, commandPreview: 'Write', fragments: [], effects: ['write_own_work'], needs: [],
});
const run = (text) => runJoseCommandExecutionPipeline({ commandText: text, source: 'test', zeroCostMode: true, assignments: [step()] });
const until = async (check) => { for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 5)); };

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  resetQueueForTests();
});

describe('the queue in the pipeline', () => {
  it('the second request waits, queued, until the first is done', async () => {
    const first = run('First note');
    await until(() => calls.length === 1);
    const second = run('Second note');
    await until(() => listJoseRequests().some((r) => r.status === 'queued'));
    expect(calls).toEqual(['first']);
    expect(listJoseRequests().find((r) => r.text === 'Second note').status).toBe('queued');
    releaseFirst();
    await first;
    await second;
    expect(calls).toEqual(['first', 'second']);
    expect(listJoseRequests().map((r) => r.status).sort()).toEqual(['done', 'done']);
  });

  it('a queued request that is stopped never makes its model call', async () => {
    const { stopRequest } = await import('../../../services/jose/joseStop');
    const first = run('First note');
    await until(() => calls.length === 1);
    const second = run('Second note');
    await until(() => listJoseRequests().some((r) => r.status === 'queued'));
    const queued = listJoseRequests().find((r) => r.text === 'Second note');
    expect(stopRequest(queued.id).ok).toBe(true);
    await second;
    expect(listJoseRequests().find((r) => r.text === 'Second note').status).toBe('stopped');
    releaseFirst();
    await first;
    expect(calls).toEqual(['first']);
  });

  it('a run that ends with an error still gives its turn back', async () => {
    const queue = await import('../../../services/jose/joseQueue');
    const store = await import('../../../services/jose/joseRequestStore');
    const spy = vi.spyOn(store, 'setJoseRequestStatus');
    // The first run throws partway (its status stays "running" in storage).
    const engine = await import('../../../services/joseExecutionEngineService');
    const first = run('First note');
    await until(() => calls.length === 1);
    spy.mockImplementationOnce(() => { throw new Error('storage broke'); });
    releaseFirst();
    await first.catch(() => undefined);
    spy.mockRestore();
    const second = run('Second note');
    await second;
    expect(calls).toEqual(['first', 'second']);
    expect(queue.queuePosition(listJoseRequests().find((r) => r.text === 'Second note').id)).toBeNull();
    void engine;
  });
});
