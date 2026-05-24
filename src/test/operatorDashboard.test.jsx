import React from 'react';
import { render, screen } from '@testing-library/react';
import { OperatorDashboard } from '../components/OperatorDashboard';

const baseProps = {
  operatorMode: false,
  setOperatorMode: () => {},
  modes: { localOnlyMode: true, approvalMode: true, safeMode: true },
  ollamaStatus: { label: 'Disconnected', trust: 'failed' },
  lastCheckedAt: null,
  verificationLogs: [],
  durableAuditLogs: [],
  onVerifyOllama: () => {},
  onVerifyAuditChain: () => {},
  onVerifyProcess: () => {},
  onVerifyPaths: () => {},
  onVerifyCommand: () => {},
  memoryItems: [],
  plugins: [],
  diskPluginManifests: [],
  pluginAudit: [],
  onTogglePlugin: () => {},
  onDiscoverPlugins: () => {},
  workspaceFoundation: {
    ocr: { enabled: false },
    screenCapture: { enabled: false },
    screenshotProof: { enabled: false },
    astIndexing: { enabled: false },
    editorAwareness: { enabled: false }
  },
  onToggleWorkspaceFeature: () => {},
  workspaceProof: null,
  ocrCapability: null,
  onRunWorkspaceProof: () => {},
  onCheckOcrCapability: () => {},
  workspaceSymbolIndex: null,
  onBuildSymbolIndex: () => {},
  onExecutePluginTool: () => {},
  onValidatePluginManifest: () => {},
  lastPluginToolRun: null,
  lastManifestValidation: null,
  pluginSandboxPolicy: { maxExtraArgs: 8, maxArgLength: 120, requireManifestValidation: true },
  onUpdatePluginSandboxPolicy: () => {},
  auditChainProof: null,
  onRunOcrAdapter: () => {},
  lastOcrAdapterRun: null,
  snapshots: [],
  onCreateSnapshot: () => {},
  onRestoreSnapshot: () => {},
  onBackupMemory: () => {},
  onRunRuntimeRepair: () => {},
  onRunReleasePreflight: () => {},
  onExportDiagnostics: () => {},
  coachMode: false,
  coachAlwaysOnTop: true,
  onToggleCoachMode: () => {},
  onToggleCoachTop: () => {}
};

describe('OperatorDashboard mode gating', () => {
  it('shows off-state panel when operator mode is disabled', () => {
    render(<OperatorDashboard {...baseProps} />);
    expect(screen.getByText('Operator Mode is Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  });

  it('shows runtime panel when operator mode is enabled', () => {
    render(<OperatorDashboard {...baseProps} operatorMode />);
    expect(screen.getByText('Runtime Health')).toBeInTheDocument();
    expect(screen.getByText('Recovery Systems')).toBeInTheDocument();
  });
});
