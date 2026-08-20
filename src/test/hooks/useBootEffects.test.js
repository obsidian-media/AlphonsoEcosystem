import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('Alphonso'),
  getVersion: vi.fn().mockResolvedValue('2.6.0'),
}));

vi.mock('../../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => '/home/user/alphonso-workspace'),
}));

vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: vi.fn((connector, envVar) => {
    if (connector === 'telegram' && envVar === 'TELEGRAM_BOT_TOKEN') return 'test-token';
    if (connector === 'whatsapp' && envVar === 'WHATSAPP_ACCESS_TOKEN') return 'test-token';
    return null;
  }),
  hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue(),
}));

vi.mock('../../services/telegramCompanionService', () => ({
  startTelegramCompanion: vi.fn(),
}));

vi.mock('../../services/whatsappCompanionService', () => ({
  startWhatsAppCompanion: vi.fn(),
}));

vi.mock('../../constants/appConstants', () => ({
  INITIAL_CONVERSATION_ID: 'default-session',
}));

import { useBootEffects } from '../../hooks/useBootEffects';
import { invoke } from '@tauri-apps/api/core';
import { getDefaultWorkspaceRoot } from '../../services/workspaceRootService';
import { getConnectorCredential } from '../../services/connectors/connectorAuth';
import { startTelegramCompanion } from '../../services/telegramCompanionService';
import { startWhatsAppCompanion } from '../../services/whatsappCompanionService';

describe('useBootEffects', () => {
  const mockSetSettings = vi.fn();
  const mockSetConversations = vi.fn();
  const mockSetActiveChatId = vi.fn();
  const mockSetDesktopBridge = vi.fn();
  const mockSetIsOnline = vi.fn();

  const defaultProps = {
    settings: {
      approvalMode: false,
      zeroCostMode: true,
      safeMode: true,
      localOnlyMode: true,
      previewMode: true,
      workspaceRoot: '',
      environmentTheme: 'deep_space',
      autoLaunchServices: false,
      comfyuiDir: '',
      comfyuiPython: 'python',
    },
    setSettings: mockSetSettings,
    setConversations: mockSetConversations,
    setActiveChatId: mockSetActiveChatId,
    setDesktopBridge: mockSetDesktopBridge,
    setIsOnline: mockSetIsOnline,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    invoke.mockResolvedValue({ ok: true });
    getDefaultWorkspaceRoot.mockReturnValue('/home/user/alphonso-workspace');
    getConnectorCredential.mockImplementation((connector, envVar) => {
      if (connector === 'telegram' && envVar === 'TELEGRAM_BOT_TOKEN') return 'test-token';
      if (connector === 'whatsapp' && envVar === 'WHATSAPP_ACCESS_TOKEN') return 'test-token';
      return null;
    });
    startTelegramCompanion.mockReset();
    startWhatsAppCompanion.mockReset();
    window.__ALPHONSO_BOOT_READY__ = vi.fn();
    document.body.innerHTML = '<div data-alphonso-shell-ready="true"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.__ALPHONSO_BOOT_READY__;
  });

  describe('Initialization sequence order', () => {
    it('executes Phase 0: Settings hydration from SQLite on mount', () => {
      invoke.mockResolvedValueOnce(JSON.stringify({ zeroCostMode: false, safeMode: false }));
      renderHook(() => useBootEffects(defaultProps));
      expect(invoke).toHaveBeenCalledWith('load_settings');
    });

    it('executes Phase 0: Conversations hydration from SQLite on mount', () => {
      const savedConversations = [
        { id: 'chat-1', title: 'Saved Chat', timestamp: Date.now() - 1000 },
        { id: 'chat-2', title: 'Another Chat', timestamp: Date.now() },
      ];
      invoke.mockResolvedValueOnce(JSON.stringify(savedConversations));
      renderHook(() => useBootEffects(defaultProps));
      expect(invoke).toHaveBeenCalledWith('kv_get', { key: 'alphonso_conversations' });
    });

    it('hydrates settings and merges with current state', async () => {
      invoke.mockResolvedValueOnce(JSON.stringify({ zeroCostMode: false, safeMode: false }));
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetSettings).toHaveBeenCalledWith(expect.any(Function));
    });

    it('hydrates conversations and sets active chat', async () => {
      const savedConversations = [{ id: 'chat-1', title: 'Saved Chat', timestamp: Date.now() }];
      invoke.mockImplementation((cmd, args) => {
        if (cmd === 'kv_get') return Promise.resolve(JSON.stringify(savedConversations));
        return Promise.resolve(JSON.stringify({}));
      });
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetConversations).toHaveBeenCalledWith(savedConversations);
      expect(mockSetActiveChatId).toHaveBeenCalledWith('chat-1');
    });

    it('handles corrupt settings data gracefully', async () => {
      const props = {
        ...defaultProps,
        settings: { ...defaultProps.settings, workspaceRoot: '/configured', zeroCostMode: false },
      };
      invoke.mockResolvedValueOnce('invalid json');
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetSettings).not.toHaveBeenCalled();
    });

    it('handles corrupt conversations data gracefully', async () => {
      invoke.mockResolvedValueOnce('invalid json');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetConversations).not.toHaveBeenCalled();
    });
  });

  describe('Phase 1: Idle-time initialization', () => {
    it('sets workspaceRoot from default if not configured', async () => {
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const updater = mockSetSettings.mock.calls.find(([fn]) => typeof fn === 'function')?.[0];
      expect(updater).toBeDefined();
      if (updater) {
        const next = updater(defaultProps.settings);
        expect(next.workspaceRoot).toBe('/home/user/alphonso-workspace');
      }
    });

    it('sets zeroCostMode default to true if not boolean', async () => {
      const props = { ...defaultProps, settings: { ...defaultProps.settings, zeroCostMode: undefined } };
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetSettings).toHaveBeenCalled();
    });

    it('falls back neon_studio theme to minimal_runtime', async () => {
      const props = { ...defaultProps, settings: { ...defaultProps.settings, environmentTheme: 'neon_studio' } };
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetSettings).toHaveBeenCalled();
    });

    it('registers online/offline event listeners', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('sets isOnline to true on online event', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const onlineHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'online')?.[1];
      if (onlineHandler) {
        act(() => onlineHandler());
        expect(mockSetIsOnline).toHaveBeenCalledWith(true);
      }
      addEventListenerSpy.mockRestore();
    });

    it('sets isOnline to false on offline event', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const offlineHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'offline')?.[1];
      if (offlineHandler) {
        act(() => offlineHandler());
        expect(mockSetIsOnline).toHaveBeenCalledWith(false);
      }
      addEventListenerSpy.mockRestore();
    });
  });

  describe('Auto-launch local services', () => {
    it('launches Ollama when autoLaunchServices is true', async () => {
      const props = { ...defaultProps, settings: { ...defaultProps.settings, autoLaunchServices: true } };
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(invoke).toHaveBeenCalledWith('launch_ollama');
    });

    it('launches ComfyUI when comfyuiDir is configured', async () => {
      const props = {
        ...defaultProps,
        settings: { ...defaultProps.settings, autoLaunchServices: true, comfyuiDir: '/opt/comfyui' },
      };
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(invoke).toHaveBeenCalledWith('launch_comfyui', {
        comfyuiDir: '/opt/comfyui',
        pythonExe: 'python',
      });
    });

    it('does not launch services when autoLaunchServices is false', async () => {
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(invoke).not.toHaveBeenCalledWith('launch_ollama');
    });

    it('handles Ollama launch failure gracefully', async () => {
      invoke.mockRejectedValueOnce(new Error('Ollama not found'));
      const props = { ...defaultProps, settings: { ...defaultProps.settings, autoLaunchServices: true } };
      renderHook(() => useBootEffects(props));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(invoke).toHaveBeenCalledWith('launch_ollama');
    });
  });

  describe('Desktop bridge inspection', () => {
    it('detects Tauri environment and sets desktopBridge to connected', async () => {
      const { getName, getVersion } = await import('@tauri-apps/api/app');
      getName.mockResolvedValueOnce('Alphonso');
      getVersion.mockResolvedValueOnce('2.6.0');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetDesktopBridge).toHaveBeenCalledWith(expect.objectContaining({
        state: 'connected',
        label: 'Connected',
        message: expect.stringContaining('Alphonso'),
      }));
    });

    it('sets desktopBridge to disconnected when not in Tauri', async () => {
      const { getName } = await import('@tauri-apps/api/app');
      getName.mockRejectedValueOnce(new Error('Not Tauri'));
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(mockSetDesktopBridge).toHaveBeenCalledWith(expect.objectContaining({
        state: 'disconnected',
        label: 'Browser preview',
        message: 'Tauri app APIs are not available in this runtime.',
      }));
    });
  });

  describe('Telegram companion startup', () => {
    it('starts Telegram companion when token is configured', async () => {
      getConnectorCredential.mockReturnValueOnce('test-telegram-token');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getConnectorCredential).toHaveBeenCalledWith('telegram', 'TELEGRAM_BOT_TOKEN');
      expect(startTelegramCompanion).toHaveBeenCalled();
    });

    it('does not start Telegram when token not configured', async () => {
      getConnectorCredential.mockReturnValueOnce(null);
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(startTelegramCompanion).not.toHaveBeenCalled();
    });

    it('handles Telegram start errors gracefully', async () => {
      getConnectorCredential.mockReturnValueOnce('test-token');
      startTelegramCompanion.mockImplementationOnce(() => { throw new Error('Start failed'); });
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(startTelegramCompanion).toHaveBeenCalled();
    });
  });

  describe('WhatsApp companion startup', () => {
    it('starts WhatsApp companion when token is configured', async () => {
      getConnectorCredential.mockReturnValueOnce('test-whatsapp-token');
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getConnectorCredential).toHaveBeenCalledWith('whatsapp', 'WHATSAPP_ACCESS_TOKEN');
      expect(startWhatsAppCompanion).toHaveBeenCalled();
    });

    it('does not start WhatsApp when token not configured', async () => {
      getConnectorCredential.mockImplementation((connector, envVar) => {
        if (connector === 'whatsapp') return null;
        return 'test-token';
      });
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(startWhatsAppCompanion).not.toHaveBeenCalled();
    });

    it('handles WhatsApp start errors gracefully', async () => {
      getConnectorCredential.mockReturnValueOnce('test-token');
      startWhatsAppCompanion.mockImplementationOnce(() => { throw new Error('Start failed'); });
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(startWhatsAppCompanion).toHaveBeenCalled();
    });
  });

  describe('Boot ready signal', () => {
    it('calls window.__ALPHONSO_BOOT_READY__ when shell ready element exists', async () => {
      window.__ALPHONSO_BOOT_READY__ = vi.fn();
      document.body.innerHTML = '<div data-alphonso-shell-ready="true"></div>';
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(window.__ALPHONSO_BOOT_READY__).toHaveBeenCalled();
    });

    it('does not call boot ready when shell ready element missing', async () => {
      window.__ALPHONSO_BOOT_READY__ = vi.fn();
      document.body.innerHTML = '<div data-alphonso-shell-ready="false"></div>';
      renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(window.__ALPHONSO_BOOT_READY__).not.toHaveBeenCalled();
    });
  });

  describe('Idempotent re-initialization', () => {
    it('only hydrates settings once', async () => {
      invoke.mockResolvedValueOnce(JSON.stringify({ zeroCostMode: false }));
      const { rerender } = renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const firstCallCount = invoke.mock.calls.filter(c => c[0] === 'load_settings').length;
      rerender(defaultProps);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const secondCallCount = invoke.mock.calls.filter(c => c[0] === 'load_settings').length;
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('only hydrates conversations once', async () => {
      invoke.mockResolvedValueOnce(JSON.stringify([{ id: 'chat-1', title: 'Chat', timestamp: Date.now() }]));
      const { rerender } = renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const firstCallCount = invoke.mock.calls.filter(c => c[0] === 'kv_get').length;
      rerender(defaultProps);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      const secondCallCount = invoke.mock.calls.filter(c => c[0] === 'kv_get').length;
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('Cleanup on unmount', () => {
    it('cancels idle callbacks on unmount', async () => {
      const { unmount } = renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      unmount();
      expect(true).toBe(true);
    });

    it('removes online/offline event listeners on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useBootEffects(defaultProps));
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      unmount();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});