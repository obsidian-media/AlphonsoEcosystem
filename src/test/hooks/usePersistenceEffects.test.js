import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../lib/appStorage', () => ({
  setStorage: vi.fn(),
  getStorage: vi.fn((key, fallback) => fallback),
}));

import { usePersistenceEffects } from '../../hooks/usePersistenceEffects';
import { invoke } from '@tauri-apps/api/core';
import { setStorage } from '../../lib/appStorage';

describe('usePersistenceEffects', () => {
  const defaultProps = {
    settings: {
      approvalMode: false,
      zeroCostMode: true,
      safeMode: true,
      localOnlyMode: true,
      previewMode: true,
      workspaceRoot: '/home/user/alphonso-workspace',
      environmentTheme: 'deep_space',
      autoLaunchServices: false,
      comfyuiDir: '',
      comfyuiPython: 'python',
    },
    conversations: [
      { id: 'chat-1', title: 'First Chat', timestamp: Date.now() - 1000 },
      { id: 'chat-2', title: 'Second Chat', timestamp: Date.now() },
    ],
    nativeSelfDevProof: null,
    coachMiniMode: false,
    coachSnapCorner: 'bottom-right',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    invoke.mockResolvedValue({ ok: true });
    setStorage.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Settings persistence', () => {
    it('persists settings to localStorage on change', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      expect(setStorage).toHaveBeenCalledWith('alphonso_settings', defaultProps.settings);
    });

    it('invokes save_settings Tauri command with JSON stringified settings', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      expect(invoke).toHaveBeenCalledWith('save_settings', {
        settingsJson: JSON.stringify(defaultProps.settings),
      });
    });

    it('updates persistence when settings object changes', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      const updatedSettings = { ...defaultProps.settings, zeroCostMode: false };

      rerender({ ...defaultProps, settings: updatedSettings });

      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_settings', updatedSettings);
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenLastCalledWith('save_settings', {
        settingsJson: JSON.stringify(updatedSettings),
      });
    });

    it('handles Tauri invoke failure gracefully for settings', () => {
      invoke.mockRejectedValueOnce(new Error('Tauri not available'));
      expect(() => renderHook(() => usePersistenceEffects(defaultProps))).not.toThrow();
    });
  });

  describe('Conversations persistence', () => {
    it('persists conversations to localStorage on change', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      expect(setStorage).toHaveBeenCalledWith('alphonso_conversations', defaultProps.conversations);
    });

    it('invokes kv_set Tauri command with JSON stringified conversations', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      expect(invoke).toHaveBeenCalledWith('kv_set', {
        key: 'alphonso_conversations',
        value: JSON.stringify(defaultProps.conversations),
      });
    });

    it('updates persistence when conversations array changes', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      const newConversations = [
        ...defaultProps.conversations,
        { id: 'chat-3', title: 'Third Chat', timestamp: Date.now() + 1000 },
      ];

      rerender({ ...defaultProps, conversations: newConversations });

      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_conversations', newConversations);
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke).toHaveBeenLastCalledWith('kv_set', {
        key: 'alphonso_conversations',
        value: JSON.stringify(newConversations),
      });
    });

    it('handles empty conversations array', () => {
      const props = { ...defaultProps, conversations: [] };
      renderHook(() => usePersistenceEffects(props));
      expect(setStorage).toHaveBeenCalledWith('alphonso_conversations', []);
      expect(invoke).toHaveBeenCalledWith('kv_set', {
        key: 'alphonso_conversations',
        value: '[]',
      });
    });

    it('handles Tauri invoke failure gracefully for conversations', () => {
      invoke.mockRejectedValueOnce(new Error('KV store unavailable'));
      expect(() => renderHook(() => usePersistenceEffects(defaultProps))).not.toThrow();
    });
  });

  describe('Native self-dev proof persistence', () => {
    it('persists nativeSelfDevProof to localStorage when provided', () => {
      const proof = { stage: 'completed', timestamp: Date.now(), trust: 'verified' };
      renderHook(() => usePersistenceEffects({ ...defaultProps, nativeSelfDevProof: proof }));
      expect(setStorage).toHaveBeenCalledWith('alphonso_native_selfdev_proof', proof);
    });

    it('persists null nativeSelfDevProof', () => {
      renderHook(() => usePersistenceEffects({ ...defaultProps, nativeSelfDevProof: null }));
      expect(setStorage).toHaveBeenCalledWith('alphonso_native_selfdev_proof', null);
    });

    it('updates persistence when nativeSelfDevProof changes', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      const proof = { stage: 'started', timestamp: Date.now() };

      rerender({ ...defaultProps, nativeSelfDevProof: proof });
      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_native_selfdev_proof', proof);
    });
  });

  describe('Coach layout persistence', () => {
    it('persists coach layout (mini mode + corner) to localStorage', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      expect(setStorage).toHaveBeenCalledWith('alphonso_coach_layout', {
        mini: false,
        corner: 'bottom-right',
      });
    });

    it('updates persistence when coachMiniMode changes', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      rerender({ ...defaultProps, coachMiniMode: true });
      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_coach_layout', {
        mini: true,
        corner: 'bottom-right',
      });
    });

    it('updates persistence when coachSnapCorner changes', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      rerender({ ...defaultProps, coachSnapCorner: 'top-left' });
      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_coach_layout', {
        mini: false,
        corner: 'top-left',
      });
    });

    it('updates persistence when both coach props change together', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      rerender({ ...defaultProps, coachMiniMode: true, coachSnapCorner: 'top-right' });
      expect(setStorage).toHaveBeenCalledTimes(2);
      expect(setStorage).toHaveBeenLastCalledWith('alphonso_coach_layout', {
        mini: true,
        corner: 'top-right',
      });
    });
  });

  describe('Multiple effects coordination', () => {
    it('calls setStorage for all four keys on initial mount', () => {
      renderHook(() => usePersistenceEffects(defaultProps));
      const keys = setStorage.mock.calls.map((call) => call[0]);
      expect(keys).toContain('alphonso_settings');
      expect(keys).toContain('alphonso_conversations');
      expect(keys).toContain('alphonso_native_selfdev_proof');
      expect(keys).toContain('alphonso_coach_layout');
    });

    it('only re-persists changed values on prop updates', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      vi.clearAllMocks();

      rerender({ ...defaultProps, settings: { ...defaultProps.settings, zeroCostMode: false } });

      expect(setStorage).toHaveBeenCalledWith('alphonso_settings', expect.any(Object));
      expect(setStorage).not.toHaveBeenCalledWith('alphonso_conversations', expect.anything());
      expect(setStorage).not.toHaveBeenCalledWith('alphonso_native_selfdev_proof', expect.anything());
      expect(setStorage).not.toHaveBeenCalledWith('alphonso_coach_layout', expect.anything());
    });

    it('handles rapid successive updates without errors', () => {
      const { rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      for (let i = 0; i < 10; i++) {
        rerender({ ...defaultProps, settings: { ...defaultProps.settings, zeroCostMode: i % 2 === 0 } });
      }
      expect(() => act(() => vi.runAllTimers())).not.toThrow();
    });
  });

  describe('Cleanup and unmount', () => {
    it('unmounts without throwing', () => {
      const { unmount } = renderHook(() => usePersistenceEffects(defaultProps));
      expect(() => unmount()).not.toThrow();
    });

    it('does not persist after unmount', () => {
      const { unmount, rerender } = renderHook(() => usePersistenceEffects(defaultProps));
      unmount();
      vi.clearAllMocks();
      rerender({ ...defaultProps, settings: { ...defaultProps.settings, zeroCostMode: false } });
      expect(setStorage).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    });
  });
});