import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

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
// QA batch 1: saving the Telegram token starts (or restarts) the link at once.
vi.mock('../services/telegramCompanionService', () => ({ restartTelegramCompanion: vi.fn(() => true) }));
vi.mock('../services/connectors/connectorAuth', () => ({
  saveConnectorCredential: vi.fn(),
  getConnectorCredential: vi.fn().mockReturnValue(''),
  hydrateConnectorCredentialsFromSqlite: vi.fn().mockResolvedValue()
}));

// ── ToolConnectionsPanel (child component) ────────────────────────────────────
vi.mock('../services/connectors/higgsfieldConnector', async (orig) => ({
  ...(await orig()),
  testHiggsfieldModel: vi.fn(async () => ({ ok: true, usd: 0.12 })),
}));
vi.mock('../services/connectors/elevenLabsConnector', () => ({
  listElevenLabsVoices: vi.fn(async () => ({ ok: true, voices: [{ id: 'v1', name: 'Rachel', cloned: false }, { id: 'v2', name: 'My voice', cloned: true }] })),
}));
vi.mock('../services/connectors/openRouterConnector', () => ({
  getOpenRouterKeyInfo: vi.fn(async () => ({ freeUsed: 4, freeLimit: 50, freeRemaining: 46, isFreeTier: false })),
}));
vi.mock('../components/ToolConnectionsPanel', () => ({
  ToolConnectionsPanel: () => <div data-testid="tool-connections-panel" />
}));

// ── CALL-E MCP auth service mock ──────────────────────────────────────────────
vi.mock('../services/calleMcpAuthService', () => ({
  isCalleMcpConfigured: vi.fn().mockResolvedValue(false),
  startBrokerLogin: vi.fn(),
  pollBrokerLogin: vi.fn(),
  disconnectCalleMcp: vi.fn()
}));

// ── Component under test ──────────────────────────────────────────────────────
import { ConnectorSetupPanel } from '../components/ConnectorSetupPanel';
import { restartTelegramCompanion } from '../services/telegramCompanionService';
import { listAgentProfiles } from '../agents/agentRegistry';

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
    expect(screen.getAllByText('Bot Token').length).toBeGreaterThan(0);
    // And a Telegram heading inside the credential section
    expect(screen.getByText('Telegram')).toBeTruthy();
  });

  // Agent phase 5: each connector says where Marcus sends by default.
  it('the Slack section saves where Marcus sends', async () => {
    localStorage.clear();
    const { saveConnectorCredential } = await import('../services/connectors/connectorAuth');
    render(<ConnectorSetupPanel />);
    const field = screen.getByLabelText('Where Marcus sends: default channel');
    fireEvent.change(screen.getAllByLabelText('Bot Token').find((el) => el.getAttribute('placeholder') === 'xoxb-...'), { target: { value: 'xoxb-1' } });
    fireEvent.change(field, { target: { value: '#team' } });
    const section = field.closest('div.rounded-2xl');
    await act(async () => { fireEvent.click(within(section).getByRole('button')); });
    expect(saveConnectorCredential).toHaveBeenCalledWith('slack', 'SLACK_DEFAULT_CHANNEL', '#team');
  });

  it('shows GitHub credential section', () => {
    render(<ConnectorSetupPanel />);
    // GitHub lives in the "Content & Productivity" collapsible category,
    // collapsed by default — expand it before asserting on its contents.
    fireEvent.click(screen.getByTestId('connector-category-content'));
    expect(screen.getByText('GitHub')).toBeTruthy();
    // The GitHub CredentialSection renders a "Personal Access Token" label
    expect(screen.getByText('Personal Access Token')).toBeTruthy();
  });

  // Miya content factory phase 2a: free stock footage keys for the B-roll step.
  it('has a key field for each stock footage source', () => {
    // The category's open state is remembered; start closed.
    localStorage.clear();
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-content'));
    for (const title of ['Pexels (stock footage)', 'Pixabay (stock footage)', 'Coverr (stock footage)']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  // Phase 4b: ElevenLabs, with a Test that lists the account's voices.
  // OpenRouter (2026-10-30): its key, the free requests left, and your own keys counted as paid.
  it('has an OpenRouter section that saves its key and shows the free requests left', async () => {
    localStorage.clear();
    const auth = await import('../services/connectors/connectorAuth');
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-ai_models'));
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText(/those models count as paid steps/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test OpenRouter' }));
    expect(await screen.findByText('46 free requests left today.')).toBeInTheDocument();
    const field = screen.getByPlaceholderText('sk-or-...');
    fireEvent.change(field, { target: { value: 'sk-or-test' } });
    const section = field.closest('[data-credential-section]') || field.parentElement.parentElement.parentElement;
    fireEvent.click(within(section).getAllByRole('button').find((b) => /save/i.test(b.textContent)));
    expect(auth.saveConnectorCredential).toHaveBeenCalledWith('openrouter', 'OPENROUTER_API_KEY', 'sk-or-test');
  });

  it('has an ElevenLabs section whose Test lists your voices', async () => {
    localStorage.clear();
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-content'));
    expect(screen.getByText('ElevenLabs (voices and sound effects)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test ElevenLabs' }));
    expect(await screen.findByText('Connected: 2 voices, 1 of them cloned by you.')).toBeInTheDocument();
  });

  // Phase 4b: Higgsfield, with the model ids you paste and a Test that asks its estimate.
  it('has a Higgsfield section whose Test gives the estimate for the model id', async () => {
    localStorage.clear();
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-content'));
    expect(screen.getByText('Higgsfield (pictures and AI clips)')).toBeInTheDocument();
    expect(screen.getByLabelText('Motion model id')).toBeInTheDocument();
    expect(screen.getByLabelText('Motion model extra settings (JSON)')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('e.g. higgsfield-ai/soul/v2/standard'), { target: { value: 'higgsfield-ai/soul/v2/standard' } });
    fireEvent.change(screen.getByLabelText('Picture model extra settings (JSON)'), { target: { value: '{"quality":"high"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test picture model' }));
    expect(await screen.findByText('Picture model works: about $0.12 each.')).toBeInTheDocument();
    const { testHiggsfieldModel } = await import('../services/connectors/higgsfieldConnector');
    expect(testHiggsfieldModel).toHaveBeenCalledWith('higgsfield-ai/soul/v2/standard', { quality: 'high' });
    fireEvent.change(screen.getByLabelText('Clip model extra settings (JSON)'), { target: { value: '[1]' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. kling-video/v2.1/pro/image-to-video'), { target: { value: 'kling-video/v2.1/pro/image-to-video' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test clip model' }));
    expect(await screen.findByText('The clip model’s extra settings are not valid JSON.')).toBeInTheDocument();
  });

  // Phase 3a: Meta (Facebook and Instagram) keys can be saved in Settings.
  it('has a Meta section with its keys', () => {
    localStorage.clear();
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-content'));
    expect(screen.getByText('Meta (Facebook and Instagram)')).toBeInTheDocument();
    for (const label of ['Access Token', 'Page Access Token', 'Page ID', 'Instagram Business Account ID', 'App ID', 'App Secret']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  // Phase 3b: saving the YouTube keys records when (for the 7-day sign-in warning); a Published project has no limit.
  it('saving the YouTube keys records the sign-in time; the Published box turns the count off', () => {
    localStorage.clear();
    render(<ConnectorSetupPanel />);
    fireEvent.click(screen.getByTestId('connector-category-content'));
    const section = screen.getByText('YouTube').closest('div.rounded-2xl');
    fireEvent.change(within(section).getAllByRole('textbox')[0], { target: { value: 'client-id' } });
    fireEvent.click(within(section).getByRole('button', { name: /save/i }));
    expect(JSON.parse(localStorage.getItem('alphonso_sign_ins_v1')).youtube.savedAtMs).toEqual(expect.any(Number));
    fireEvent.click(screen.getByLabelText(/My Google project is Published/));
    expect(JSON.parse(localStorage.getItem('alphonso_sign_ins_v1')).youtubePublished).toBe(true);
  });

  it('save credential button exists in GitHub section', () => {
    render(<ConnectorSetupPanel />);
    // Multiple "Save & Enable" buttons exist (one per CredentialSection)
    const saveButtons = screen.getAllByRole('button', { name: /save & enable/i });
    expect(saveButtons.length).toBeGreaterThan(0);
  });

  // ── Hermes Agents section — no-hardcoding regression (design doc §1.7 item 3) ──
  // Guards against exactly the drift the user flagged: the row list must come
  // from agentRegistry.js at render time, not a separately maintained array —
  // asserted at the UI layer, not just the data layer, since a hardcoded array
  // could still leak into a component even with a clean service.
  it('renders exactly one Hermes credential row per agent in agentRegistry.js, dynamically', () => {
    render(<ConnectorSetupPanel />);
    // Hermes Agents lives in the "AI Models" collapsible category, collapsed
    // by default — expand it before asserting on its contents.
    fireEvent.click(screen.getByTestId('connector-category-ai_models'));
    const agents = listAgentProfiles();
    expect(agents.length).toBeGreaterThan(0);
    for (const agent of agents) {
      expect(screen.getByText(`Hermes — ${agent.name}`)).toBeTruthy();
    }
    // Every rendered "Hermes — X" heading corresponds to a real registry
    // entry — no stray hardcoded row that isn't backed by the registry.
    const hermesHeadings = screen.getAllByText(/^Hermes — /);
    expect(hermesHeadings.length).toBe(agents.length);
  });

  // QA batch 1 (live check of 2.10.0, 2026-10-28): the bot didn't answer /start; a token saved
  // while the app was open did nothing until a restart. Save & Enable starts the link now.
  it('Save & Enable on Telegram starts the link without a restart', async () => {
    render(<ConnectorSetupPanel />);
    const token = screen.getByPlaceholderText('Paste your bot token from @BotFather');
    fireEvent.change(token, { target: { value: '123:abc' } });
    const save = screen.getAllByRole('button', { name: 'Save & Enable' }).find((b) => token.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => { fireEvent.click(save); });
    expect(restartTelegramCompanion).toHaveBeenCalled();
  });

  // QA batch 1 (live check, 2026-10-28): an xapp- app-level token was saved as Slack's bot token.
  it("Slack's Save refuses an app-level token and says which token to paste", async () => {
    const { saveConnectorCredential } = await import('../services/connectors/connectorAuth');
    render(<ConnectorSetupPanel />);
    const token = screen.getByPlaceholderText('xoxb-...');
    fireEvent.change(token, { target: { value: 'xapp-1-A1-123-abc' } });
    const save = screen.getAllByRole('button', { name: /save/i }).find((b) => token.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    vi.mocked(saveConnectorCredential).mockClear();
    await act(async () => { fireEvent.click(save); });
    expect(await screen.findByText(/This is an app-level token \(xapp-…\)/)).toBeTruthy();
    expect(saveConnectorCredential).not.toHaveBeenCalledWith('slack', 'SLACK_BOT_TOKEN', expect.anything());
    // Nothing was saved, so the section doesn't say it was.
    expect(screen.queryByText('Slack token saved')).toBeNull();
  });

  it('notice div is not present initially when no notice is set', () => {
    render(<ConnectorSetupPanel />);
    // No notice text rendered by default — the notice state starts as empty string
    // There's no amber/error/info notice box visible on first render
    expect(screen.queryByText(/Bot token is required/i)).toBeNull();
    expect(screen.queryByText(/credentials saved/i)).toBeNull();
  });

  it('shows an MCP Connection status row with a Connect button under the CALL-E section', () => {
    render(<ConnectorSetupPanel />);
    expect(screen.getByText(/MCP Connection/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /connect via browser login/i })).toBeTruthy();
  });

  it('re-enables the Connect button after the 2-minute login-poll timeout instead of getting stuck on "Waiting for browser login..."', async () => {
    const { startBrokerLogin, pollBrokerLogin } = await import('../services/calleMcpAuthService');
    startBrokerLogin.mockResolvedValue({ sessionId: 's1', sessionSecret: 'secret', loginUrl: 'https://x', status: 'PENDING', pollAfterMs: 2000 });
    pollBrokerLogin.mockResolvedValue('pending');

    vi.useFakeTimers();
    render(<ConnectorSetupPanel />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /connect via browser login/i }));
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /waiting for browser login/i })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    });

    expect(screen.getByRole('button', { name: /connect via browser login/i })).not.toBeDisabled();
    vi.useRealTimers();
  });
});
