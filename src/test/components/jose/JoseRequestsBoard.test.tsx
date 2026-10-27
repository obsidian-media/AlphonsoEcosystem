import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/jose/submitToJose', async () => {
  const store = await import('../../../services/jose/joseRequestStore');
  return {
    runApprovedPlan: vi.fn(async (id: string) => {
      store.claimPlanForRun(id);
      return { ok: true, command: { userReport: { summary: 'All done.' } } };
    }),
    cancelPlan: vi.fn((id: string) => store.cancelJoseRequest(id)),
  };
});

vi.mock('../../../services/joseExecutionEngineService', () => ({
  approveRequestStep: vi.fn(async () => ({ ok: true, summary: 'Marcus did it; the request carried on.' })),
  carryOnRequest: vi.fn(async () => ({ ok: true, command: { userReport: { summary: 'Carried on to the end.' } } })),
  cancelRequest: vi.fn(() => ({ ok: true, summary: 'Cancelled.' })),
  rejectRequestStep: vi.fn(() => ({ ok: true, summary: 'Rejected. The request was cancelled.' })),
  pickAlphonsoProject: vi.fn(async (_r: string, _s: string, name: string) => ({ ok: true, summary: `Working in ${name}.` })),
}));

vi.mock('../../../services/echo/echoPicks', () => ({
  pickForget: vi.fn(async () => ({ ok: true, summary: 'Forgot: The launch is on Friday.' })),
  applyCleanupStep: vi.fn(async () => ({ ok: true, summary: 'Applied 1 changes to memory.' })),
  dismissCleanupStep: vi.fn(async () => ({ ok: true, summary: 'Left memory as it is.' })),
}));

import { JoseRequestsBoard } from '../../../components/jose/JoseRequestsBoard';
import { pickForget } from '../../../services/echo/echoPicks';
import { saveCleanupSet } from '../../../services/echo/cleanup';
import { approveRequestStep, carryOnRequest, rejectRequestStep, pickAlphonsoProject } from '../../../services/joseExecutionEngineService';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { JosePlanEditor } from '../../../components/jose/JosePlanEditor';
import { runApprovedPlan } from '../../../services/jose/submitToJose';
import { createWaitingPlanRequest, getJoseRequest } from '../../../services/jose/joseRequestStore';
import { listUserTemplates } from '../../../services/jose/joseUserTemplates';
import type { PlanStep } from '../../../services/jose/stepGraph';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';

const steps: PlanStep[] = [
  { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find the facts.' },
  { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', effects: ['read'], needs: ['facts'], instruction: 'Judge them.' },
];

const waiting = () => createWaitingPlanRequest({
  text: 'Research electric bikes', source: 'user', kind: 'normal', steps,
  plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' },
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(runApprovedPlan).mockClear();
});

describe('JoseRequestsBoard', () => {
  it('lists requests and shows the selected plan as a map with its actions', () => {
    const request = waiting();
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.getAllByText('Research electric bikes').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('jose-plan-step')).toHaveLength(2);
    expect(screen.getByText('Planned fresh.')).toBeTruthy();
    for (const label of ['Run this plan', 'Edit', 'Cancel', 'Save as template']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  // Agent roles Part C1: a waiting plan that breaks the rules says so before you run it.
  it("shows a waiting plan's problems up front and does not offer Run", () => {
    const bad = createWaitingPlanRequest({
      text: 'Research tea', source: 'user', kind: 'normal',
      steps: [{ stepId: 'nova', agent: 'nova', actionType: 'research_report', effects: ['read'], needs: [] }],
      plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' },
    });
    render(<JoseRequestsBoard selectedRequestId={bad.id} />);
    expect(screen.getByTestId('jose-plan-problems').textContent).toContain("Gives Hector's work to Nova");
    expect(screen.getByRole('button', { name: 'Run this plan' }).hasAttribute('disabled')).toBe(true);
  });

  it('runs a plan once, even on a double click', async () => {
    const request = waiting();
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    const run = screen.getByRole('button', { name: 'Run this plan' });
    fireEvent.click(run);
    fireEvent.click(run);
    await screen.findByText('All done.');
    expect(runApprovedPlan).toHaveBeenCalledTimes(1);
  });

  it('cancels a waiting plan', async () => {
    const request = waiting();
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(getJoseRequest(request.id)?.status).toBe('cancelled'));
    expect(screen.queryByRole('button', { name: 'Run this plan' })).toBeNull();
  });

  it('saves a plan as a template under the name given', () => {
    const request = waiting();
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as template' }));
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Bike research' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(listUserTemplates().map((t) => t.name)).toEqual(['Bike research']);
  });
});

describe('JosePlanEditor', () => {
  it('saves a removed step with a plain reason in the change log', () => {
    const request = waiting();
    const onSaved = vi.fn();
    render(<JosePlanEditor request={request} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: "Remove Nova's step" }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const saved = getJoseRequest(request.id)!;
    expect(saved.steps.map((s) => s.stepId)).toEqual(['facts']);
    expect(saved.changeLog!.map((c) => c.text).join(' ')).toMatch(/Removed Nova's step/);
    expect(onSaved).toHaveBeenCalled();
  });

  it('will not save a plan that breaks the rules, and says why', () => {
    const request = waiting();
    render(<JosePlanEditor request={request} onSaved={vi.fn()} />);
    // Hector now needs Nova, who needs Hector: a cycle.
    fireEvent.click(screen.getByRole('checkbox', { name: 'facts needs value' }));
    expect(screen.getByText(/cycle/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds a step for another agent', () => {
    const request = waiting();
    render(<JosePlanEditor request={request} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('New step agent'), { target: { value: 'maria' } });
    fireEvent.change(screen.getByLabelText('New step task type'), { target: { value: 'audit_quality' } });
    fireEvent.change(screen.getByLabelText('New step instruction'), { target: { value: 'Check the findings.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(getJoseRequest(request.id)!.steps.some((s) => s.agent === 'maria')).toBe(true);
  });

  // Phase 4: a step waiting for approval can be approved here, and the request carries on.
  it('approves a waiting step and carries the request on', async () => {
    const request = createJoseRequest({
      commandId: 'c-wait', source: 'user', text: 'Post the launch', kind: 'normal',
      steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }],
    });
    updateJoseStep(request.id, 'post', { status: 'waiting_approval' });
    setJoseRequestStatus(request.id, 'waiting_approval');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and carry on: Marcus distribution_execution' }));
    await waitFor(() => expect(approveRequestStep).toHaveBeenCalledWith(request.id, 'post'));
    expect(await screen.findByText('Marcus did it; the request carried on.')).toBeTruthy();
  });

  // Agent phase 6: Alphonso's prepared change, and "Which project".
  it("shows Alphonso's prepared change under his waiting step", () => {
    const request = createJoseRequest({
      commandId: 'c-code', source: 'user', text: 'In shop, add a toggle', kind: 'normal',
      steps: [{ stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [] }],
    });
    updateJoseStep(request.id, 'build', { status: 'waiting_approval', codePreview: {
      place: { kind: 'project', name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' }, plan: 'Add a toggle.', title: 't',
      files: [{ path: 'src/App.tsx', content: 'x', status: 'changed', added: 1, removed: 1, firstDiff: ['- a', '+ b'] }], commands: [], dropped: [], model: '', preparedAtMs: 1,
    } } as never);
    setJoseRequestStatus(request.id, 'waiting_approval');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.getByTestId('alphonso-code-preview').textContent).toContain('src/App.tsx');
  });

  it('asks which project with one button per project', async () => {
    const request = createJoseRequest({
      commandId: 'c-pick', source: 'user', text: 'Add a README', kind: 'normal',
      steps: [{ stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [] }],
    });
    updateJoseStep(request.id, 'build', { status: 'setup_needed', error: 'Which project: shop, blog?', projectChoices: ['shop', 'blog'] } as never);
    setJoseRequestStatus(request.id, 'waiting_setup');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.getByText('Which project: shop, blog?')).toBeTruthy();
    fireEvent.click(screen.getByTestId('alphonso-pick-blog'));
    await waitFor(() => expect(pickAlphonsoProject).toHaveBeenCalledWith(request.id, 'build', 'blog'));
    expect(await screen.findByText('Working in blog.')).toBeTruthy();
  });

  // Agent phase 7: Echo's pickers on the board.
  it('asks which decision to forget with one button each, and hides Carry on', async () => {
    const request = createJoseRequest({
      commandId: 'c-forget', source: 'user', text: 'Forget the launch', kind: 'normal',
      steps: [{ stepId: 'echo', agent: 'echo', actionType: 'memory_forget', effects: ['write_own_work'], needs: [] }],
    });
    updateJoseStep(request.id, 'echo', { status: 'setup_needed', error: 'Which one should I forget?', decisionChoices: [{ id: 'd1', text: 'The launch is on Friday.' }, { id: 'd2', text: 'The launch party is at the shop.' }] } as never);
    setJoseRequestStatus(request.id, 'waiting_setup');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.getByText('Which one should I forget?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Carry on' })).toBeNull();
    fireEvent.click(screen.getByTestId('echo-forget-d1'));
    await waitFor(() => expect(pickForget).toHaveBeenCalledWith(request.id, 'echo', 'd1'));
    expect(await screen.findByText('Forgot: The launch is on Friday.')).toBeTruthy();
  });

  it("shows Echo's cleanup proposals under his waiting step", () => {
    const set = saveCleanupSet({ requestId: 'x', proposals: [{ id: 'p0', kind: 'drop', ids: ['d1'], reason: 'It is stale.' }] } as never);
    const request = createJoseRequest({
      commandId: 'c-clean', source: 'schedule', text: 'Tidy memory', kind: 'normal',
      steps: [{ stepId: 'echo', agent: 'echo', actionType: 'memory_cleanup', effects: ['write_own_work'], needs: [] }],
    });
    updateJoseStep(request.id, 'echo', { status: 'setup_needed', error: 'Echo proposes 1 changes to memory: tick the ones to apply.', cleanupSetId: set.id } as never);
    setJoseRequestStatus(request.id, 'waiting_setup');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.getByTestId('echo-cleanup').textContent).toContain('It is stale.');
    expect(screen.queryByRole('button', { name: 'Carry on' })).toBeNull();
  });

  it('shows what a step produced when you pick it in the map (phase 6a)', () => {
    const request = createJoseRequest({ commandId: 'c-out', source: 'user', text: 'Research the launch', kind: 'normal', steps });
    setStepOutput('c-out', 'value', 'nova', { summary: 'Worth doing: strong demand.' });
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.queryByText('Worth doing: strong demand.')).toBeNull();
    fireEvent.click(screen.getAllByTestId('jose-plan-step')[1]);
    expect(screen.getByText('Worth doing: strong demand.')).toBeTruthy();
    fireEvent.click(screen.getAllByTestId('jose-plan-step')[0]);
    expect(screen.getByText('Nothing was saved for this step.')).toBeTruthy();
  });

  it('offers Carry on for a request the app was closed on', async () => {
    const request = createJoseRequest({
      commandId: 'c-cut', source: 'user', text: 'Research the launch', kind: 'normal',
      steps: [{ stepId: 'a', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }],
    });
    setJoseRequestStatus(request.id, 'interrupted');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Carry on' }));
    await waitFor(() => expect(carryOnRequest).toHaveBeenCalledWith(request.id));
    expect(await screen.findByText('Carried on to the end.')).toBeTruthy();
  });

  it('rejects a waiting step', async () => {
    const request = createJoseRequest({
      commandId: 'c-rej', source: 'user', text: 'Post', kind: 'normal',
      steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }],
    });
    updateJoseStep(request.id, 'post', { status: 'waiting_approval' });
    setJoseRequestStatus(request.id, 'waiting_approval');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject: Marcus distribution_execution' }));
    expect(rejectRequestStep).toHaveBeenCalledWith(request.id, 'post');
    expect(await screen.findByText('Rejected. The request was cancelled.')).toBeTruthy();
  });
});

describe('the skill under a step (agent roles Part B)', () => {
  beforeEach(() => localStorage.clear());

  it('shows the skill and the reason for the step you pick', () => {
    const request = createJoseRequest({
      commandId: 'c-skill', source: 'user', text: 'Check the post', kind: 'normal',
      steps: [{ stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: [] }],
    });
    updateJoseStep(request.id, 'check', { skill: 'Claim check', skillReason: 'The post quotes numbers.' });
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getAllByTestId('jose-plan-step')[0]);
    expect(screen.getByTestId('jose-step-skill').textContent).toBe('Skill: Claim check — The post quotes numbers.');
  });

  it('says when the step had no skill', () => {
    const request = createJoseRequest({
      commandId: 'c-noskill', source: 'user', text: 'x', kind: 'normal',
      steps: [{ stepId: 'odd', agent: 'nova', actionType: 'analysis_odd', effects: ['read'], needs: [] }],
    });
    updateJoseStep(request.id, 'odd', { skill: undefined, skillReason: 'No skill for this task.' });
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getAllByTestId('jose-plan-step')[0]);
    expect(screen.getByTestId('jose-step-skill').textContent).toBe('No skill for this task.');
  });
});

// Jose phase 7: a running request can be stopped from the board.
describe('Stop on the board', () => {
  it('a running request shows Stop, which stops it', () => {
    const request = createJoseRequest({ commandId: 'c-stop', source: 'user', text: 'Write three notes', kind: 'normal', steps });
    setJoseRequestStatus(request.id, 'running');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByTestId('jose-stop'));
    expect(screen.getByText('Stopped by you.')).toBeTruthy();
  });

  it('a finished request has no Stop', () => {
    const request = createJoseRequest({ commandId: 'c-done', source: 'user', text: 'Done one', kind: 'normal', steps });
    setJoseRequestStatus(request.id, 'done');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    expect(screen.queryByTestId('jose-stop')).toBeNull();
  });
});

// Jose phase 7: Cancel beside Carry on.
describe('Cancel a cut-off request on the board', () => {
  it('shows Cancel beside Carry on, which cancels it', async () => {
    const { cancelRequest } = await import('../../../services/joseExecutionEngineService');
    const request = createJoseRequest({ commandId: 'c-cut', source: 'user', text: 'Cut off', kind: 'normal', steps });
    setJoseRequestStatus(request.id, 'interrupted');
    render(<JoseRequestsBoard selectedRequestId={request.id} />);
    fireEvent.click(screen.getByTestId('jose-cancel-request'));
    expect(cancelRequest).toHaveBeenCalledWith(request.id);
    expect(screen.getByText('Cancelled.')).toBeTruthy();
  });
});

// Jose phase 7: a queued request shows its place in the queue.
describe('Queued requests on the board', () => {
  it('shows "Queued (1st)." for the first one waiting, and offers Stop', async () => {
    const { takeTurn, resetQueueForTests } = await import('../../../services/jose/joseQueue');
    resetQueueForTests();
    const holder = createJoseRequest({ commandId: 'c-hold', source: 'user', text: 'Holder', kind: 'normal', steps });
    const waitingOne = createJoseRequest({ commandId: 'c-wait', source: 'user', text: 'Waiting one', kind: 'normal', steps });
    setJoseRequestStatus(holder.id, 'running');
    setJoseRequestStatus(waitingOne.id, 'running');
    await takeTurn(holder.id);
    void takeTurn(waitingOne.id);
    render(<JoseRequestsBoard selectedRequestId={waitingOne.id} />);
    expect(screen.getAllByText('Queued (1st).').length).toBeGreaterThan(0);
    expect(screen.getByTestId('jose-stop')).toBeTruthy();
    resetQueueForTests();
  });
});

// Jose phase 7: a project's requests are grouped under the project's name.
describe("A project's requests on the board", () => {
  it('shows them under a heading with the project name', async () => {
    const store = await import('../../../services/jose/joseRequestStore');
    const one = createJoseRequest({ commandId: 'c-g1', source: 'content-factory', text: 'Content factory: script', kind: 'normal', steps });
    const two = createJoseRequest({ commandId: 'c-g2', source: 'content-factory', text: 'Content factory: scenes', kind: 'normal', steps });
    store.setRequestGroup(one.id, { id: 'p1', label: 'Honeybees' });
    store.setRequestGroup(two.id, { id: 'p1', label: 'Honeybees' });
    render(<JoseRequestsBoard selectedRequestId={one.id} />);
    const heading = screen.getByTestId('jose-group-p1');
    expect(heading.textContent).toContain('Honeybees');
  });
});
