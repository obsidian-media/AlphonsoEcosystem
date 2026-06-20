import { describe, expect, it } from 'vitest';
import { buildOllamaStartupGuide } from '../services/verificationService';

describe('ollama readiness guide', () => {
  it('returns a startup command when ollama is disconnected', () => {
    const guide = buildOllamaStartupGuide({
      ollamaStatus: { state: 'disconnected', label: 'Disconnected' },
      selectedModel: 'llama3.2:3b',
      models: []
    });

    expect(guide.status).toBe('needs_runtime');
    expect(guide.command).toBe('ollama serve');
    expect(guide.steps.join(' ')).toContain('ollama pull llama3.2:3b');
  });

  it('returns a ready guide when the selected model is installed', () => {
    const guide = buildOllamaStartupGuide({
      ollamaStatus: { state: 'connected', label: 'Connected' },
      selectedModel: 'llama3.2:3b',
      models: [{ name: 'llama3.2:3b' }]
    });

    expect(guide.status).toBe('ready');
    expect(guide.command).toBeNull();
    expect(guide.summary).toContain('reachable');
  });
});
