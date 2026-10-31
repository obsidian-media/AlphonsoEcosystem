import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SettingsView } from '../components/SettingsView';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

vi.mock('../services/connectors/openRouterConnector', async (orig) => ({
  ...(await orig()),
  listOpenRouterUserModels: vi.fn(async () => [
    { id: 'b/y', name: 'B: Y', contextLength: 32000, promptUsdPerToken: 0.000001, completionUsdPerToken: 0.000002, free: false, expiresAtMs: null, textOutput: true },
    { id: 'a/x:free', name: 'A: X (free)', contextLength: 32000, promptUsdPerToken: 0, completionUsdPerToken: 0, free: true, expiresAtMs: null, textOutput: true },
  ]),
}));
vi.mock('../services/agentAvatarService', () => ({
  getCustomAvatarDataUrl: vi.fn().mockReturnValue(null),
  removeCustomAvatar: vi.fn(),
  setCustomAvatar: vi.fn(),
}));

vi.mock('../services/agentVisualService', () => ({
  getAgentMascotPath: vi.fn().mockReturnValue(''),
}));

vi.mock('../services/composioService', () => ({
  getComposioConfig: vi.fn().mockReturnValue({ apiKey: '', userId: 'u' }),
  setComposioConfig: vi.fn(),
  isComposioEnabled: vi.fn().mockReturnValue(false),
  getComposioStatus: vi.fn().mockReturnValue({ connected: false }),
  checkComposioHealth: vi.fn().mockResolvedValue({ status: 'ok', message: '' }),
  fetchComposioToolkits: vi.fn().mockResolvedValue([]),
  hydrateComposioApiKeyFromKeychain: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/pluginRegistryService', () => ({
  listPlugins: vi.fn().mockReturnValue([]),
  togglePlugin: vi.fn(),
}));

vi.mock('../services/backupService', () => ({
  createBackup: vi.fn().mockResolvedValue({ ok: true }),
  restoreBackup: vi.fn().mockResolvedValue({ ok: true }),
  exportBackupToFile: vi.fn(),
  importBackupFromFile: vi.fn().mockResolvedValue(null),
  getBackupSizeEstimate: vi.fn().mockResolvedValue({ files: 0, bytes: 0 }),
}));

vi.mock('../services/agentWorkshop/accBridgeService', () => ({
  getAccBridgeConfig: vi.fn().mockReturnValue({ endpoint: '' }),
  updateAccBridgeConfig: vi.fn(),
}));

vi.mock('../services/comfyuiSettingsService', () => ({
  resolveComfyuiDirectory: vi.fn().mockResolvedValue(''),
  resolveComfyuiPython: vi.fn().mockResolvedValue(''),
}));

vi.mock('../services/memoryService', () => ({
  listMemoryItems: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/echoFileWatcherService', () => ({
  getWatcherConfig: vi.fn().mockReturnValue({ enabled: false, paths: [] }),
  saveWatcherConfig: vi.fn(),
}));

vi.mock('../services/memoryMonitorService', () => ({
  getUsageStats: vi.fn().mockReturnValue({ usedMB: 0, limitMB: 100 }),
}));

vi.mock('../services/coachEngineService', () => ({
  ALL_COACH_TRIGGER_IDS: ['critical_override_pattern'],
  getCoachEnabled: vi.fn().mockReturnValue(false),
  setCoachEnabled: vi.fn(),
  getAllCoachTriggerToggles: vi.fn().mockReturnValue({ critical_override_pattern: true }),
  setCoachTriggerEnabled: vi.fn(),
  getCoachNarrativeEnabled: vi.fn().mockReturnValue(false),
  setCoachNarrativeEnabled: vi.fn(),
  getCoachSnoozeUntilMs: vi.fn().mockReturnValue(0),
  setCoachSnoozeHours: vi.fn(),
  clearCoachSnooze: vi.fn(),
}));

vi.mock('../agents/agentRegistry', () => ({
  listAgentProfiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/modelSelectionService', () => ({
  getAgentProvider: vi.fn().mockReturnValue({}),
  setAgentProvider: vi.fn(),
}));

vi.mock('../lib/ollama', () => ({
  formatModelSize: vi.fn().mockReturnValue('0B'),
  normalizeEndpoint: vi.fn().mockReturnValue('http://localhost:11434'),
  isChatModel: () => true,
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://localhost:11434',
  pullOllamaModel: vi.fn(),
}));

vi.mock('../components/MemoryGraphViewer', () => ({
  MemoryGraphViewer: () => <div data-testid="memory-graph">Graph</div>,
}));

vi.mock('../components/AgentMetricsPanel', () => ({
  AgentMetricsPanel: () => <div data-testid="agent-metrics">Metrics</div>,
}));

vi.mock('../components/WorkspaceExportImportView', () => ({
  WorkspaceExportImportView: () => <div data-testid="workspace-export">Export</div>,
}));

vi.mock('../components/NovaHistoryChart', () => ({
  NovaHistoryChart: () => <div data-testid="nova-history">History</div>,
}));

vi.mock('../components/CrashLogView', () => ({
  CrashLogView: () => <div data-testid="crash-log">Crashes</div>,
}));

vi.mock('../components/CompanionPairingPanel', () => ({
  CompanionPairingPanel: () => <div data-testid="companion-pairing">Pairing</div>,
}));

vi.mock('../components/ConnectorSetupPanel', () => ({
  ConnectorSetupPanel: () => <div data-testid="connector-setup">Connectors</div>,
}));

vi.mock('../components/SessionHistoryView', () => ({
  SessionHistoryView: () => <div data-testid="session-history">History</div>,
}));

vi.mock('../components/FilesView', () => ({
  FilesView: () => <div data-testid="files-view">Files</div>,
}));

vi.mock('../components/CoachHistoryPanel', () => ({
  CoachHistoryPanel: () => <div data-testid="coach-history">Coach</div>,
}));

vi.mock('../components/ModelSwitcher', () => ({
  ModelProviderPicker: () => <div data-testid="model-picker">Picker</div>,
}));

const minimalSettings = {
  selectedModel: 'test-model',
  ollamaEndpoint: 'http://localhost:11434',
  zeroCostMode: true,
  theme: 'dark',
  operatorMode: false,
};

describe('SettingsView smoke', () => {
  it('renders without crashing', () => {
    render(
      <SettingsView
        settings={minimalSettings}
        setSettings={vi.fn()}
        ollamaStatus={{ state: 'running', label: 'Running' }}
        installedModels={[{ name: 'test-model', size: '1GB' }]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
      />
    );
    expect(screen.getByText('System Settings')).toBeTruthy();
  });

  it('shows General section by default', () => {
    render(
      <SettingsView
        settings={minimalSettings}
        setSettings={vi.fn()}
        ollamaStatus={{ state: 'running', label: 'Running' }}
        installedModels={[]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
      />
    );
    expect(screen.getByText('General', { exact: true })).toBeTruthy();
  });

  // Miya content factory phase 2a: the installer includes an LGPL FFmpeg build.
  it('names the FFmpeg license (LGPL) for the finished videos', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    render(<SettingsView settings={minimalSettings} setSettings={vi.fn()} ollamaStatus={{ state: 'running', label: 'Running' }} installedModels={[]} onCheckOllama={vi.fn()} onCopyTroubleshootingCommand={vi.fn()} />);
    expect(screen.getByTestId('ffmpeg-license-notice').textContent).toContain('GNU LGPL 2.1');
    fireEvent.click(screen.getByRole('button', { name: 'FFmpeg license and source' }));
    expect(invoke).toHaveBeenCalledWith('open_url', { url: 'https://ffmpeg.org/legal.html' });
  });

  it('renders with empty settings', () => {
    render(
      <SettingsView
        settings={{}}
        setSettings={vi.fn()}
        ollamaStatus={{ state: 'stopped', label: 'Stopped' }}
        installedModels={[]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
      />
    );
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // QA 2026-10-21: the Coach toggles were icon-only buttons with no name or
  // on/off state, so a screen reader (and the desktop tests) could not tell
  // what they did or whether they were on.
  it('names the Coach toggles and reports their on/off state', () => {
    render(
      <SettingsView
        settings={minimalSettings}
        setSettings={vi.fn()}
        ollamaStatus={{ state: 'running', label: 'Running' }}
        installedModels={[]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }));
    expect(screen.getByRole('switch', { name: 'Toggle Session Coach detection engine' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Toggle Ollama-narrative rewriting' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Toggle Approval theater (repeated high-risk approvals)' }).getAttribute('aria-checked')).toBe('true');
  });

  // The Operator Dashboard is a developer tool, shown only in developer mode (owner, 2026-10-22).
  it('has a Developer mode switch that turns developer mode on', () => {
    const setDeveloperMode = vi.fn();
    render(
      <SettingsView
        settings={minimalSettings}
        setSettings={vi.fn()}
        ollamaStatus={{ state: 'running', label: 'Running' }}
        installedModels={[]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
        developerMode={false}
        setDeveloperMode={setDeveloperMode}
      />
    );
    const toggle = screen.getByRole('switch', { name: 'Developer mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(setDeveloperMode).toHaveBeenCalledWith(true);
  });

  // Settings → Approvals: one switch per kind of action (Jose redesign, 2026-10-23).
  function renderApprovals(settings, setSettings = vi.fn()) {
    render(
      <SettingsView
        settings={settings}
        setSettings={setSettings}
        ollamaStatus={{ state: 'running', label: 'Running' }}
        installedModels={[]}
        onCheckOllama={vi.fn()}
        onCopyTroubleshootingCommand={vi.fn()}
        copyState=""
      />
    );
    return setSettings;
  }

  // The policy treats an unset Approval Mode as on; the switch must say so (2026-10-23).
  it("saves when Jose shows his plan first", () => {
    const setSettings = renderApprovals({ ...minimalSettings });
    const select = screen.getByLabelText("Show Jose's plan first");
    expect(select.value).toBe('bigger');
    fireEvent.change(select, { target: { value: 'never' } });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ showPlanFirst: 'never' }));
  });

  // OpenRouter (2026-10-30): what a step does when OpenRouter's free limit runs out.
  it("saves what happens when OpenRouter's free limit runs out", () => {
    const setSettings = renderApprovals({ ...minimalSettings });
    const select = screen.getByLabelText("When OpenRouter's free limit runs out");
    expect(select.value).toBe('local');
    expect(screen.getByText("Use this computer's model")).toBeTruthy();
    fireEvent.change(select, { target: { value: 'paid' } });
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ openRouterFreeLimit: 'paid' }));
  });

  // OpenRouter (2026-10-30): a third paid choice; the model comes from OpenRouter's list with its prices.
  it('offers OpenRouter as the paid model, with prices from OpenRouter', async () => {
    const setSettings = renderApprovals({ ...minimalSettings, zeroCostMode: false, paidModels: { allowed: true, provider: 'openrouter' } });
    const model = await screen.findByLabelText('OpenRouter paid model');
    expect(await screen.findByText('B: Y ($1.00 in, $2.00 out per million tokens)')).toBeTruthy();
    expect(screen.queryByText(/A: X \(free\)/)).toBeNull();
    fireEvent.change(model, { target: { value: 'b/y' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ provider: 'openrouter', model: 'b/y', inputPerMillionUsd: 1, outputPerMillionUsd: 2 }) }));
    expect(screen.getByLabelText('Price per million input tokens (USD)').hasAttribute('readonly')).toBe(true);
    expect(screen.getByText('Prices from OpenRouter.')).toBeTruthy();
  });

  // Phase 4: paid models, which you allow, with prices you enter and a monthly cap.
  it('saves the paid-model settings', () => {
    const setSettings = renderApprovals({ ...minimalSettings, zeroCostMode: true, paidModels: { monthlyCapUsd: 5 } });
    expect(screen.getByText(/Zero-Cost Mode must be off/)).toBeTruthy();
    expect(screen.getByText('Spent this month: $0.00')).toBeTruthy();
    const allow = screen.getByRole('switch', { name: 'Allow paid models' });
    expect(allow.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(allow);
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ allowed: true, provider: 'claude' }) }));
    fireEvent.change(screen.getByLabelText('Paid model provider'), { target: { value: 'chatgpt' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ provider: 'chatgpt' }) }));
    fireEvent.change(screen.getByLabelText('Price per million input tokens (USD)'), { target: { value: '3' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ inputPerMillionUsd: 3 }) }));
    fireEvent.change(screen.getByLabelText('Monthly spending cap (USD)'), { target: { value: '' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ monthlyCapUsd: null }) }));
    // Content factory phase 2b: Runway's price for Miya's AI clips, which share the cap.
    fireEvent.change(screen.getByLabelText("Runway price per second of video (USD)"), { target: { value: '0.05' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ runwayPricePerSecondUsd: 0.05 }) }));
    // Phase 4b: ElevenLabs' prices.
    fireEvent.change(screen.getByLabelText('ElevenLabs price per 1,000 characters (USD)'), { target: { value: '0.3' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ elevenLabsPricePer1kCharsUsd: 0.3 }) }));
    fireEvent.change(screen.getByLabelText('ElevenLabs price per sound effect (USD)'), { target: { value: '0.02' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ paidModels: expect.objectContaining({ elevenLabsPricePerEffectUsd: 0.02 }) }));
  });

  it('saves how long waiting requests wait before they expire', () => {
    const setSettings = renderApprovals({ ...minimalSettings });
    const field = screen.getByLabelText('Waiting requests expire after (days)');
    expect(field.value).toBe('7');
    fireEvent.change(field, { target: { value: '14' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ joseWaitingExpiryDays: 14 }));
    fireEvent.change(field, { target: { value: '' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ joseWaitingExpiryDays: 0 }));
  });

  it('saves the model size from which agents call their own tools (agent roles Part B)', () => {
    const setSettings = renderApprovals({ ...minimalSettings });
    fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
    const field = screen.getByLabelText('Agents call their own tools from model size (billions)');
    expect(field.value).toBe('14');
    fireEvent.change(field, { target: { value: '30' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ agentToolCallMinSizeB: 30 }));
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ agentToolCallMinSizeB: 14 }));
  });

  it('switches what Jose sends to Telegram, all on to start', () => {
    const setSettings = renderApprovals({ ...minimalSettings });
    for (const label of ['When a step waits for you', 'When a plan waits for you', 'When a request finishes or fails', 'When a review asks you to decide']) {
      expect(screen.getByRole('switch', { name: `Telegram: ${label}` }).getAttribute('aria-checked')).toBe('true');
    }
    const older = screen.getByRole('switch', { name: 'Telegram: Agent activity summaries' });
    expect(older.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(older);
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ joseTelegram: expect.objectContaining({ activitySummaries: true }) }));
    fireEvent.click(screen.getByRole('switch', { name: 'Telegram: When a request finishes or fails' }));
    expect(setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ joseTelegram: expect.objectContaining({ finished: false }) }));
  });

  it('shows Approval Mode on when the setting has never been set', () => {
    renderApprovals({});
    expect(screen.getByRole('switch', { name: 'Toggle approval mode' }).getAttribute('aria-checked')).toBe('true');
  });

  it('locks spend, publish and delete to always ask', () => {
    renderApprovals({ ...minimalSettings, approvalMode: true });
    for (const label of ['Spend money', 'Publish or send anything outside', 'Delete anything']) {
      const row = screen.getByRole('switch', { name: `Ask before: ${label}` });
      expect(row.getAttribute('aria-checked')).toBe('true');
      expect(row.disabled).toBe(true);
    }
    expect(screen.getAllByText('Always asks').length).toBe(3);
  });

  it('saves a change to an unlocked row', () => {
    const setSettings = renderApprovals({ ...minimalSettings, approvalMode: true });
    const run = screen.getByRole('switch', { name: 'Ask before: Run code and commands' });
    expect(run.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(run);
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ effectApprovals: expect.objectContaining({ run: false }) }));
  });

  it('greys out the unlocked rows while Approval Mode is off', () => {
    renderApprovals({ ...minimalSettings, approvalMode: false });
    expect(screen.getByRole('switch', { name: 'Ask before: Run code and commands' }).disabled).toBe(true);
    expect(screen.getByText(/Approval Mode is off: only the locked ones ask/)).toBeTruthy();
  });
});
