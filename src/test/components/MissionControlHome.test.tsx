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
vi.mock('../../components/AgentStatusStrip', () => ({
  AgentStatusStrip: ({ onAgentsChange }: { onAgentsChange?: (agents: { name: string; status: string }[]) => void }) => {
    React.useEffect(() => {
      onAgentsChange?.([{ name: 'jose', status: 'running' }, { name: 'hector', status: 'running' }]);
    }, [onAgentsChange]);
    return <div data-testid="mock-agent-strip" />;
  },
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

describe('MissionControlHome — hero (portrait strip + dynamic greeting)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAttentionItems as any).mockResolvedValue([]);
  });

  it('renders the agent portrait strip instead of the static banner image', () => {
    render(<MissionControlHome {...baseProps} />);
    expect(screen.getByTestId('mock-agent-strip')).toBeTruthy();
    expect(screen.queryByAltText('Alphonso')).toBeNull(); // the old static banner img had alt="Alphonso"
  });

  it('renders a time-of-day greeting instead of the hardcoded "Executor online." headline', () => {
    render(<MissionControlHome {...baseProps} />);
    expect(screen.queryByText('Executor online.')).toBeNull();
    expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();
  });
});

describe('MissionControlHome — 2-tile stats row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only Approvals and Active agents tiles — no Local AI or Memory or Coach tiles', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Approvals')).toBeTruthy());
    expect(screen.getByText('Active agents')).toBeTruthy();
    expect(screen.queryByText('Local AI')).toBeNull();
    expect(screen.queryByText('Memory')).toBeNull();
    expect(screen.queryByText('Coach')).toBeNull();
  });

  it('shows the oldest-waiting duration under Approvals when actionable items exist', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'high', title: 'Item A', timestamp: Date.now() - 65 * 60_000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    expect(await screen.findByText(/oldest waiting/i)).toBeTruthy();
  });

  it('shows "queue clear" under Approvals when there are no actionable items', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('queue clear')).toBeTruthy());
  });

  it('names the active agents under the Active agents tile', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    // the mocked AgentStatusStrip (Task 3) always reports jose + hector active
    expect(await screen.findByText('Jose, Hector')).toBeTruthy();
  });
});

describe('MissionControlHome — Zone-wrapped empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty-state headline when there is truly nothing to act on', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} />);
    expect(await screen.findByText('Nothing needs you right now')).toBeTruthy();
    // filler rows still present underneath, per this plan's documented resolution
    expect(screen.getByText('Continue your mission')).toBeTruthy();
    expect(screen.getByText('Talk to Alphonso')).toBeTruthy();
  });

  it('does NOT show the empty-state headline when a real attention item exists', async () => {
    (getAttentionItems as any).mockResolvedValue([
      { id: 'a', source: 'approval-chat', severity: 'high', title: 'Item A', timestamp: 1000, actionable: true },
    ]);
    render(<MissionControlHome {...baseProps} />);
    await waitFor(() => expect(screen.getByText('Item A')).toBeTruthy());
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
  });

  it('does NOT show the empty-state headline when a hard coach intervention exists, even with an empty aggregator', async () => {
    (getAttentionItems as any).mockResolvedValue([]);
    render(<MissionControlHome {...baseProps} coachIntervention={{ level: 'hard', message: 'Pause recommended' }} />);
    await waitFor(() => expect(screen.getByText('Coach intervention')).toBeTruthy());
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
  });
});
