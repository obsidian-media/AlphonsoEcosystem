import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OperatorDashboard } from '../components/OperatorDashboard';

const defaultProps = {
  operatorMode: true,
  setOperatorMode: vi.fn(),
  modes: { simple: true, advanced: false },
  ollamaStatus: { state: 'running', label: 'Running' },
  lastCheckedAt: Date.now(),
  verificationLogs: [],
  durableAuditLogs: [],
  onVerifyOllama: vi.fn(),
  onVerifyAuditChain: vi.fn(),
  onVerifyProcess: vi.fn(),
  onVerifyPaths: vi.fn(),
  onVerifyCommand: vi.fn(),
  memoryItems: [],
  plugins: [],
  diskPluginManifests: [],
  pluginAudit: [],
  onTogglePlugin: vi.fn(),
  onDiscoverPlugins: vi.fn(),
  workspaceFoundation: { built: true },
  onToggleWorkspaceFeature: vi.fn(),
  workspaceProof: null,
  ocrCapability: false,
  onRunWorkspaceProof: vi.fn(),
  onCheckOcrCapability: vi.fn(),
  workspaceSymbolIndex: null,
  onBuildSymbolIndex: vi.fn(),
  onExecutePluginTool: vi.fn(),
  onValidatePluginManifest: vi.fn(),
  lastPluginToolRun: null,
  lastManifestValidation: null,
  pluginSandboxPolicy: 'safe',
  onUpdatePluginSandboxPolicy: vi.fn(),
  auditChainProof: null,
  onRunOcrAdapter: vi.fn(),
  lastOcrAdapterRun: null,
  snapshots: [],
  onCreateSnapshot: vi.fn(),
  onRestoreSnapshot: vi.fn(),
  onBackupMemory: vi.fn(),
};

describe('OperatorDashboard smoke', () => {
  it('renders without crashing', () => {
    render(<OperatorDashboard {...defaultProps} />);
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it('shows operator mode label', () => {
    render(<OperatorDashboard {...defaultProps} />);
    expect(screen.getByText(/Operator/i)).toBeTruthy();
  });

  it('renders with minimal props', () => {
    render(<OperatorDashboard {...defaultProps} />);
    expect(document.querySelector('[class*="flex"]')).toBeTruthy();
  });
});
