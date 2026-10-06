import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/memoryGraphRetentionService', () => ({
  GRAPH_RETENTION: {
    nodeWindowDays: { receipt: 90, research_report: 180 },
    inferredEdgeDays: 30
  },
  isAutoCleanupEnabled: vi.fn(() => false),
  setAutoCleanupEnabled: vi.fn(() => true),
  previewMemoryGraphCleanup: vi.fn(),
  runMemoryGraphCleanup: vi.fn()
}));

import {
  previewMemoryGraphCleanup,
  runMemoryGraphCleanup,
  setAutoCleanupEnabled
} from '../services/memoryGraphRetentionService';
import { MemoryGraphCleanupPanel } from '../components/MemoryGraphCleanupPanel';

const report = (over = {}) => ({
  dryRun: true,
  aborted: false,
  abortReason: null,
  totalNodes: 20,
  totalEdges: 30,
  nodesRemoved: 4,
  edgesRemoved: 6,
  protectedNodes: 2,
  withinWindowNodes: 14,
  removedByType: { receipt: 4 },
  ...over
});

beforeEach(() => vi.clearAllMocks());

describe('MemoryGraphCleanupPanel', () => {
  it('keeps "Clean up now" disabled until a preview has run', async () => {
    vi.mocked(previewMemoryGraphCleanup).mockResolvedValue(report());
    render(<MemoryGraphCleanupPanel />);
    const clean = screen.getByRole('button', { name: /clean up now/i });
    expect(clean).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /preview cleanup/i }));
    await waitFor(() => expect(screen.getByText(/would remove/i)).toBeInTheDocument());
    expect(clean).not.toBeDisabled();
  });

  it('shows the guard message and keeps cleanup disabled for an aborted preview', async () => {
    vi.mocked(previewMemoryGraphCleanup).mockResolvedValue(
      report({ aborted: true, abortReason: 'would remove 9 of 10 nodes (> 50% guard)' })
    );
    render(<MemoryGraphCleanupPanel />);
    fireEvent.click(screen.getByRole('button', { name: /preview cleanup/i }));
    await waitFor(() => expect(screen.getByText(/would be refused/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /clean up now/i })).toBeDisabled();
  });

  it('runs a real cleanup after a preview and then re-locks the button', async () => {
    vi.mocked(previewMemoryGraphCleanup).mockResolvedValue(report());
    vi.mocked(runMemoryGraphCleanup).mockResolvedValue(report({ dryRun: false }));
    render(<MemoryGraphCleanupPanel />);
    fireEvent.click(screen.getByRole('button', { name: /preview cleanup/i }));
    await waitFor(() => expect(screen.getByText(/would remove/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /clean up now/i }));
    await waitFor(() => expect(runMemoryGraphCleanup).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/^Removed/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /clean up now/i })).toBeDisabled();
  });

  it('explains when automatic cleanup cannot be enabled yet', () => {
    vi.mocked(setAutoCleanupEnabled).mockReturnValue(false);
    render(<MemoryGraphCleanupPanel />);
    fireEvent.click(screen.getByLabelText(/automatic daily cleanup/i));
    expect(screen.getByRole('alert')).toHaveTextContent(/preview once/i);
  });
});
