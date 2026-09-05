import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/agentBusService', () => ({
  listApprovalQueue: vi.fn(() => []),
  listAgentPackets: vi.fn(() => []),
}));
vi.mock('../../services/agentActivityService', () => ({
  listAgentActivity: vi.fn(() => []),
}));
vi.mock('../../services/attentionAggregatorService', () => ({
  getAttentionItems: vi.fn(),
}));

import { getAttentionItems } from '../../services/attentionAggregatorService';
import { MissionControlHome } from '../../components/MissionControlHome';

const baseProps = {
  settings: {},
  ollamaStatus: { state: 'connected' },
  operatorMode: false,
  coachMode: false,
  coachIntervention: null,
  onNavigate: vi.fn(),
};

describe('MissionControlHome — attention aggregator wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAttentionItems as any).mockResolvedValue([]);
  });

  it('renders a real approval-chat attention item as its own next-action row, not a summary count', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'approval-chat-pkt-1', source: 'approval-chat', severity: 'high', title: 'Publish draft to Slack', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Publish draft to Slack')).toBeTruthy());
    expect(screen.queryByText(/agent handoff.*need a decision/)).toBeNull();
  });

  it('renders a real approval-project attention item and navigates to project_execution on click', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'approval-project-approval-2', source: 'approval-project', severity: 'medium', title: 'Deploy v2.7.1', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    const row = await screen.findByText('Deploy v2.7.1');
    row.closest('button')!.click();
    expect(baseProps.onNavigate).toHaveBeenCalledWith('project_execution');
  });

  it('renders a real connector attention item and navigates to connectors on click', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'connector-github', source: 'connector', severity: 'medium', title: 'GitHub', timestamp: 1000, actionable: false },
    ]);
    render(<MissionControlHome {...baseProps} />);
    const row = await screen.findByText('GitHub');
    row.closest('button')!.click();
    expect(baseProps.onNavigate).toHaveBeenCalledWith('connectors');
  });

  it('still falls back to the existing filler actions when the aggregator has nothing', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Continue your mission')).toBeTruthy());
    expect(screen.getByText('Talk to Alphonso')).toBeTruthy();
  });

  it('still shows the coach hard-intervention row ahead of filler actions when both exist', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} coachIntervention={{ level: 'hard', message: 'Pause recommended' }} />);
    await waitFor(() => expect(screen.getByText('Coach intervention')).toBeTruthy());
  });

  it('caps the combined list at 4 rows total', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'critical', title: 'Item A', timestamp: 5, actionable: true },
      { id: 'b', source: 'approval-chat', severity: 'high', title: 'Item B', timestamp: 4, actionable: true },
      { id: 'c', source: 'approval-project', severity: 'medium', title: 'Item C', timestamp: 3, actionable: true },
      { id: 'd', source: 'connector', severity: 'medium', title: 'Item D', timestamp: 2, actionable: false },
      { id: 'e', source: 'connector', severity: 'low', title: 'Item E', timestamp: 1, actionable: false },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Item A')).toBeTruthy());
    expect(screen.queryByText('Item E')).toBeNull();
  });
});
