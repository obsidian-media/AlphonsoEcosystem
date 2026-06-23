import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
});
