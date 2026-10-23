import { describe, it, expect, vi } from 'vitest';

// A credential read before the saved ones have loaded must not stop them
// loading (2026-10-23, found in the live Telegram check: an early read left
// the cache empty for 60 s, so the Telegram companion saw no token at start
// and never started).
const saved = JSON.stringify({ telegram: { TELEGRAM_BOT_TOKEN: 'saved-token' } });
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd) => (cmd === 'secure_credential_get' ? saved : null)),
}));
vi.mock('../../lib/durableStore.js', () => ({ durableGet: vi.fn(() => null), durableSet: vi.fn() }));

describe('reading a credential before they have loaded', () => {
  it('still loads the saved credentials afterwards', async () => {
    const auth = await import('../../services/connectors/connectorAuth');
    expect(auth.getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN')).toBe('');
    await auth.hydrateConnectorCredentialsFromSqlite();
    expect(auth.getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN')).toBe('saved-token');
  });
});
