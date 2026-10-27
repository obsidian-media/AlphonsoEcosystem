// Jose phase 7: a request cut off when the app closed, or waiting for setup, can be cancelled.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  withAgentModel: async (_a, _m, fn) => fn(),
  getAgentModelOverride: () => null,
  generateAgentLlmResponse: vi.fn(async () => ({ response: '{"decisions": []}' })),
}));

import { cancelRequest, CANCELLED_LINE } from '../../../services/joseExecutionEngineService';
import { createJoseRequest, getJoseRequest, setJoseRequestStatus } from '../../../services/jose/joseRequestStore';
import { claimProject, projectHolder } from '../../../services/alphonso/projectLock';

const made = (status) => {
  const request = createJoseRequest({ commandId: `c-${status}`, source: 'user', text: 'Research the launch', kind: 'normal', steps: [] });
  setJoseRequestStatus(request.id, status);
  return request.id;
};

beforeEach(() => localStorage.clear());

describe('cancelRequest', () => {
  it('cancels a request cut off when the app closed', () => {
    const id = made('interrupted');
    expect(cancelRequest(id)).toEqual({ ok: true, summary: 'Cancelled.' });
    expect(getJoseRequest(id).status).toBe('cancelled');
    expect(getJoseRequest(id).changeLog.at(-1).text).toBe(CANCELLED_LINE);
  });

  it('cancels a request waiting for setup and frees its project', () => {
    const id = made('waiting_setup');
    claimProject('D:/shop', id);
    expect(cancelRequest(id).ok).toBe(true);
    expect(projectHolder('D:/shop')).toBeNull();
  });

  it("won't cancel a finished or running request", () => {
    expect(cancelRequest(made('done')).ok).toBe(false);
    expect(cancelRequest(made('running')).ok).toBe(false);
    expect(cancelRequest('nope').ok).toBe(false);
  });
});
