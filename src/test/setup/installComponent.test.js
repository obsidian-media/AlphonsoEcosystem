import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/runtimeManagerService', () => ({
  installTool: vi.fn(),
}));
vi.mock('../../lib/ollama', () => ({
  pullOllamaModel: vi.fn(),
  fetchOllamaModels: vi.fn(),
  getConfiguredOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
}));

import { installTool } from '../../services/runtimeManagerService';
import { pullOllamaModel, fetchOllamaModels } from '../../lib/ollama';
import {
  STARTER_MODEL_ID,
  STARTER_MODEL_TAG,
  installComponent,
  isComponentAlreadyInstalled,
} from '../../services/setupFlowService';

beforeEach(() => vi.clearAllMocks());

describe('installComponent — model vs tool routing', () => {
  it('pulls the starter model via ollama, NOT via installTool', async () => {
    // Regression: `starter-model` was passed straight to installTool(), but it
    // is not in TOOL_NAMES and has no ToolDef, so Rust's runtime_install_tool
    // returns "Unknown tool: starter-model". Since starter-model is in every
    // intent path, that failed the first queued item for every user.
    pullOllamaModel.mockResolvedValue({ ok: true, model: STARTER_MODEL_TAG });

    await installComponent(STARTER_MODEL_ID);

    expect(pullOllamaModel).toHaveBeenCalledTimes(1);
    expect(pullOllamaModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: STARTER_MODEL_TAG })
    );
    expect(installTool).not.toHaveBeenCalled();
  });

  it('routes a real Runtime Hub tool through installTool, not the model path', async () => {
    installTool.mockResolvedValue({ tool: 'fooocus', ok: true, message: 'done' });

    await installComponent('fooocus');

    expect(installTool).toHaveBeenCalledWith('fooocus');
    expect(pullOllamaModel).not.toHaveBeenCalled();
  });

  it('propagates a model-pull failure rather than reporting success', async () => {
    pullOllamaModel.mockRejectedValue(new Error('ollama not reachable'));
    await expect(installComponent(STARTER_MODEL_ID)).rejects.toThrow('ollama not reachable');
  });

  it('propagates a tool-install failure', async () => {
    installTool.mockRejectedValue(new Error('Unknown tool: bogus'));
    await expect(installComponent('bogus')).rejects.toThrow('Unknown tool: bogus');
  });
});

describe('isComponentAlreadyInstalled', () => {
  it('reports the starter model as installed when ollama already lists it', async () => {
    // The model lives in ollama's own store, not Runtime Hub's installed-tool
    // list, so getAllStatus() can never answer this — it needs /api/tags.
    fetchOllamaModels.mockResolvedValue({
      models: [{ name: STARTER_MODEL_TAG }],
      transport: 'fetch',
    });

    await expect(isComponentAlreadyInstalled(STARTER_MODEL_ID, new Set())).resolves.toBe(true);
  });

  it('reports the starter model as not installed when ollama lists other models', async () => {
    fetchOllamaModels.mockResolvedValue({
      models: [{ name: 'some-other-model:7b' }],
      transport: 'fetch',
    });

    await expect(isComponentAlreadyInstalled(STARTER_MODEL_ID, new Set())).resolves.toBe(false);
  });

  it('matches the starter model even when ollama reports a :latest suffix', async () => {
    fetchOllamaModels.mockResolvedValue({
      models: [{ name: `${STARTER_MODEL_TAG.split(':')[0]}:latest` }],
      transport: 'fetch',
    });

    await expect(isComponentAlreadyInstalled(STARTER_MODEL_ID, new Set())).resolves.toBe(false);
  });

  it('treats an unreachable ollama as "not installed" rather than throwing', async () => {
    // A failed check must not break the recommendation screen; worst case we
    // re-pull a model that was already there, which ollama itself no-ops.
    fetchOllamaModels.mockRejectedValue(new Error('connection refused'));
    await expect(isComponentAlreadyInstalled(STARTER_MODEL_ID, new Set())).resolves.toBe(false);
  });

  it('uses the Runtime Hub installed-set for non-model components', async () => {
    await expect(isComponentAlreadyInstalled('fooocus', new Set(['fooocus']))).resolves.toBe(true);
    await expect(isComponentAlreadyInstalled('fooocus', new Set())).resolves.toBe(false);
    expect(fetchOllamaModels).not.toHaveBeenCalled();
  });
});
