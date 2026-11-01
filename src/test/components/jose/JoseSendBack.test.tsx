import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BoardDataProvider, type BoardData } from '../../../services/phone/boardData';
import { JoseRequestsBoard } from '../../../components/jose/JoseRequestsBoard';

const preview = { connector: 'slack', kind: 'message', label: 'Slack #news', target: '#news', text: 'Old text', sourceStepId: 'alphonso', preparedAtMs: 1 };
function request(sendPreview: any = preview): any {
  return {
    id: 'r1', commandId: 'c1', source: 'user', text: 'Write and post', kind: 'normal', status: 'waiting_approval', createdAtMs: 1, updatedAtMs: 1,
    steps: [
      { stepId: 'alphonso', agent: 'alphonso', actionType: 'assistant_write', effects: ['write_own_work'], needs: [], status: 'done' },
      { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['alphonso'], status: 'waiting_approval', ...(sendPreview ? { sendPreview } : {}) },
    ],
  };
}

function boardData(r: any, over: Partial<BoardData> = {}): BoardData {
  return {
    requests: () => [r], request: () => r, stepOutput: () => null,
    approveStep: vi.fn(async () => ''), rejectStep: vi.fn(async () => ''), stop: vi.fn(async () => ''), carryOn: vi.fn(async () => ''),
    cancel: vi.fn(async () => ''), runPlan: vi.fn(async () => ''), cancelPlan: vi.fn(async () => ''),
    sendBack: vi.fn(async () => 'Sent back to Alphonso.'), editSendText: vi.fn(async () => 'Saved.'),
    subscribe: () => () => {}, readOnly: false, local: false, ...over,
  };
}

describe('Send back and Edit text on the board', () => {
  it('Send back asks for a reason and sends it', async () => {
    const data = boardData(request());
    render(<BoardDataProvider value={data}><JoseRequestsBoard /></BoardDataProvider>);
    fireEvent.click(screen.getByTestId('jose-send-back-marcus'));
    const send = screen.getByRole('button', { name: 'Send it back' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('What to change'), { target: { value: 'Shorter please' } });
    fireEvent.click(send);
    await waitFor(() => expect(data.sendBack).toHaveBeenCalledWith('r1', 'marcus', 'Shorter please'));
    expect(await screen.findByText('Sent back to Alphonso.')).toBeTruthy();
  });

  it('Edit text starts from the text Marcus would send and sends the edit with it', async () => {
    const data = boardData(request());
    render(<BoardDataProvider value={data}><JoseRequestsBoard /></BoardDataProvider>);
    fireEvent.click(screen.getByTestId('jose-edit-send-marcus'));
    const box = screen.getByLabelText('Text Marcus sends') as HTMLTextAreaElement;
    expect(box.value).toBe('Old text');
    fireEvent.change(box, { target: { value: 'New text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    await waitFor(() => expect(data.editSendText).toHaveBeenCalledWith('r1', 'marcus', 'New text', 'Old text'));
  });

  it('a step with no text from an agent offers neither', () => {
    render(<BoardDataProvider value={boardData(request(null))}><JoseRequestsBoard /></BoardDataProvider>);
    expect(screen.queryByTestId('jose-send-back-marcus')).toBeNull();
    expect(screen.queryByTestId('jose-edit-send-marcus')).toBeNull();
  });

  it('read-only: both are off', () => {
    render(<BoardDataProvider value={boardData(request(), { readOnly: true, readOnlyReason: 'Offline.' })}><JoseRequestsBoard /></BoardDataProvider>);
    expect((screen.getByTestId('jose-send-back-marcus') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('jose-edit-send-marcus') as HTMLButtonElement).disabled).toBe(true);
  });
});
