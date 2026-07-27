import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null)
}));

import { PipelineResultCard } from '../components/PipelineResultCard';

const RESULT = {
  executedCount: 2,
  pendingApprovalCount: 1,
  failedCount: 0,
  commandId: 'cmd-123',
  executionReceipts: [],
  command: {
    userReport: {
      summary: 'Jose merged the workflow into a concise report.',
      resultUrl: 'https://github.com/example/repo',
      assignmentSummaries: []
    }
  }
};

describe('PipelineResultCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it('copies the command and summary when Copy summary is clicked', async () => {
    render(
      <PipelineResultCard
        result={RESULT}
        commandText="Send a message to the Telegram channel about project status"
      />
    );

    fireEvent.click(screen.getByTestId('jose-copy-summary-button'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Command:\nSend a message to the Telegram channel about project status\n\nSummary:\nJose merged the workflow into a concise report.'
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy summary/i })).toHaveTextContent('Copied');
    });
  });

  it('reruns the last command when Rerun is clicked', () => {
    const onRerunCommand = vi.fn();

    render(
      <PipelineResultCard
        result={RESULT}
        commandText="Send a message to the Telegram channel about project status"
        onRerunCommand={onRerunCommand}
      />
    );

    fireEvent.click(screen.getByTestId('jose-rerun-command-button'));

    expect(onRerunCommand).toHaveBeenCalledTimes(1);
    expect(onRerunCommand).toHaveBeenCalledWith('Send a message to the Telegram channel about project status');
  });
});
