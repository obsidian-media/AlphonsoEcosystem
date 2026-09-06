import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { VerificationProvider, useVerification } from '../contexts/VerificationContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { OllamaProvider } from '../contexts/OllamaContext';

vi.mock('../lib/appStorage', () => ({
  getStorage: vi.fn((key, fallback) => fallback),
  setStorage: vi.fn()
}));

vi.mock('../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => 'C:/default')
}));

vi.mock('../hooks/useOllamaHealth', () => ({
  useOllamaHealth: vi.fn(() => vi.fn())
}));

vi.mock('../services/trustModel', () => ({
  TRUST_STATES: { TEMPORARY: 'temporary', VERIFIED: 'verified', UNVERIFIED: 'unverified', FAILED: 'failed' }
}));

vi.mock('../lib/ollama', () => ({
  OLLAMA_TROUBLESHOOTING_COMMAND: 'ollama list'
}));

vi.mock('../constants/appConstants', () => ({
  COPY_RESET_MS: 2000,
  AUDIT_LOG_FETCH_LIMIT: 50,
  VERIFICATION_LOG_CAP: 100
}));

vi.mock('../services/verificationService', () => ({
  appendVerificationLog: vi.fn((log) => ({ id: 'log_1', ...log })),
  readDurableAuditLog: vi.fn(async () => []),
  verifyCommandExecution: vi.fn(async () => ({ trust: 'verified' })),
  verifyDurableAuditChain: vi.fn(async () => ({ payload: { valid: true } })),
  verifyOllamaRuntimeProof: vi.fn(async () => ({ trust: 'verified' })),
  verifyPathProof: vi.fn(async () => ({ trust: 'verified' })),
  verifyProcessProof: vi.fn(async () => ({ trust: 'verified' }))
}));

function TestConsumer() {
  const { verificationLogs } = useVerification();
  return (
    <div>
      <span data-testid="log-count">{verificationLogs.length}</span>
    </div>
  );
}

function renderWithAllProviders(ui) {
  return render(
    <SettingsProvider>
      <OllamaProvider>
        <VerificationProvider
          requestApproval={vi.fn(async () => true)}
          setApprovalRequiredNotice={vi.fn()}
          verificationLogs={[]}
          setVerificationLogs={vi.fn()}
          durableAuditLogs={[]}
          setDurableAuditLogs={vi.fn()}
          auditChainProof={null}
          setAuditChainProof={vi.fn()}
        >
          {ui}
        </VerificationProvider>
      </OllamaProvider>
    </SettingsProvider>
  );
}

describe('VerificationContext', () => {
  it('provides verification logs', () => {
    renderWithAllProviders(<TestConsumer />);
    expect(screen.getByTestId('log-count').textContent).toBe('0');
  });

  it('throws when useVerification used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useVerification();
      return null;
    }
    expect(() => render(<SettingsProvider><OllamaProvider><Bad /></OllamaProvider></SettingsProvider>)).toThrow('useVerification must be used within VerificationProvider');
    spy.mockRestore();
  });
});
