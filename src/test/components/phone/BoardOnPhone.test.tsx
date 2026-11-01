import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardDataProvider, type BoardData } from '../../../services/phone/boardData';
import { JoseRequestsBoard } from '../../../components/jose/JoseRequestsBoard';

const request: any = {
  id: 'r1', commandId: 'c1', source: 'user', text: 'Research and post', kind: 'normal', status: 'waiting_plan_approval', createdAtMs: 1, updatedAtMs: 1,
  steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], status: 'planned' }],
};

function phoneData(over: Partial<BoardData> = {}): BoardData {
  return {
    requests: () => [request], request: () => request, stepOutput: () => null,
    approveStep: vi.fn(async () => ''), rejectStep: vi.fn(async () => ''), stop: vi.fn(async () => ''), carryOn: vi.fn(async () => ''),
    cancel: vi.fn(async () => ''), runPlan: vi.fn(async () => ''), cancelPlan: vi.fn(async () => ''),
    sendBack: vi.fn(async () => ''), editSendText: vi.fn(async () => ''),
    subscribe: () => () => {}, readOnly: true, readOnlyReason: 'Your computer is offline since 14:02.', local: false, ...over,
  };
}

describe('the board on the phone', () => {
  it('offline: says since when, and its buttons are off', () => {
    render(<BoardDataProvider value={phoneData()}><JoseRequestsBoard /></BoardDataProvider>);
    expect(screen.getByTestId('board-read-only').textContent).toBe('Your computer is offline since 14:02.');
    expect((screen.getByRole('button', { name: 'Run this plan' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the computer's own tools are not offered on the phone", () => {
    render(<BoardDataProvider value={phoneData({ readOnly: false, readOnlyReason: undefined })}><JoseRequestsBoard /></BoardDataProvider>);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save as template' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Run this plan' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
