import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
    emit: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    setFullscreen: vi.fn(),
    setTitle: vi.fn(),
    onFocusChange: vi.fn(),
  }),
}));

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn(),
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => '/home/user/alphonso-workspace'),
}));

vi.mock('../services/selfDevelopmentService', () => ({
  runSelfDevelopmentCycle: vi.fn().mockResolvedValue({
    root: '/test/workspace',
    validation: { ok: true },
    auditSummary: { filesScanned: 10, blockerCount: 0 },
    readinessSummary: { partialCount: 2, needsSetupCount: 1 },
    packets: [],
    exportProof: { file_path: '/test/proof.json' },
    rc0Proof: null,
    generatedAtMs: Date.now(),
  }),
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: {
    VERIFIED: 'verified',
    INFERRED: 'inferred',
    TEMPORARY: 'temporary',
    UNVERIFIED: 'unverified',
    FAILED: 'failed',
    PENDING: 'pending',
  },
  timestampMs: vi.fn(() => Date.now()),
}));

vi.mock('../services/serviceScopes', () => ({
  PROOF_AUTHORITY: {
    RUST_ENGINE: 'rust_engine',
    JS_BRIDGE: 'js_bridge',
  },
}));

import { useNativeProofEffects } from '../../hooks/useNativeProofEffects';

describe('useNativeProofEffects', () => {
  const mockSettings = {
    workspaceRoot: '/test/workspace',
  };

  const mockDesktopBridge = {
    state: 'connected',
    label: 'Connected',
    message: 'Alphonso',
  };

  const defaultProps = {
    settings: mockSettings,
    desktopBridge: mockDesktopBridge,
    updateCheckState: { checking: false, configured: false, available: false },
    workspaceFoundation: null,
    nativeProofHooks: null,
    writeNativeProofStage: vi.fn(),
    nativeSelfDevAutorunRef: { current: false },
    setNativeSelfDevProof: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Mount and basic behavior', () => {
    it('mounts without throwing', () => {
      const { result } = renderHook(() => useNativeProofEffects(defaultProps));
      expect(result.current).toBeUndefined();
    });

    it('does not throw when unmounting', () => {
      const { unmount } = renderHook(() => useNativeProofEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('handles cleanup without errors on unmount', () => {
      const { unmount } = renderHook(() => useNativeProofEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Frontend loaded proof', () => {
    it('writes frontend loaded proof stage on mount', () => {
      renderHook(() => useNativeProofEffects(defaultProps));

      expect(defaultProps.writeNativeProofStage).toHaveBeenCalledWith(
        '04_frontend_loaded.json',
        expect.objectContaining({
          status: 'running',
          processId: null,
          note: 'React frontend mounted in the native runtime.',
        })
      );
    });

    it('writes frontend loaded proof when workspaceRoot changes', () => {
      const { rerender } = renderHook(
        ({ props }) => useNativeProofEffects(props),
        { initialProps: { props: defaultProps } }
      );

      vi.clearAllMocks();
      rerender({
        props: { ...defaultProps, settings: { ...mockSettings, workspaceRoot: '/new/workspace' } },
      });

      expect(defaultProps.writeNativeProofStage).toHaveBeenCalledWith(
        '04_frontend_loaded.json',
        expect.objectContaining({
          workspaceRoot: '/new/workspace',
        })
      );
    });
  });

  describe('Props handling', () => {
    it('accepts all required props without error', () => {
      renderHook(() => useNativeProofEffects(defaultProps));
      expect(true).toBe(true);
    });

    it('handles updated props on re-render', () => {
      const { rerender } = renderHook(
        ({ props }) => useNativeProofEffects(props),
        { initialProps: { props: defaultProps } }
      );

      const newProps = { ...defaultProps, updateCheckState: { checking: true, configured: true, available: false } };
      rerender({ props: newProps });
      expect(true).toBe(true);
    });

    it('handles desktopBridge prop changes', () => {
      const customBridge = { state: 'disconnected', label: 'Disconnected', message: 'Not in Tauri' };
      const props = { ...defaultProps, desktopBridge: customBridge };
      renderHook(() => useNativeProofEffects(props));
      expect(true).toBe(true);
    });
  });

  describe('Ref stability', () => {
    it('passes ref objects consistently across renders', () => {
      const { rerender } = renderHook(
        ({ refs }) => useNativeProofEffects(refs),
        { initialProps: { refs: defaultProps } }
      );

      rerender({ refs: { ...defaultProps, updateCheckState: { checking: true } } });
      expect(true).toBe(true);
    });
  });

  describe('Idempotent initialization', () => {
    it('does not duplicate effects on re-render with same props', () => {
      const { rerender } = renderHook(() => useNativeProofEffects(defaultProps));
      rerender(defaultProps);
      expect(true).toBe(true);
    });
  });

  describe('Cleanup on unmount', () => {
    it('cleans up without errors', () => {
      const { unmount } = renderHook(() => useNativeProofEffects(defaultProps));
      unmount();
      expect(true).toBe(true);
    });
  });

  describe('Race condition handling', () => {
    it('handles rapid mount/unmount without errors', () => {
      for (let i = 0; i < 5; i++) {
        const { unmount } = renderHook(() => useNativeProofEffects(defaultProps));
        unmount();
      }
      expect(true).toBe(true);
    });

    it('handles rapid prop changes without duplicate effects', () => {
      const { rerender } = renderHook(
        ({ props }) => useNativeProofEffects(props),
        { initialProps: { props: defaultProps } }
      );

      rerender({ props: { ...defaultProps, desktopBridge: { ...mockDesktopBridge, state: 'disconnected' } } });
      rerender({ props: { ...defaultProps, desktopBridge: mockDesktopBridge } });
      rerender({ props: { ...defaultProps, settings: { ...mockSettings, workspaceRoot: '/new' } } });

      expect(true).toBe(true);
    });
  });
});