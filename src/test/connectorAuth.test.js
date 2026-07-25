import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveConnectorCredential,
  getConnectorCredential,
  getConnectorCredentials,
  readAuthProfiles,
  writeAuthProfiles,
  updateConnectorAuthProfile,
  DEFAULT_AUTH_PROFILES
} from '../services/connectors/connectorAuth';
import { appendConnectorAudit } from '../services/connectors/connectorRegistry.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
vi.mock('../services/connectorAuditLogService', () => ({ appendConnectorAuditEntry: vi.fn() }));
vi.mock('../services/connectorRegistryService', () => ({ appendConnectorAudit: vi.fn() }));
vi.mock('../services/connectors/connectorRegistry.js', () => ({
  CONNECTOR_AUTH_KEY: 'alphonso_connector_auth_profiles_v1',
  CONNECTOR_AUTH_SCOPE: 'connector_auth_profiles_v1',
  appendConnectorAudit: vi.fn(),
  readRows: vi.fn(() => []),
  writeRows: vi.fn()
}));
vi.mock('../services/runtimeLedgerService', () => ({ persistScopeRows: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/agentBusService', () => ({ AGENTS: {} }));
vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'VERIFIED', UNVERIFIED: 'UNVERIFIED' },
  timestampMs: vi.fn(() => Date.now())
}));

beforeEach(() => {
  localStorage.clear();
});

// ── saveConnectorCredential / getConnectorCredential ──────────────────────────

describe('saveConnectorCredential / getConnectorCredential', () => {
  it('saves and retrieves a credential', () => {
    saveConnectorCredential('github', 'GITHUB_TOKEN', 'ghp_abc123');
    expect(getConnectorCredential('github', 'GITHUB_TOKEN')).toBe('ghp_abc123');
  });

  it('trims whitespace from saved credentials', () => {
    saveConnectorCredential('slack', 'SLACK_BOT_TOKEN', '  xoxb-123  ');
    expect(getConnectorCredential('slack', 'SLACK_BOT_TOKEN')).toBe('xoxb-123');
  });

  it('returns empty string for missing connector', () => {
    expect(getConnectorCredential('nonexistent', 'KEY')).toBe('');
  });

  it('returns empty string for missing key on existing connector', () => {
    saveConnectorCredential('github', 'GITHUB_TOKEN', 'token');
    expect(getConnectorCredential('github', 'MISSING_KEY')).toBe('');
  });

  it('overwrites existing credential', () => {
    saveConnectorCredential('claude', 'ANTHROPIC_API_KEY', 'sk-old');
    saveConnectorCredential('claude', 'ANTHROPIC_API_KEY', 'sk-new');
    expect(getConnectorCredential('claude', 'ANTHROPIC_API_KEY')).toBe('sk-new');
  });

  it('stores multiple keys per connector independently', () => {
    saveConnectorCredential('notion', 'NOTION_API_KEY', 'secret_abc');
    saveConnectorCredential('notion', 'NOTION_PARENT_PAGE_ID', 'page-uuid-123');
    expect(getConnectorCredential('notion', 'NOTION_API_KEY')).toBe('secret_abc');
    expect(getConnectorCredential('notion', 'NOTION_PARENT_PAGE_ID')).toBe('page-uuid-123');
  });

  it('stores credential in memory and makes it retrievable', () => {
    saveConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN', 'bot-token-xyz');
    // Credentials go to Tauri KV (not localStorage) — verify via in-memory getter
    expect(getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN')).toBe('bot-token-xyz');
    // localStorage is intentionally cleared after KV write
    expect(localStorage.getItem('alphonso_connector_credentials_v1')).toBeNull();
  });

  it('handles empty string value gracefully', () => {
    saveConnectorCredential('qwen', 'DASHSCOPE_API_KEY', '');
    expect(getConnectorCredential('qwen', 'DASHSCOPE_API_KEY')).toBe('');
  });
});

// ── secrets absent from logs/diagnostics (B3 done-when criterion) ────────────

describe('saveConnectorCredential — never leaks the raw secret into the audit trail', () => {
  it('does not call appendConnectorAudit at all when saving a credential', () => {
    appendConnectorAudit.mockClear();
    saveConnectorCredential('github', 'GITHUB_TOKEN', 'ghp_super_secret_value_12345');
    expect(appendConnectorAudit).not.toHaveBeenCalled();
  });

  it('updateConnectorAuthProfile audits enabled/mode/allowlistCount only — never a credential value', () => {
    appendConnectorAudit.mockClear();
    saveConnectorCredential('github', 'GITHUB_TOKEN', 'ghp_super_secret_value_12345');
    updateConnectorAuthProfile('github', { enabled: true, allowlist: ['owner/repo'] });

    expect(appendConnectorAudit).toHaveBeenCalled();
    for (const call of appendConnectorAudit.mock.calls) {
      const serializedCall = JSON.stringify(call);
      expect(serializedCall).not.toContain('ghp_super_secret_value_12345');
    }
  });
});

// ── getConnectorCredentials ───────────────────────────────────────────────────

describe('getConnectorCredentials', () => {
  it('returns all keys for a connector', () => {
    saveConnectorCredential('youtube', 'YOUTUBE_CLIENT_ID', 'client-id');
    saveConnectorCredential('youtube', 'YOUTUBE_CLIENT_SECRET', 'client-secret');
    const creds = getConnectorCredentials('youtube');
    expect(creds.YOUTUBE_CLIENT_ID).toBe('client-id');
    expect(creds.YOUTUBE_CLIENT_SECRET).toBe('client-secret');
  });

  it('returns empty object for unknown connector', () => {
    expect(getConnectorCredentials('unknown_connector')).toEqual({});
  });
});

// ── DEFAULT_AUTH_PROFILES ─────────────────────────────────────────────────────

describe('DEFAULT_AUTH_PROFILES', () => {
  it('contains telegram profile', () => {
    expect(DEFAULT_AUTH_PROFILES).toHaveProperty('telegram');
    expect(DEFAULT_AUTH_PROFILES.telegram.enabled).toBe(false);
  });

  it('contains whatsapp profile', () => {
    expect(DEFAULT_AUTH_PROFILES).toHaveProperty('whatsapp');
  });

  it('contains claude profile', () => {
    expect(DEFAULT_AUTH_PROFILES).toHaveProperty('claude');
  });

  it('sd_webui defaults to enabled', () => {
    expect(DEFAULT_AUTH_PROFILES.sd_webui.enabled).toBe(true);
  });

  it('comfyui_video defaults to enabled', () => {
    expect(DEFAULT_AUTH_PROFILES.comfyui_video.enabled).toBe(true);
  });
});

// ── readAuthProfiles / writeAuthProfiles ──────────────────────────────────────

describe('readAuthProfiles', () => {
  it('returns defaults when localStorage is empty', () => {
    const profiles = readAuthProfiles();
    expect(profiles).toHaveProperty('telegram');
    expect(profiles).toHaveProperty('claude');
  });

  it('merges stored profiles with defaults', () => {
    localStorage.setItem('alphonso_connector_auth_profiles_v1', JSON.stringify({ telegram: { enabled: true, allowlist: ['123'], mode: 'allowlist_required' } }));
    const profiles = readAuthProfiles();
    expect(profiles.telegram.enabled).toBe(true);
    expect(profiles.telegram.allowlist).toContain('123');
    expect(profiles).toHaveProperty('claude'); // default still present
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem('alphonso_connector_auth_profiles_v1', 'not valid json');
    const profiles = readAuthProfiles();
    expect(profiles).toHaveProperty('telegram');
  });
});

// ── updateConnectorAuthProfile ────────────────────────────────────────────────

describe('updateConnectorAuthProfile', () => {
  it('enables a connector', () => {
    updateConnectorAuthProfile('github', { enabled: true });
    const profiles = readAuthProfiles();
    expect(profiles.github?.enabled).toBe(true);
  });

  it('adds allowlist entries', () => {
    updateConnectorAuthProfile('telegram', { allowlist: ['111', '222'] });
    const profiles = readAuthProfiles();
    expect(profiles.telegram?.allowlist).toContain('111');
  });

  it('merges without overwriting unrelated fields', () => {
    updateConnectorAuthProfile('slack', { enabled: true });
    updateConnectorAuthProfile('slack', { allowlist: ['C123'] });
    const profiles = readAuthProfiles();
    expect(profiles.slack?.enabled).toBe(true);
    expect(profiles.slack?.allowlist).toContain('C123');
  });

  it('handles unknown connector id without throwing', () => {
    expect(() => updateConnectorAuthProfile('brand_new_connector', { enabled: true })).not.toThrow();
  });
});

// ── hydrateConnectorCredentialsFromSqlite — OS secure-store migration (B3) ────
// Each test gets a fresh module instance (vi.resetModules + dynamic re-import)
// because credential state lives in a module-level in-memory cache with no
// exported reset — reusing the module across tests would leak state between
// the different migration scenarios being asserted here.

describe('hydrateConnectorCredentialsFromSqlite — OS secure-store migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('reads directly from the OS secure store when already migrated, with no migration calls', async () => {
    const invokeMock = vi.fn(async (cmd, args) => {
      if (cmd === 'secure_credential_get' && args.key === 'alphonso_connector_credentials_v1') {
        return JSON.stringify({ github: { GITHUB_TOKEN: 'from-secure-store' } });
      }
      return null;
    });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    const mod = await import('../services/connectors/connectorAuth.ts');

    await mod.hydrateConnectorCredentialsFromSqlite();
    expect(mod.getConnectorCredential('github', 'GITHUB_TOKEN')).toBe('from-secure-store');

    const calledCommands = invokeMock.mock.calls.map((c) => c[0]);
    expect(calledCommands).toContain('secure_credential_get');
    expect(calledCommands).not.toContain('secure_credential_set');
    expect(calledCommands).not.toContain('kv_delete');
  });

  it('migrates from the legacy SQLite kv_store into the secure store, then deletes the kv copy', async () => {
    const invokeMock = vi.fn(async (cmd, args) => {
      if (cmd === 'secure_credential_get') return null; // not yet migrated
      if (cmd === 'kv_get' && args.key === 'alphonso_connector_credentials_v1') {
        return JSON.stringify({ slack: { SLACK_BOT_TOKEN: 'from-legacy-kv' } });
      }
      return null;
    });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    const mod = await import('../services/connectors/connectorAuth.ts');

    await mod.hydrateConnectorCredentialsFromSqlite();
    expect(mod.getConnectorCredential('slack', 'SLACK_BOT_TOKEN')).toBe('from-legacy-kv');

    const setCall = invokeMock.mock.calls.find((c) => c[0] === 'secure_credential_set');
    expect(setCall).toBeDefined();
    expect(JSON.parse(setCall[1].value)).toEqual({ slack: { SLACK_BOT_TOKEN: 'from-legacy-kv' } });

    const deleteCall = invokeMock.mock.calls.find((c) => c[0] === 'kv_delete');
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1].key).toBe('alphonso_connector_credentials_v1');
  });

  it('migrates from legacy localStorage (oldest location) when neither secure store nor kv has it', async () => {
    localStorage.setItem(
      'alphonso_connector_credentials_v1',
      JSON.stringify({ notion: { NOTION_API_KEY: 'from-legacy-localstorage' } })
    );
    const invokeMock = vi.fn(async () => null); // secure store and kv both empty
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    const mod = await import('../services/connectors/connectorAuth.ts');

    await mod.hydrateConnectorCredentialsFromSqlite();
    expect(mod.getConnectorCredential('notion', 'NOTION_API_KEY')).toBe('from-legacy-localstorage');

    const setCall = invokeMock.mock.calls.find((c) => c[0] === 'secure_credential_set');
    expect(setCall).toBeDefined();
    expect(JSON.parse(setCall[1].value)).toEqual({ notion: { NOTION_API_KEY: 'from-legacy-localstorage' } });
    // Oldest location must be cleaned up so this migration only ever runs once.
    expect(localStorage.getItem('alphonso_connector_credentials_v1')).toBeNull();
  });

  it('starts with an empty credential set when no location has anything', async () => {
    const invokeMock = vi.fn(async () => null);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    const mod = await import('../services/connectors/connectorAuth.ts');

    await mod.hydrateConnectorCredentialsFromSqlite();
    expect(mod.getConnectorCredential('anything', 'ANYTHING')).toBe('');
  });

  it('saveConnectorCredential writes to the OS secure store, not kv_store or localStorage', async () => {
    const invokeMock = vi.fn(async () => null);
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    const mod = await import('../services/connectors/connectorAuth.ts');

    mod.saveConnectorCredential('deepseek', 'DEEPSEEK_API_KEY', 'sk-test');
    expect(mod.getConnectorCredential('deepseek', 'DEEPSEEK_API_KEY')).toBe('sk-test');

    const setCall = invokeMock.mock.calls.find((c) => c[0] === 'secure_credential_set');
    expect(setCall).toBeDefined();
    expect(JSON.parse(setCall[1].value).deepseek.DEEPSEEK_API_KEY).toBe('sk-test');
    expect(localStorage.getItem('alphonso_connector_credentials_v1')).toBeNull();
  });
});
