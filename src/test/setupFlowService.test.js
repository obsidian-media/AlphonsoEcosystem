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
} from '../services/setupFlowService';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('scanHardware', () => {
  it('invokes setup_scan_hardware and returns the result', async () => {
    const mockProfile = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };
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
