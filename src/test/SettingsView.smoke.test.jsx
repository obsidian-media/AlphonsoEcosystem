import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SettingsView } from '../components/SettingsView';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));

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
  ALL_COACH_TRIGGER_IDS: [],
  getCoachEnabled: vi.fn().mockReturnValue(false),
  setCoachEnabled: vi.fn(),
  getAllCoachTriggerToggles: vi.fn().mockReturnValue({}),
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
});
