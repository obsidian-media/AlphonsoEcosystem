import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Tauri mock ────────────────────────────────────────────────────────────────
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ok: true, connectors: [] })
}));

// ── connectorRegistryService re-exports connectorRegistry + connectorAuth.
//    Mock the leaf modules that the panel imports directly from connectorRegistryService.
vi.mock('../services/connectorRegistryService', () => ({
  // Registry functions
  listConnectors: vi.fn().mockReturnValue([
    { id: 'telegram', name: 'Telegram Bridge', status: 'not_configured', requiredEnv: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS'], envPresence: {} },
    { id: 'whatsapp', name: 'WhatsApp Bridge', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'youtube', name: 'YouTube Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'github', name: 'GitHub Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'slack', name: 'Slack Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'claude', name: 'Claude Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'chatgpt', name: 'ChatGPT Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'notion', name: 'Notion Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'clickup', name: 'ClickUp Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'qwen', name: 'Qwen Connector', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'brave_search', name: 'Brave Search', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'ollama', name: 'Ollama', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'sd_webui', name: 'SD WebUI', status: 'not_configured', requiredEnv: [], envPresence: {} },
    { id: 'mobile_bridge', name: 'Mobile Bridge', status: 'foundation_only', requiredEnv: [], envPresence: {} },
  ]),
  listConnectorAudit: vi.fn().mockReturnValue([]),
  listConnectorAuthProfiles: vi.fn().mockReturnValue({}),
  setConnectorStatus: vi.fn(),
  updateConnectorAuthProfile: vi.fn().mockReturnValue({ allowlist: [] }),
  verifyConnectorEnvironment: vi.fn().mockResolvedValue({ ok: true }),
  createConnectorRoutePacket: vi.fn().mockReturnValue({ packet: { id: 'pkt-1' } }),
  appendConnectorAudit: vi.fn(),
  // Polling / outbound
  pollTelegramConnector: vi.fn().mockResolvedValue({ count: 0, routed: 0, rejected: 0 }),
  pollWhatsAppConnector: vi.fn().mockResolvedValue({ count: 0, routed: 0, rejected: 0 }),
  simulateWhatsAppCloudInbound: vi.fn().mockResolvedValue({ routedCount: 0 }),
  sendTelegramConnectorMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendWhatsAppConnectorMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendChatGptConnectorMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendClaudeConnectorMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendQwenConnectorMessage: vi.fn().mockResolvedValue({ ok: true }),
  sendNotionConnectorEntry: vi.fn().mockResolvedValue({ ok: true }),
  sendClickUpConnectorTask: vi.fn().mockResolvedValue({ ok: true }),
  uploadYouTubeConnectorVideo: vi.fn().mockResolvedValue({ ok: true }),
  verifyWhatsAppCloudWebhookChallenge: vi.fn().mockResolvedValue({ ok: true }),
  verifyWhatsAppCloudWebhookSignature: vi.fn().mockResolvedValue({ ok: true }),
  proveTelegramConnectorPath: vi.fn().mockResolvedValue({ ok: true }),
  // Auth
  saveConnectorCredential: vi.fn(),
  getConnectorCredential: vi.fn().mockReturnValue('')
}));

// ── telegramAutoPollService mock ──────────────────────────────────────────────
vi.mock('../services/telegramAutoPollService', () => ({
  getTelegramAutoPollState: vi.fn().mockReturnValue({ running: false }),
  runSingleTelegramPoll: vi.fn().mockResolvedValue({ ok: true, count: 0, routed: 0 })
}));

// ── telegramBrowserConnector mock ─────────────────────────────────────────────
vi.mock('../services/telegramBrowserConnector', () => ({
  verifyTelegramBotEnvironment: vi.fn().mockResolvedValue({ ok: true, botUsername: 'testbot' })
}));

// ── connectorAuth (direct import path used by panel) ─────────────────────────
vi.mock('../services/connectors/connectorAuth', () => ({
  saveConnectorCredential: vi.fn(),
  getConnectorCredential: vi.fn().mockReturnValue('')
}));

// ── ToolConnectionsPanel (child component) ────────────────────────────────────
vi.mock('../components/ToolConnectionsPanel', () => ({
  ToolConnectionsPanel: () => <div data-testid="tool-connections-panel" />
}));

// ── Component under test ──────────────────────────────────────────────────────
import { ConnectorSetupPanel } from '../components/ConnectorSetupPanel';

describe('ConnectorSetupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Connectors section header', () => {
    render(<ConnectorSetupPanel />);
    expect(screen.getByText('Connectors')).toBeTruthy();
  });

  it('shows all connector cards', () => {
    render(<ConnectorSetupPanel />);
    // Each connector renders its name as a card
    expect(screen.getByText('Telegram Bridge')).toBeTruthy();
    expect(screen.getByText('WhatsApp Bridge')).toBeTruthy();
    expect(screen.getByText('GitHub Connector')).toBeTruthy();
    expect(screen.getByText('Slack Connector')).toBeTruthy();
    // 14 "Test Connection" buttons — one per connector card
    const testButtons = screen.getAllByRole('button', { name: /test connection/i });
    expect(testButtons.length).toBe(14);
  });

  it('shows Configure Integrations section', () => {
    render(<ConnectorSetupPanel />);
    expect(screen.getByText('Configure Integrations')).toBeTruthy();
  });

  it('shows Telegram credential section', () => {
    render(<ConnectorSetupPanel />);
    // The Telegram section renders a "Bot Token" label
    expect(screen.getByText('Bot Token')).toBeTruthy();
    // And a Telegram heading inside the credential section
    expect(screen.getByText('Telegram')).toBeTruthy();
  });

  it('shows GitHub credential section', () => {
    render(<ConnectorSetupPanel />);
    expect(screen.getByText('GitHub')).toBeTruthy();
    // The GitHub CredentialSection renders a "Personal Access Token" label
    expect(screen.getByText('Personal Access Token')).toBeTruthy();
  });

  it('save credential button exists in GitHub section', () => {
    render(<ConnectorSetupPanel />);
    // Multiple "Save & Enable" buttons exist (one per CredentialSection)
    const saveButtons = screen.getAllByRole('button', { name: /save & enable/i });
    expect(saveButtons.length).toBeGreaterThan(0);
  });

  it('notice div is not present initially when no notice is set', () => {
    render(<ConnectorSetupPanel />);
    // No notice text rendered by default — the notice state starts as empty string
    // There's no amber/error/info notice box visible on first render
    expect(screen.queryByText(/Bot token is required/i)).toBeNull();
    expect(screen.queryByText(/credentials saved/i)).toBeNull();
  });
});
