import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { WorkspaceProvider, useWorkspace } from '../contexts/WorkspaceContext';
import { SettingsProvider } from '../contexts/SettingsContext';

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn()
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/default')
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', VERIFIED: 'verified', UNVERIFIED: 'unverified', FAILED: 'failed' }
}));

vi.mock('../constants/appConstants', () => ({
  AUDIT_LOG_FETCH_LIMIT: 50,
  VERIFICATION_LOG_CAP: 100,
  SYMBOL_INDEX_FILE_LIMIT: 500
}));

vi.mock('../services/workspaceIntelligenceService', () => ({
  buildWorkspaceSymbolIndex: vi.fn(async () => ({ root: 'C:/', files_indexed: 10 })),
  checkOcrCapability: vi.fn(async () => ({ available: false })),
  collectWorkspaceProof: vi.fn(async () => ({ trust: 'verified' })),
  getWorkspaceFoundation: vi.fn(() => ({ proofEnabled: false })),
  runOcrAdapter: vi.fn(async () => ({ success: true })),
  updateWorkspaceFoundation: vi.fn((patch) => patch)
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: vi.fn((log) => ({ id: 'log_1', ...log })),
  readDurableAuditLog: vi.fn(async () => [])
}));

function TestConsumer() {
  const { workspaceFoundation } = useWorkspace();
  return (
    <div>
      <span data-testid="foundation">{JSON.stringify(workspaceFoundation)}</span>
    </div>
  );
}

function renderWithProviders(ui) {
  return render(
    <SettingsProvider>
      <WorkspaceProvider
        requestApproval={vi.fn(async () => true)}
        setVerificationLogs={vi.fn()}
        setDurableAuditLogs={vi.fn()}
      >
        {ui}
      </WorkspaceProvider>
    </SettingsProvider>
  );
}

describe('WorkspaceContext', () => {
  it('provides workspace foundation', () => {
    renderWithProviders(<TestConsumer />);
    const text = screen.getByTestId('foundation').textContent;
    expect(text).toContain('proofEnabled');
  });

  it('throws when useWorkspace used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useWorkspace();
      return null;
    }
    expect(() => render(<SettingsProvider><Bad /></SettingsProvider>)).toThrow('useWorkspace must be used within WorkspaceProvider');
    spy.mockRestore();
  });
});
