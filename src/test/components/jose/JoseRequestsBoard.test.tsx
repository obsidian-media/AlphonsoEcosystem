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

import { JoseRequestsBoard } from '../../../components/jose/JoseRequestsBoard';
import { JosePlanEditor } from '../../../components/jose/JosePlanEditor';
import { runApprovedPlan } from '../../../services/jose/submitToJose';
import { createWaitingPlanRequest, getJoseRequest } from '../../../services/jose/joseRequestStore';
import { listUserTemplates } from '../../../services/jose/joseUserTemplates';
import type { PlanStep } from '../../../services/jose/stepGraph';

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
});
