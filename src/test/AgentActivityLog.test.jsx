import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../services/agentActivityService', () => ({
  listAgentActivity: vi.fn(() => [])
}));

import { AgentActivityLog } from '../components/AgentActivityLog.jsx';
import { listAgentActivity } from '../services/agentActivityService';

describe('AgentActivityLog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listAgentActivity.mockClear();
    listAgentActivity.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders without crash', () => {
    const { container } = render(<AgentActivityLog />);
    expect(container).toBeTruthy();
  });

  it('shows "Agent Activity" header', () => {
    render(<AgentActivityLog />);
    expect(screen.getByText(/Agent Activity/i)).toBeTruthy();
  });

  it('shows "0 events" when empty', () => {
    render(<AgentActivityLog />);
    expect(screen.getByText(/0 events/i)).toBeTruthy();
  });

  it('shows "No activity yet" empty state message', () => {
    render(<AgentActivityLog />);
    expect(screen.getByText(/No activity yet/i)).toBeTruthy();
  });

  it('shows entries when listAgentActivity returns items', () => {
    listAgentActivity.mockReturnValue([
      { agent: 'nova', action: 'opportunity_scan', detail: 'Market analysis', ts: Date.now() }
    ]);
    render(<AgentActivityLog />);
    // The action is formatted as "Opportunity Scan"
    expect(screen.getByText(/Opportunity Scan/i)).toBeTruthy();
  });

  it('shows correct agent name in entry', () => {
    listAgentActivity.mockReturnValue([
      { agent: 'nova', action: 'opportunity_scan', detail: 'Market analysis', ts: Date.now() }
    ]);
    render(<AgentActivityLog />);
    expect(screen.getByText('nova')).toBeTruthy();
  });
});
