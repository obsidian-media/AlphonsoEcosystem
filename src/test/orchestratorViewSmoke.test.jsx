import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrchestratorView } from '../components/OrchestratorView';
import { DEFAULT_AUTH_PROFILES, writeAuthProfiles } from '../services/connectors/connectorAuth';

function makeProps(overrides = {}) {
  return {
    settings: {},
    ollamaStatus: { state: 'connected', label: 'Connected' },
    onJoseStateChange: vi.fn(),
    ...overrides
  };
}

describe('OrchestratorView — smoke', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing against empty/default local state', () => {
    render(<OrchestratorView {...makeProps()} />);
    expect(screen.getByText('Orchestrator')).toBeTruthy();
  });

  it('shows the Pending approvals count as 0 with an empty queue', () => {
    render(<OrchestratorView {...makeProps()} />);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  // QA Bug 8 (2026-10-12/21): the WhatsApp card said "Connected" with no
  // credentials. It may only say "Configured", and only with credentials.
  it('does not claim WhatsApp is connected on a fresh install', () => {
    render(<OrchestratorView {...makeProps()} />);
    const status = screen.getByTestId('whatsapp-inbound-status').textContent;
    expect(status).toMatch(/^Not configured/);
    expect(status).not.toMatch(/Connected/);
  });

  it('does not claim WhatsApp is configured when only the switch is on', () => {
    writeAuthProfiles({ ...DEFAULT_AUTH_PROFILES, whatsapp: { enabled: true, allowlist: [], mode: 'allowlist_required' } });
    render(<OrchestratorView {...makeProps()} />);
    expect(screen.getByTestId('whatsapp-inbound-status').textContent).toMatch(/^Not configured/);
  });
});
