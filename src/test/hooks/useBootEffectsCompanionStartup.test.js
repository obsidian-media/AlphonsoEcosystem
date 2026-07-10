import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBootEffects } from '../../hooks/useBootEffects';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/workspaceRootService', () => ({ getDefaultWorkspaceRoot: vi.fn().mockResolvedValue(null) }));

let hydrateResolve;
const hydrateCalls = [];
const getConnectorCredential = vi.fn(() => 'a-real-saved-token');

vi.mock('../../services/connectors/connectorAuth', () => ({
  hydrateConnectorCredentialsFromSqlite: vi.fn((...args) => {
    hydrateCalls.push('hydrate');
    return new Promise((resolve) => { hydrateResolve = resolve; }).then(() => {});
  }),
  getConnectorCredential: (...args) => {
    hydrateCalls.push('read');
    return getConnectorCredential(...args);
  }
}));

vi.mock('../../services/telegramCompanionService', () => ({ startTelegramCompanion: vi.fn() }));
vi.mock('../../services/whatsappCompanionService', () => ({ startWhatsAppCompanion: vi.fn() }));

describe('useBootEffects — Telegram/WhatsApp companion startup credential ordering', () => {
  beforeEach(() => {
    hydrateCalls.length = 0;
    hydrateResolve = null;
    vi.clearAllMocks();
  });

  it('awaits credential hydration before reading a saved token at boot, instead of reading the (still-empty) cache first', async () => {
    renderHook(() => useBootEffects({
      settings: {},
      setSettings: vi.fn(),
      setConversations: vi.fn(),
      setActiveChatId: vi.fn(),
      setDesktopBridge: vi.fn(),
      setIsOnline: vi.fn()
    }));

    // useBootEffects' onIdle fallback is setTimeout(cb, 50) when
    // requestIdleCallback isn't available (jsdom doesn't provide it).
    await new Promise((r) => setTimeout(r, 60));

    expect(hydrateCalls[0]).toBe('hydrate');
    expect(hydrateCalls).not.toContain('read');

    hydrateResolve();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(hydrateCalls).toContain('read');
  });
});
