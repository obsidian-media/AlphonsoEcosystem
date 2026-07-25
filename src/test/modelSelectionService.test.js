import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSelectedModel,
  setSelectedModel,
  setTaskModelOverride,
  getModelForTask,
  getRecentModels,
  getModelList,
  getRecommendedModel,
  getSelectedProvider,
  setSelectedProvider,
  getCloudModelList
} from '../services/modelSelectionService';

vi.mock('../lib/ollama', () => ({
  PREFERRED_MODEL: 'qwen2.5-coder:7b',
  fetchOllamaModels: vi.fn(async () => ({ models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3.2:3b' }, { name: 'codestral:latest' }] })),
  listAvailableModels: vi.fn((models) => models.map((m) => m.name)),
  chooseDefaultModel: vi.fn((models) => models[0]?.name || 'qwen2.5-coder:7b'),
  chooseBestModelForTask: vi.fn((models, task) => models[0]?.name || 'qwen2.5-coder:7b'),
  classifyModelTier: vi.fn(() => 'standard')
}));

vi.mock('../services/connectors/nvidiaNimConnector', () => ({
  listNvidiaModels: vi.fn(async () => ['meta/llama-3.1-8b-instruct', 'nvidia/nemotron-4-340b-instruct'])
}));

const PREF_KEY = 'alphonso_model_preferences_v1';

beforeEach(() => {
  localStorage.clear();
});

// ── getSelectedModel ──────────────────────────────────────────────────────────

describe('getSelectedModel', () => {
  it('returns PREFERRED_MODEL when nothing is set', () => {
    expect(getSelectedModel()).toBe('qwen2.5-coder:7b');
  });

  it('returns the model that was set', () => {
    setSelectedModel('llama3.2:3b');
    expect(getSelectedModel()).toBe('llama3.2:3b');
  });

  it('persists selection to localStorage', () => {
    setSelectedModel('codestral:latest');
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY));
    expect(prefs.selected).toBe('codestral:latest');
  });
});

// ── setSelectedModel ──────────────────────────────────────────────────────────

describe('setSelectedModel', () => {
  it('adds model to recents list', () => {
    setSelectedModel('llama3.2:3b');
    expect(getRecentModels()).toContain('llama3.2:3b');
  });

  it('does not duplicate the same model in recents', () => {
    setSelectedModel('llama3.2:3b');
    setSelectedModel('llama3.2:3b');
    const recents = getRecentModels();
    expect(recents.filter((m) => m === 'llama3.2:3b').length).toBe(1);
  });

  it('keeps recents list at max 10 entries', () => {
    for (let i = 0; i < 12; i++) setSelectedModel(`model-${i}:latest`);
    expect(getRecentModels().length).toBeLessThanOrEqual(10);
  });

  it('puts newest model first in recents', () => {
    setSelectedModel('model-a:latest');
    setSelectedModel('model-b:latest');
    expect(getRecentModels()[0]).toBe('model-b:latest');
  });
});

// ── getModelForTask / setTaskModelOverride ────────────────────────────────────

describe('getModelForTask / setTaskModelOverride', () => {
  it('returns selected model when no override exists', () => {
    setSelectedModel('llama3.2:3b');
    expect(getModelForTask('research')).toBe('llama3.2:3b');
  });

  it('returns override model for specific task type', () => {
    setTaskModelOverride('code', 'codestral:latest');
    expect(getModelForTask('code')).toBe('codestral:latest');
  });

  it('override does not affect other task types', () => {
    setSelectedModel('llama3.2:3b');
    setTaskModelOverride('code', 'codestral:latest');
    expect(getModelForTask('research')).toBe('llama3.2:3b');
  });

  it('persists task overrides to localStorage', () => {
    setTaskModelOverride('creative', 'llama3.2:3b');
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY));
    expect(prefs.taskOverrides?.creative).toBe('llama3.2:3b');
  });
});

// ── getRecentModels ───────────────────────────────────────────────────────────

describe('getRecentModels', () => {
  it('returns empty array when no models selected yet', () => {
    expect(getRecentModels()).toEqual([]);
  });

  it('returns models in most-recently-used order', () => {
    setSelectedModel('model-a:latest');
    setSelectedModel('model-b:latest');
    const recents = getRecentModels();
    expect(recents[0]).toBe('model-b:latest');
    expect(recents[1]).toBe('model-a:latest');
  });
});

// ── getModelList ──────────────────────────────────────────────────────────────

describe('getModelList', () => {
  it('returns an array of model names', async () => {
    const models = await getModelList('http://localhost:11434');
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it('returns empty array when Ollama is unreachable', async () => {
    const { fetchOllamaModels } = await import('../lib/ollama');
    fetchOllamaModels.mockRejectedValueOnce(new Error('connection refused'));
    const models = await getModelList('http://localhost:11434');
    expect(models).toEqual([]);
  });
});

// ── getRecommendedModel ───────────────────────────────────────────────────────

describe('getRecommendedModel', () => {
  it('returns a model name string', async () => {
    const model = await getRecommendedModel('http://localhost:11434', 'code');
    expect(typeof model).toBe('string');
    expect(model.length).toBeGreaterThan(0);
  });

  it('returns PREFERRED_MODEL when Ollama is unreachable', async () => {
    const { fetchOllamaModels } = await import('../lib/ollama');
    fetchOllamaModels.mockRejectedValueOnce(new Error('connection refused'));
    const model = await getRecommendedModel('http://localhost:11434', 'code');
    expect(model).toBe('qwen2.5-coder:7b');
  });
});

// ── getSelectedProvider / setSelectedProvider ─────────────────────────────────

describe('getSelectedProvider / setSelectedProvider', () => {
  it('defaults to ollama when nothing is set', () => {
    expect(getSelectedProvider()).toBe('ollama');
  });

  it('returns the provider that was set', () => {
    setSelectedProvider('nvidia_nim');
    expect(getSelectedProvider()).toBe('nvidia_nim');
  });

  it('persists provider selection to localStorage', () => {
    setSelectedProvider('gemini');
    expect(localStorage.getItem('alphonso_model_provider_v1')).toBe('gemini');
  });

  it('falls back to ollama for a corrupt/unknown stored value', () => {
    localStorage.setItem('alphonso_model_provider_v1', 'not-a-real-provider');
    expect(getSelectedProvider()).toBe('ollama');
  });
});

// ── getCloudModelList ──────────────────────────────────────────────────────────

describe('getCloudModelList', () => {
  it('returns NVIDIA NIM models via listNvidiaModels', async () => {
    const models = await getCloudModelList('nvidia_nim');
    expect(models).toEqual(['meta/llama-3.1-8b-instruct', 'nvidia/nemotron-4-340b-instruct']);
  });

  it('returns a curated static list for gemini', async () => {
    const models = await getCloudModelList('gemini');
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('gemini-2.5-flash-lite');
  });

  it('returns empty array when listNvidiaModels throws (not configured)', async () => {
    const { listNvidiaModels } = await import('../services/connectors/nvidiaNimConnector');
    listNvidiaModels.mockRejectedValueOnce(new Error('NVIDIA API key not configured'));
    const models = await getCloudModelList('nvidia_nim');
    expect(models).toEqual([]);
  });
});
