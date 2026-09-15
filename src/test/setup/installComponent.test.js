import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/runtimeManagerService', () => ({
  installTool: vi.fn(),
  loadBundledStarterModel: vi.fn(),
}));
vi.mock('../../lib/ollama', () => ({
  pullOllamaModel: vi.fn(),
  fetchOllamaModels: vi.fn(),
  getConfiguredOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
}));

import { installTool, loadBundledStarterModel } from '../../services/runtimeManagerService';
import { pullOllamaModel, fetchOllamaModels } from '../../lib/ollama';
import {
  STARTER_MODEL_ID,
  STARTER_MODEL_TAG,
  installComponent,
  isComponentAlreadyInstalled,
} from '../../services/setupFlowService';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no bundled resource in this build (dev/browser mode, or an
  // older installer built before O2) -- the common case pre-dating O2's
  // bundled-first path. Falls through to pullOllamaModel, matching every
  // existing test's expectations below. Tests that want to exercise the
  // bundled-first path override this per-test.
  loadBundledStarterModel.mockRejectedValue(new Error('No bundled starter-model resource found in this build.'));
});

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

    expect(installTool).toHaveBeenCalledWith('fooocus', undefined);
    expect(pullOllamaModel).not.toHaveBeenCalled();
  });

  it('propagates a model-pull failure rather than reporting success', async () => {
    pullOllamaModel.mockRejectedValue(new Error('ollama not reachable'));
    await expect(installComponent(STARTER_MODEL_ID)).rejects.toThrow('ollama not reachable');
  });

  describe('bundled-first starter model loading (Dependency Bundling Plan O2)', () => {
    it('loads the bundled resource via loadBundledStarterModel when available, without ever calling pullOllamaModel', async () => {
      loadBundledStarterModel.mockResolvedValue({ tool: 'starter-model', ok: true, message: 'done' });

      await installComponent(STARTER_MODEL_ID);

      expect(loadBundledStarterModel).toHaveBeenCalledWith(STARTER_MODEL_TAG, undefined);
      expect(pullOllamaModel).not.toHaveBeenCalled();
    });

    it('falls back to pullOllamaModel when no bundled resource exists in this build', async () => {
      loadBundledStarterModel.mockRejectedValue(new Error('No bundled starter-model resource found in this build.'));
      pullOllamaModel.mockResolvedValue({ ok: true, model: STARTER_MODEL_TAG });

      await installComponent(STARTER_MODEL_ID);

      expect(loadBundledStarterModel).toHaveBeenCalledTimes(1);
      expect(pullOllamaModel).toHaveBeenCalledTimes(1);
    });

    it('falls back to pullOllamaModel when a bundled resource exists but ollama create genuinely fails', async () => {
      // Resilience posture matches isComponentAlreadyInstalled elsewhere in
      // this file: a redundant network pull is fine, a hard Setup failure
      // over a fixable local error is not.
      loadBundledStarterModel.mockRejectedValue(new Error('ollama create exited with code 1'));
      pullOllamaModel.mockResolvedValue({ ok: true, model: STARTER_MODEL_TAG });

      await installComponent(STARTER_MODEL_ID);

      expect(pullOllamaModel).toHaveBeenCalledTimes(1);
    });

    it('propagates a pullOllamaModel failure that happens after a bundled-load failure', async () => {
      loadBundledStarterModel.mockRejectedValue(new Error('no bundled resource'));
      pullOllamaModel.mockRejectedValue(new Error('ollama not reachable'));

      await expect(installComponent(STARTER_MODEL_ID)).rejects.toThrow('ollama not reachable');
    });

    it('forwards normalized progress from the bundled path the same way as the network path', async () => {
      loadBundledStarterModel.mockImplementation(async (tag, onProgress) => {
        onProgress({ tool: 'starter-model', stage: 'cloning', message: 'Loading bundled starter model…', pct: 0 });
        return { tool: 'starter-model', ok: true, message: 'done' };
      });
      const onProgress = vi.fn();

      await installComponent(STARTER_MODEL_ID, onProgress);

      expect(onProgress).toHaveBeenCalledWith({ message: 'Loading bundled starter model…', pct: 0 });
    });
  });

  it('propagates a tool-install failure', async () => {
    installTool.mockRejectedValue(new Error('Unknown tool: bogus'));
    await expect(installComponent('bogus')).rejects.toThrow('Unknown tool: bogus');
  });
});

describe('installComponent — progress reporting', () => {
  // Both underlying mechanisms already had real progress support --
  // pullOllamaModel streams real completed/total byte counts, installTool
  // relays real Runtime Hub `runtime://progress` events with a stage +
  // percent -- but neither was ever wired to a caller until the Install
  // Queue's "Pending/Downloading.../Ready" states were replaced with real
  // data. These tests cover the normalization installComponent does so
  // InstallQueue.tsx doesn't need to know which mechanism a component uses.

  it('normalizes a real Ollama byte-progress event into a formatted message', async () => {
    pullOllamaModel.mockImplementation(async ({ onProgress }) => {
      onProgress({ status: 'pulling manifest', completed: 1_500_000_000, total: 2_000_000_000, percent: 75 });
      return { ok: true, model: STARTER_MODEL_TAG };
    });
    const onProgress = vi.fn();

    await installComponent(STARTER_MODEL_ID, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ message: 'pulling manifest (1.4GB / 1.9GB)', pct: 75 });
  });

  it('falls back to the bare status when Ollama reports no byte total (e.g. verifying digest)', async () => {
    pullOllamaModel.mockImplementation(async ({ onProgress }) => {
      onProgress({ status: 'verifying sha256 digest', completed: null, total: null, percent: null });
      return { ok: true, model: STARTER_MODEL_TAG };
    });
    const onProgress = vi.fn();

    await installComponent(STARTER_MODEL_ID, onProgress);

    expect(onProgress).toHaveBeenCalledWith({ message: 'verifying sha256 digest', pct: null });
  });

  it('normalizes a real Runtime Hub progress event (stage + percent, no bytes)', async () => {
    installTool.mockImplementation(async (name, onProgress) => {
      onProgress({ tool: name, stage: 'cloning', message: 'Cloning https://example.com/fooocus …', pct: 10 });
      return { tool: name, ok: true, message: 'done' };
    });
    const onProgress = vi.fn();

    await installComponent('fooocus', onProgress);

    expect(onProgress).toHaveBeenCalledWith({ message: 'Cloning https://example.com/fooocus …', pct: 10 });
  });

  it('never calls onProgress when the caller does not pass one', async () => {
    pullOllamaModel.mockResolvedValue({ ok: true, model: STARTER_MODEL_TAG });
    await installComponent(STARTER_MODEL_ID);
    // No assertion needed beyond "doesn't throw" -- pullOllamaModel's mock
    // above never calls an onProgress that doesn't exist; this documents
    // the contract explicitly rather than leaving it implicit.
    expect(pullOllamaModel).toHaveBeenCalledWith(expect.objectContaining({ onProgress: undefined }));
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
