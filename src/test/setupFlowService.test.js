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
});

describe('isSetupComplete / markSetupComplete', () => {
  it('defaults to false when nothing is stored', () => {
    expect(isSetupComplete()).toBe(false);
  });

  it('returns true after markSetupComplete is called', () => {
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
  });
});
