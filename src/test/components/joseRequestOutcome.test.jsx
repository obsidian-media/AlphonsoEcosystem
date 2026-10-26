// Agent phase 5: a reply that said "waiting for your approval" shows what happened once you
// approve on the board or on Telegram; Chat used to keep saying "waiting".
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../services/jose/joseRequestStore';
import { setStepOutput } from '../../services/jose/joseStepOutputs';
import { JoseRequestOutcome } from '../../components/jose/JoseRequestOutcome';

function request(status) {
  createJoseRequest({ commandId: 'o1', source: 'user', text: 'post it to Slack #news', kind: 'normal', steps: [
    { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] },
  ] });
  setJoseRequestStatus('jose-request-o1', status);
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('JoseRequestOutcome', () => {
  it('shows the closing summary once a waiting request ends elsewhere', async () => {
    request('waiting_approval');
    render(<JoseRequestOutcome requestId="jose-request-o1" />);
    expect(screen.queryByTestId('chat-request-outcome')).toBeNull();
    setStepOutput('o1', 'marcus', 'marcus', { summary: 'Sent to Slack #news.' });
    updateJoseStep('jose-request-o1', 'marcus', { status: 'done' });
    setJoseRequestStatus('jose-request-o1', 'done');
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('chat-request-outcome').textContent).toBe('Now: Sent to Slack #news.');
  });

  it('shows nothing for a request that was already finished', async () => {
    request('done');
    render(<JoseRequestOutcome requestId="jose-request-o1" />);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByTestId('chat-request-outcome')).toBeNull();
  });
});
