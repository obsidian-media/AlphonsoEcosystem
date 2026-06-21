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

  it('persists to localStorage', () => {
    saveConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN', 'bot-token-xyz');
    const stored = JSON.parse(localStorage.getItem('alphonso_connector_credentials_v1'));
    expect(stored?.telegram?.TELEGRAM_BOT_TOKEN).toBe('bot-token-xyz');
  });

  it('handles empty string value gracefully', () => {
    saveConnectorCredential('qwen', 'DASHSCOPE_API_KEY', '');
    expect(getConnectorCredential('qwen', 'DASHSCOPE_API_KEY')).toBe('');
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
