import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  scanHardware,
  checkDiskSpace,
  isSetupComplete,
  markSetupComplete,
  withTimeout,
  getUnmetPrereq,
  STARTER_MODEL_ID,
} from '../services/setupFlowService';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('scanHardware', () => {
  it('invokes setup_scan_hardware and returns the result', async () => {
    const mockProfile = { ramGb: 16, diskFreeGb: 220, ollamaModelsDirFreeGb: null, gpuPresent: false, gpuVendor: null, gpuModel: null };
    invoke.mockResolvedValue(mockProfile);
    const result = await scanHardware();
    expect(invoke).toHaveBeenCalledWith('setup_scan_hardware');
    expect(result).toEqual(mockProfile);
  });
});

describe('checkDiskSpace', () => {
  it('returns ok:true when free space covers selected components plus buffer', () => {
    const selected = [{ id: 'fooocus', sizeGb: 15 }, { id: 'starter-model', sizeGb: 2 }];
    const result = checkDiskSpace(selected, 30);
    expect(result.ok).toBe(true);
    expect(result.neededGb).toBe(17);
    expect(result.shortfallGb).toBe(0);
  });

  it('returns ok:false with the exact shortfall when free space is insufficient', () => {
    const selected = [{ id: 'fooocus', sizeGb: 15 }, { id: 'starter-model', sizeGb: 2 }];
    // 17GB needed + 10GB safety buffer = 27GB required; only 20GB free.
    const result = checkDiskSpace(selected, 20);
    expect(result.ok).toBe(false);
    expect(result.neededGb).toBe(17);
    expect(result.shortfallGb).toBe(7);
  });

  it('applies a 10GB safety buffer on top of the raw component total', () => {
    const selected = [{ id: 'starter-model', sizeGb: 2 }];
    // Raw need is 2GB; with a 10GB buffer, 11GB free should just barely fail.
    const justUnder = checkDiskSpace(selected, 11);
    expect(justUnder.ok).toBe(false);
    const justEnough = checkDiskSpace(selected, 12);
    expect(justEnough.ok).toBe(true);
  });

  it('treats an empty selection as needing only the safety buffer', () => {
    const result = checkDiskSpace([], 10);
    expect(result.ok).toBe(true);
    expect(result.neededGb).toBe(0);
  });

  it('does not block installation when free space is unknown', () => {
    // null = "we could not measure", which must not be conflated with 0
    // ("the disk is full") — refusing to install on an unmeasured disk is
    // worse than letting the real install surface a real error.
    const selected = [{ id: 'fooocus', sizeGb: 15 }];
    const result = checkDiskSpace(selected, null);
    expect(result.ok).toBe(true);
    expect(result.unknown).toBe(true);
    expect(result.neededGb).toBe(15);
  });

  it('still blocks when free space is genuinely zero', () => {
    const result = checkDiskSpace([{ id: 'fooocus', sizeGb: 15 }], 0);
    expect(result.ok).toBe(false);
    expect(result.unknown).toBe(false);
  });

  it('reports the buffered requirement, not just the raw component total', () => {
    // Regression: the UI's "make sure you have at least Xgb free" warning
    // for unknown disk space showed neededGb (raw component sizes only),
    // understating the real requirement by the 10GB safety buffer — a 15GB
    // component actually needs 25GB, but the message said 15GB.
    const result = checkDiskSpace([{ id: 'fooocus', sizeGb: 15 }], 100);
    expect(result.neededGb).toBe(15);
    expect(result.requiredGb).toBe(25);
  });

  it('includes the buffer in requiredGb even when disk space is unknown', () => {
    const result = checkDiskSpace([{ id: 'fooocus', sizeGb: 15 }], null);
    expect(result.unknown).toBe(true);
    expect(result.requiredGb).toBe(25);
  });

  describe('starter model volume (OLLAMA_MODELS)', () => {
    it('does not flag anything when OLLAMA_MODELS was not resolved (the common case)', () => {
      // null/undefined both mean "not checked, don't guess a default path" --
      // this must never be conflated with 0 ("checked and it's full").
      const selected = [{ id: STARTER_MODEL_ID, sizeGb: 2 }];
      expect(checkDiskSpace(selected, 100, null).starterModelShortfallGb).toBeUndefined();
      expect(checkDiskSpace(selected, 100, undefined).starterModelShortfallGb).toBeUndefined();
      expect(checkDiskSpace(selected, 100).starterModelShortfallGb).toBeUndefined();
    });

    it('does not flag the starter volume when the starter model is not selected', () => {
      const selected = [{ id: 'fooocus', sizeGb: 15 }];
      const result = checkDiskSpace(selected, 100, 1); // 1GB on the Ollama volume, plenty free elsewhere
      expect(result.starterModelShortfallGb).toBeUndefined();
    });

    it('flags a real shortfall on the starter model volume, with the buffer applied', () => {
      const selected = [{ id: STARTER_MODEL_ID, sizeGb: 2 }];
      // 2GB needed + 10GB buffer = 12GB required; only 5GB free on that volume.
      const result = checkDiskSpace(selected, 100, 5);
      expect(result.starterModelShortfallGb).toBe(7);
      expect(result.ok).toBe(false);
    });

    it('does not flag the starter volume when it has enough room', () => {
      const selected = [{ id: STARTER_MODEL_ID, sizeGb: 2 }];
      const result = checkDiskSpace(selected, 100, 12);
      expect(result.starterModelShortfallGb).toBeUndefined();
      expect(result.ok).toBe(true);
    });

    it('is fully independent of the general disk check -- a starter-volume shortfall blocks ok even when the general check passes', () => {
      const selected = [{ id: STARTER_MODEL_ID, sizeGb: 2 }];
      const result = checkDiskSpace(selected, 1000, 1); // plenty on the general volume, almost nothing on Ollama's
      expect(result.shortfallGb).toBe(0);
      expect(result.starterModelShortfallGb).toBeGreaterThan(0);
      expect(result.ok).toBe(false);
    });

    it('still flags a starter-volume shortfall even when the general disk space is unknown', () => {
      const selected = [{ id: STARTER_MODEL_ID, sizeGb: 2 }];
      const result = checkDiskSpace(selected, null, 5);
      expect(result.unknown).toBe(true);
      expect(result.starterModelShortfallGb).toBe(7);
      expect(result.ok).toBe(false);
    });
  });
});

describe('isSetupComplete / markSetupComplete', () => {
  it('defaults to false when nothing is stored', () => {
    expect(isSetupComplete()).toBe(false);
  });

  it('returns true after markSetupComplete is called', () => {
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
  });

  it('treats a completed legacy onboarding flag as setup-complete (upgrade path)', () => {
    // An existing install that finished the old OnboardingWizard must not be
    // dropped back into first-run Setup just because it upgraded.
    localStorage.setItem('alphonso_onboarding_complete_v1', JSON.stringify(true));
    expect(isSetupComplete()).toBe(true);
  });

  it('migrates the legacy flag forward so the check only happens once', () => {
    localStorage.setItem('alphonso_onboarding_complete_v1', JSON.stringify(true));
    isSetupComplete();
    expect(JSON.parse(localStorage.getItem('alphonso_setup_complete_v1'))).toBe(true);
  });

  it('does not treat an incomplete legacy flag as setup-complete', () => {
    localStorage.setItem('alphonso_onboarding_complete_v1', JSON.stringify(false));
    expect(isSetupComplete()).toBe(false);
  });
});

describe('getUnmetPrereq', () => {
  const pythonMissing = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true };
  const dockerMissing = { missing: ['Docker'], installHint: 'x', pythonFound: true, dockerFound: false };
  const allPresent = { missing: [], installHint: 'x', pythonFound: true, dockerFound: true };

  it('flags fooocus as blocked when Python is missing', () => {
    expect(getUnmetPrereq('fooocus', pythonMissing)).toBe('python');
  });

  it('flags voice-os as blocked when Python is missing', () => {
    expect(getUnmetPrereq('voice-os', pythonMissing)).toBe('python');
  });

  it('flags chromadb as blocked when Docker is missing', () => {
    // chromadb launches via `docker run` (runtime_manager.rs TOOLS), not
    // pip/git — confirmed directly against the ToolDef, not assumed.
    expect(getUnmetPrereq('chromadb', dockerMissing)).toBe('docker');
  });

  it('does not block a Python-dependent component when Python is present', () => {
    expect(getUnmetPrereq('fooocus', allPresent)).toBe(null);
  });

  it('does not block a Docker-dependent component when Docker is present', () => {
    expect(getUnmetPrereq('chromadb', allPresent)).toBe(null);
  });

  it('never blocks the starter model — it only needs Ollama, already bundled', () => {
    expect(getUnmetPrereq(STARTER_MODEL_ID, pythonMissing)).toBe(null);
    expect(getUnmetPrereq(STARTER_MODEL_ID, dockerMissing)).toBe(null);
  });

  it('does not block a component with no known prerequisite', () => {
    expect(getUnmetPrereq('some-future-component', pythonMissing)).toBe(null);
  });

  it('treats an undefined prereq flag as unmet rather than assuming present', () => {
    // A PrereqStatus that omits pythonFound entirely (e.g. a degraded scan)
    // must not be read as "Python is there" — that would queue an install
    // that's likely to fail exactly like the starter-model bug did.
    expect(getUnmetPrereq('fooocus', { missing: [], installHint: 'x' })).toBe('python');
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects when the promise never settles — the browser/non-Tauri case', async () => {
    // invoke() in a plain browser neither resolves nor rejects; without a
    // timeout this hung Setup on the scanning screen forever.
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow(/timed out/);
  });

  it('propagates a real rejection rather than masking it as a timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});
