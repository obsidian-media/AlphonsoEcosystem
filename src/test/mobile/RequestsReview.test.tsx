import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BoardDataProvider, type BoardData } from '../../services/phone/boardData';
import { RequestsScreen } from '../../mobile/screens/Requests';
import { setLinkOpener } from '../../services/browserAutomationService';

const research = {
  answer: 'Two kiosks sell most in mornings.', rounds: 1, providers: [], disagreements: [], notFound: [],
  subQuestions: [{ question: 'When?', status: 'answered', findings: [{ text: 'Mornings sell most.', sources: [1, 2], support: 'several' }] }],
  sources: [
    { n: 1, title: 'Coffee report', url: 'https://example.com/report', kind: 'general', label: 'read', excerpt: '' },
    { n: 2, title: 'Login page', url: 'http://192.168.1.5/login', kind: 'general', label: 'read', excerpt: '' },
  ],
};
const preview = { connector: 'slack', kind: 'message', label: 'Slack #news', target: '#news', text: 'Mornings sell most.', sourceStepId: 'hector', preparedAtMs: 1 };

function request(steps: any[]): any {
  return { id: 'r1', commandId: 'c1', source: 'user', text: 'Research and post', kind: 'normal', status: 'waiting_approval', createdAtMs: 1, updatedAtMs: 1, steps };
}
const hector = { stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], status: 'done' };
const marcus = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects: ['publish_or_send'], needs: ['hector'], status: 'waiting_approval', sendPreview: preview };

function phoneData(r: any, over: Partial<BoardData> = {}): BoardData {
  return {
    requests: () => [r], request: () => r,
    stepOutput: (_c, stepId) => (stepId === 'hector' ? ({ stepId, summary: research.answer, schema: research } as any) : null),
    approveStep: vi.fn(async () => 'Approved.'), rejectStep: vi.fn(async () => ''), stop: vi.fn(async () => ''), carryOn: vi.fn(async () => ''),
    cancel: vi.fn(async () => ''), runPlan: vi.fn(async () => ''), cancelPlan: vi.fn(async () => ''),
    sendBack: vi.fn(async () => ''), editSendText: vi.fn(async () => 'Saved.'),
    subscribe: () => () => {}, readOnly: false, local: false, ...over,
  };
}

afterEach(() => setLinkOpener(null));

describe("checking the work on the phone's Requests", () => {
  it('a research step shows its numbered sources and a disguised one warns first', async () => {
    const opened: string[] = [];
    setLinkOpener(async (url) => { opened.push(url); });
    render(<BoardDataProvider value={phoneData(request([hector, marcus]))}><RequestsScreen /></BoardDataProvider>);
    fireEvent.click(screen.getAllByTestId('jose-plan-step')[0]);
    expect(await screen.findByText('Two kiosks sell most in mornings.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Coffee report' }));
    await waitFor(() => expect(opened).toEqual(['https://example.com/report']));
    fireEvent.click(screen.getByRole('button', { name: 'Login page' }));
    expect(await screen.findByText(/This link looks disguised/)).toBeTruthy();
    expect(opened).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open anyway' }));
    await waitFor(() => expect(opened).toEqual(['https://example.com/report', 'http://192.168.1.5/login']));
  });

  it("a waiting send shows exactly what goes where", () => {
    render(<BoardDataProvider value={phoneData(request([hector, marcus]))}><RequestsScreen /></BoardDataProvider>);
    expect(screen.getByTestId('jose-send-preview-marcus').textContent).toContain('Slack #news');
    expect(screen.getByTestId('jose-send-preview-marcus').textContent).toContain('Mornings sell most.');
  });

  it("a send's text can be edited and the edit is sent with the text it was based on", async () => {
    const data = phoneData(request([hector, marcus]));
    render(<BoardDataProvider value={data}><RequestsScreen /></BoardDataProvider>);
    fireEvent.click(screen.getByTestId('jose-edit-send-marcus'));
    fireEvent.change(screen.getByLabelText('Text Marcus sends'), { target: { value: 'Mornings sell best.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    await waitFor(() => expect(data.editSendText).toHaveBeenCalledWith('r1', 'marcus', 'Mornings sell best.', 'Mornings sell most.'));
  });

  it("Alphonso's code change is not approvable on the phone", () => {
    const code = { stepId: 'alphonso', agent: 'alphonso', actionType: 'code_change', effects: ['change_project'], needs: [], status: 'waiting_approval', codePreview: { folder: 'shop', files: [], commands: [] } };
    render(<BoardDataProvider value={phoneData(request([code]))}><RequestsScreen /></BoardDataProvider>);
    expect(screen.queryByRole('button', { name: /Approve and carry on: Alphonso/ })).toBeNull();
    expect(screen.getByTestId('jose-code-on-computer-alphonso').textContent).toBe("Alphonso's change to your code is checked on your computer: open it there to approve.");
    expect(screen.getByRole('button', { name: /Reject: Alphonso/ })).toBeTruthy();
  });
});
