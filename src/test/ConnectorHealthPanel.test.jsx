import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({})
}));

vi.mock('../services/connectorRegistryService', () => ({
  listConnectors: vi.fn().mockReturnValue([
    { id: 'telegram', name: 'Telegram Bridge', status: 'not_configured', requiredEnv: ['TELEGRAM_BOT_TOKEN'], envPresence: {} },
    { id: 'github', name: 'GitHub Connector', status: 'configured', requiredEnv: ['GITHUB_TOKEN'], envPresence: { GITHUB_TOKEN: true }, lastTestStatus: 'verified' },
  ]),
  listConnectorAuthProfiles: vi.fn().mockReturnValue([]),
  verifyConnectorEnvironment: vi.fn().mockReturnValue({ present: [], missing: [] }),
}));

vi.mock('../services/connectorHealthCheckService', () => ({
  checkConnectorHealth: vi.fn().mockResolvedValue({ ok: true, latencyMs: 42 }),
}));

vi.mock('../components/ConnectorSetupPanel', () => ({
  ConnectorSetupPanel: () => <div data-testid="connector-setup-panel" />,
}));

import { ConnectorHealthPanel } from '../components/ConnectorHealthPanel.tsx';

describe('ConnectorHealthPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    render(<ConnectorHealthPanel zeroCostMode={false} />);
  });

  it('shows health and setup tabs', () => {
    render(<ConnectorHealthPanel zeroCostMode={false} />);
    expect(screen.getByText(/Health Monitor/i)).toBeTruthy();
    expect(screen.getByText(/Setup/i)).toBeTruthy();
  });

  it('renders in zero-cost mode without error', () => {
    render(<ConnectorHealthPanel zeroCostMode={true} />);
    expect(screen.getByText(/Health Monitor/i)).toBeTruthy();
  });

  it('Validate degrades gracefully instead of leaking a raw TypeError when invoke resolves null', async () => {
    // Regression: outside a real Tauri webview, window.__TAURI_INTERNALS__.invoke
    // resolves Promise.resolve(null) for every command (see index.html). Before
    // the fix, validateConnectorCredentials() did `presence[k]` on that null and
    // the raw "Cannot read properties of null (reading 'TELEGRAM_BOT_TOKEN')"
    // TypeError text was shown directly in the UI (QA report N-2).
    const { invoke } = await import('@tauri-apps/api/core');
    invoke.mockResolvedValue(null);

    render(<ConnectorHealthPanel zeroCostMode={false} />);
    fireEvent.click(screen.getByText(/Health Monitor/i));
    const validateButtons = screen.getAllByTitle('Validate credentials via Tauri env check');
    fireEvent.click(validateButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Missing: TELEGRAM_BOT_TOKEN/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/TypeError/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cannot read propert/i)).not.toBeInTheDocument();
  });
});
