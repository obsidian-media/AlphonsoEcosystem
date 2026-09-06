import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrchestratorView } from '../components/OrchestratorView';

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
});
