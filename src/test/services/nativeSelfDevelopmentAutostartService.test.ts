import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));
vi.mock('../../services/workspaceRootService', () => ({ getDefaultWorkspaceRoot: vi.fn(() => '/default/root') }));
vi.mock('../../services/verificationService', () => ({ getVerificationLogs: vi.fn(() => []) }));
vi.mock('../../services/workspaceIntelligenceService', () => ({ getWorkspaceFoundation: vi.fn(() => ({})) }));
vi.mock('../../services/selfDevelopmentService', () => ({
  runSelfDevelopmentCycle: vi.fn(async () => ({
    root: '/test',
    validation: { ok: true },
    auditSummary: { filesScanned: 10, blockerCount: 0 },
    readinessSummary: { partialCount: 1, needsSetupCount: 0 },
    packets: [],
    generatedAtMs: 1000
  }))
}));
vi.mock('../../services/nativeRc0ProofService', () => ({
  PROOF_AUTHORITY: { JS_BRIDGE: 'js_bridge', RUST_ENGINE: 'rust_engine' }
}));
vi.mock('../../services/trustModel', () => ({ timestampMs: () => Date.now() }));

import { isNativeSelfDevelopmentAutostartRunning, startNativeSelfDevelopmentAutostart } from '../../services/nativeSelfDevelopmentAutostartService';
import { invoke } from '@tauri-apps/api/core';
import { runSelfDevelopmentCycle } from '../../services/selfDevelopmentService';

function mockInvokeForEnv(envOverrides: Record<string, string>) {
  (invoke as any).mockImplementation(async (_cmd: string, args?: any) => {
    const name = args?.name;
    if (name && name in envOverrides) {
      return { value: envOverrides[name] };
    }
    return { value: '' };
  });
}

describe('nativeSelfDevelopmentAutostartService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (window as any).__TAURI_INTERNALS__ = undefined;
    (window as any).__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = false;
  });

  describe('isNativeSelfDevelopmentAutostartRunning', () => {
    it('returns false by default', () => {
      expect(isNativeSelfDevelopmentAutostartRunning()).toBe(false);
    });
    it('returns true when flag is set', () => {
      (window as any).__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
      expect(isNativeSelfDevelopmentAutostartRunning()).toBe(true);
    });
  });

  describe('startNativeSelfDevelopmentAutostart', () => {
    it('returns early when tauri runtime unavailable', async () => {
      (window as any).__TAURI_INTERNALS__ = undefined;
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(false);
      expect(result.reason).toBe('tauri_runtime_unavailable');
    });
    it('returns early when already running', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      (window as any).__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__ = true;
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(false);
      expect(result.reason).toBe('already_running');
    });
    it('returns early when rc0 proof mode is active', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '1' });
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(false);
      expect(result.reason).toBe('rc0_proof_mode_active');
    });
    it('returns setup_required when autorun env is not enabled', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '', ALPHONSO_SELFDEV_AUTORUN: '' });
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(true);
      expect(result.state).toBe('setup_required');
    });
    it('runs cycle when autorun is enabled', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '', ALPHONSO_SELFDEV_AUTORUN: '1', ALPHONSO_SELFDEV_EXIT_ON_COMPLETE: '' });
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(true);
      expect(result.state).toBe('partial');
      expect(runSelfDevelopmentCycle).toHaveBeenCalled();
    });
    it('returns failed state on exception', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '', ALPHONSO_SELFDEV_AUTORUN: '1', ALPHONSO_SELFDEV_EXIT_ON_COMPLETE: '' });
      (runSelfDevelopmentCycle as any).mockRejectedValueOnce(new Error('cycle failed'));
      const result = await startNativeSelfDevelopmentAutostart();
      expect(result.started).toBe(true);
      expect(result.state).toBe('failed');
    });
    it('clears autostart flag after completion', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '', ALPHONSO_SELFDEV_AUTORUN: '1', ALPHONSO_SELFDEV_EXIT_ON_COMPLETE: '' });
      await startNativeSelfDevelopmentAutostart();
      expect((window as any).__ALPHONSO_NATIVE_SELFDEV_AUTORUN_RUNNING__).toBe(false);
    });
    it('sets and clears autostart flag in localStorage', async () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
      mockInvokeForEnv({ ALPHONSO_RC0_PROOF: '', ALPHONSO_SELFDEV_AUTORUN: '1', ALPHONSO_SELFDEV_EXIT_ON_COMPLETE: '' });
      await startNativeSelfDevelopmentAutostart();
      const flag = localStorage.getItem('alphonso_native_selfdev_autorun_running');
      expect(flag).toBe('0');
    });
  });
});
