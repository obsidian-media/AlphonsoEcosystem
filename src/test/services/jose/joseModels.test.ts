import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/ollama', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/ollama')>()),
  fetchOllamaModels: vi.fn(async () => ({ models: [
    { name: 'all-minilm:latest', details: { family: 'bert' } },
    { name: 'qwen2.5:1.5b', details: { family: 'qwen2' } },
    { name: 'llama3.2:3b', details: { family: 'llama' } },
  ] })),
}));

import { modelSize, pickLargerModel, listInstalledModels } from '../../../services/jose/joseModels';

describe('joseModels', () => {
  it("reads a model's size from its tag", () => {
    expect(modelSize('qwen2.5:7b')).toBe(7);
    expect(modelSize('qwen3:0.6b')).toBe(0.6);
    expect(modelSize('llama3.2:latest')).toBeNull();
    expect(modelSize('qwen2.5-coder:14b-instruct')).toBe(14);
  });

  it('picks the smallest installed model larger than the current one', () => {
    const installed = ['qwen3:0.6b', 'llama3.2:3b', 'qwen2.5:7b', 'qwen2.5:14b'];
    expect(pickLargerModel('llama3.2:3b', installed)).toBe('qwen2.5:7b');
    expect(pickLargerModel('qwen2.5:14b', installed)).toBeNull();
    expect(pickLargerModel('llama3.2:latest', installed)).toBeNull();
  });
});

// QA batch 0: Echo's embedding model is installed too, but it can't write a step's answer.
describe('listInstalledModels', () => {
  it('leaves out embedding models', async () => {
    expect(await listInstalledModels()).toEqual(['qwen2.5:1.5b', 'llama3.2:3b']);
  });
});
