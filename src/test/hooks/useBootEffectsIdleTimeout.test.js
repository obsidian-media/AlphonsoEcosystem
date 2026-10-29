// QA batch 1 (2026-10-28): on the installed 2.10.0 the Telegram bot didn't answer /start until
// much later. Start-up jobs waited for the browser's "idle" callback with no timeout, which a busy,
// minimized or background window can put off for a long time. Every one must run within seconds.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/workspaceRootService', () => ({ getDefaultWorkspaceRoot: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/connectors/connectorAuth', () => ({
  hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue(undefined),
  getConnectorCredential: vi.fn(() => ''),
}));
vi.mock('../../services/telegramCompanionService', () => ({ startTelegramCompanion: vi.fn() }));
vi.mock('../../services/whatsappCompanionService', () => ({ startWhatsAppCompanion: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('useBootEffects start-up jobs', () => {
  it('ask the idle callback for a deadline, so a busy or hidden window cannot put them off', async () => {
    const idle = vi.fn(() => 1);
    vi.stubGlobal('requestIdleCallback', idle);
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    vi.resetModules();
    const { useBootEffects } = await import('../../hooks/useBootEffects');
    renderHook(() => useBootEffects({
      settings: {}, setSettings: vi.fn(), setConversations: vi.fn(), setActiveChatId: vi.fn(), setDesktopBridge: vi.fn(), setIsOnline: vi.fn(),
    }));
    expect(idle).toHaveBeenCalled();
    for (const call of idle.mock.calls) {
      const options = call[1];
      expect(options?.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(5000);
    }
  });
});
