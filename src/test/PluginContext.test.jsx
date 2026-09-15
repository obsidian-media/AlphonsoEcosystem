import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PluginProvider, usePlugins } from '../contexts/PluginContext';
import { SettingsProvider } from '../contexts/SettingsContext';

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn()
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/default')
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', VERIFIED: 'verified', UNVERIFIED: 'unverified', FAILED: 'failed' },
  timestampMs: vi.fn(() => Date.now())
}));

vi.mock('../constants/appConstants', () => ({
  AUDIT_LOG_FETCH_LIMIT: 50,
  VERIFICATION_LOG_CAP: 100
}));

vi.mock('../services/pluginRegistryService', () => ({
  appendPluginAuditEntry: vi.fn(),
  discoverDiskPluginManifests: vi.fn(async () => []),
  executePluginToolRun: vi.fn(async () => ({ success: true })),
  listPluginAudit: vi.fn(() => []),
  listPlugins: vi.fn(() => [{ id: 'test-plugin', name: 'Test Plugin', enabled: true }]),
  togglePlugin: vi.fn((id, enabled) => [{ id: 'test-plugin', name: 'Test Plugin', enabled }]),
  validatePluginManifestDisk: vi.fn(async () => ({ valid: true }))
}));

vi.mock('../services/pluginSandboxService', () => ({
  evaluatePluginExecutionPolicy: vi.fn(() => ({ allowed: true })),
  getPluginSandboxPolicy: vi.fn(() => ({ requireManifestValidation: false })),
  updatePluginSandboxPolicy: vi.fn((patch) => ({ requireManifestValidation: false, ...patch }))
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: vi.fn((log) => ({ id: 'log_1', ...log })),
  readDurableAuditLog: vi.fn(async () => [])
}));

function TestConsumer() {
  const { plugins, pluginSandboxPolicy } = usePlugins();
  return (
    <div>
      <span data-testid="plugin-count">{plugins.length}</span>
      <span data-testid="sandbox">{String(pluginSandboxPolicy.requireManifestValidation)}</span>
    </div>
  );
}

function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <PluginProvider
        requestApproval={vi.fn(async () => true)}
        setVerificationLogs={vi.fn()}
        setDurableAuditLogs={vi.fn()}
        setApprovalRequiredNotice={vi.fn()}
      >
        {ui}
      </PluginProvider>
    </SettingsProvider>
  );
}

describe('PluginContext', () => {
  it('provides plugins list', () => {
    renderWithProviders(<TestConsumer />);
    expect(screen.getByTestId('plugin-count').textContent).toBe('1');
  });

  it('provides sandbox policy', () => {
    renderWithProviders(<TestConsumer />);
    expect(screen.getByTestId('sandbox').textContent).toBe('false');
  });

  it('throws when usePlugins used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      usePlugins();
      return null;
    }
    expect(() => render(<SettingsProvider><Bad /></SettingsProvider>)).toThrow('usePlugins must be used within PluginProvider');
    spy.mockRestore();
  });
});
