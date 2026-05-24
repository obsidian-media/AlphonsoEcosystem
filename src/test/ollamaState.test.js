import { checkOllama } from '../lib/ollama';

describe('Ollama state mapping', () => {
  it('returns connected with preferred default model when available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'mistral:latest', size: 1000 },
          { name: 'llama3.2:3b', size: 2000 }
        ]
      })
    });

    const result = await checkOllama('http://localhost:11434', '');
    expect(result.state).toBe('connected');
    expect(result.selectedModel).toBe('llama3.2:3b');
  });

  it('returns model_missing when selected model is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'mistral:latest', size: 1000 }]
      })
    });

    const result = await checkOllama('http://localhost:11434', 'llama3.2:3b');
    expect(result.state).toBe('model_missing');
    expect(result.selectedModel).toBe('mistral:latest');
  });
});
