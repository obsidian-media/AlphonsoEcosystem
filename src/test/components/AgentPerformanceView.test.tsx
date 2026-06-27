import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../services/orchestrationQueueService', () => ({
  getDeadLetterCount: vi.fn().mockReturnValue(2),
  getOldestDeadLetterTimestamp: vi.fn().mockReturnValue(1700000000000),
  retryDeadLetter: vi.fn().mockReturnValue(2),
}));

import { AgentPerformanceView } from '../../components/AgentPerformanceView';

const mockReceipts = [
  { agent: 'Alphonso', status: 'success', durationMs: 150 },
  { agent: 'Alphonso', status: 'success', durationMs: 250 },
  { agent: 'Jose', status: 'error', durationMs: 100 },
  { agent: 'Jose', status: 'success', durationMs: 200 },
  { agent: 'Hector', status: 'completed', durationMs: 300 },
];

const mockReceiptsNoDuration = [
  { agent: 'Alphonso', status: 'success' },
  { agent: 'Alphonso', status: 'error' },
];

describe('AgentPerformanceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with mock receipts', () => {
    render(<AgentPerformanceView receipts={mockReceipts} />);
    expect(screen.getByText('Agent Performance')).toBeTruthy();
    expect(screen.getByText('Alphonso')).toBeTruthy();
    expect(screen.getByText('Jose')).toBeTruthy();
    expect(screen.getByText('Hector')).toBeTruthy();
  });

  it('shows success count', () => {
    render(<AgentPerformanceView receipts={mockReceipts} />);
    const successElements = screen.getAllByText(/ok/);
    expect(successElements.length).toBeGreaterThan(0);
  });

  it('shows error count', () => {
    render(<AgentPerformanceView receipts={mockReceipts} />);
    const errorElements = screen.getAllByText(/err/);
    expect(errorElements.length).toBeGreaterThan(0);
  });

  it('shows latency display', () => {
    render(<AgentPerformanceView receipts={mockReceipts} />);
    expect(screen.getByText('200ms avg')).toBeTruthy();
  });

  it('handles empty state', () => {
    render(<AgentPerformanceView receipts={[]} />);
    expect(screen.getByText('No performance data yet.')).toBeTruthy();
  });

  it('handles missing duration gracefully', () => {
    render(<AgentPerformanceView receipts={mockReceiptsNoDuration} />);
    expect(screen.getByText('Alphonso')).toBeTruthy();
  });
});