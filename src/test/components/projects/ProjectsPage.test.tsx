// Agent roles Part C1: Work → Projects shows a project's real request.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../services/joseExecutionEngineService', () => ({
  approveRequestStep: vi.fn(async () => ({ ok: true, summary: 'Approved; carrying on.' })),
  rejectRequestStep: vi.fn(() => ({ ok: true, summary: 'Rejected.' })),
}));
vi.mock('../../../services/jose/submitToJose', () => ({ submitToJose: vi.fn() }));

import { ProjectsPage } from '../../../components/projects/ProjectsPage';
import { approveRequestStep } from '../../../services/joseExecutionEngineService';
import { submitToJose } from '../../../services/jose/submitToJose';
import { createJoseRequest, setJoseRequestStatus, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { saveProject } from '../../../services/projects/projectStore';

const steps = [
  { stepId: 'plan', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find what is needed.' },
  { stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['change_project'], needs: ['plan'], instruction: 'Build it.' },
];
const intake = { name: 'Recipe box', description: 'A small app to save recipes', stack: '', deadline: '', type: 'web_app', features: '', constraints: '', risks: '', priority: 'medium' as const };

function seeded(status: 'waiting_approval' | 'done') {
  const request = createJoseRequest({ commandId: `c-${status}`, source: 'user', text: 'Build Recipe box', kind: 'project', steps } as never);
  updateJoseStep(request.id, 'plan', { status: 'done' } as never);
  updateJoseStep(request.id, 'build', { status: status === 'done' ? 'done' : 'waiting_approval' } as never);
  setJoseRequestStatus(request.id, status);
  localStorage.setItem('alphonso_projects_v2', JSON.stringify([{ id: 'p1', name: 'Recipe box', intake, runs: [{ requestId: request.id, atMs: 1 }], createdAtMs: 1 }]));
  return request.id;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(approveRequestStep).mockClear();
  vi.mocked(submitToJose).mockReset();
});

describe('ProjectsPage', () => {
  it('has no built-in example project', () => {
    render(<ProjectsPage />);
    expect(document.body.textContent).not.toMatch(/TapCash/i);
  });

  it('Start asks Jose with the project', async () => {
    vi.mocked(submitToJose).mockResolvedValueOnce({ ok: true, requestId: 'jose-request-x' } as never);
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Recipe box' } });
    fireEvent.change(screen.getByLabelText('What it should do'), { target: { value: 'A small app to save recipes' } });
    fireEvent.click(screen.getByTestId('projects-start'));
    await waitFor(() => expect(submitToJose).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'build_app', source: 'user' })));
  });

  it('shows the request while it is still running', async () => {
    const live = createJoseRequest({ commandId: 'c-live', source: 'user', text: 'Build Recipe box', kind: 'project', steps } as never);
    setJoseRequestStatus(live.id, 'running');
    vi.mocked(submitToJose).mockImplementationOnce(((input: any) => {
      input.onProgress?.({ stage: 'request_started', requestId: live.id });
      return new Promise(() => undefined);
    }) as never);
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Recipe box' } });
    fireEvent.change(screen.getByLabelText('What it should do'), { target: { value: 'A small app to save recipes' } });
    fireEvent.click(screen.getByTestId('projects-start'));
    fireEvent.click(await screen.findByRole('button', { name: /Steps/ }));
    expect(screen.getByTestId('projects-steps').textContent).toContain('Find what is needed.');
  });

  it("shows the run's steps, approves a waiting one, and keeps Results locked meanwhile", async () => {
    const requestId = seeded('waiting_approval');
    const open = vi.fn();
    render(<ProjectsPage onOpenJoseBoard={open} />);
    fireEvent.click(screen.getByRole('button', { name: /Steps/ }));
    expect(screen.getByTestId('projects-steps').textContent).toContain('Build it.');
    expect(screen.getByRole('button', { name: /Results/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Approval/ }));
    fireEvent.click(screen.getByRole('button', { name: /Approve and carry on/ }));
    await waitFor(() => expect(approveRequestStep).toHaveBeenCalledWith(requestId, 'build'));
    fireEvent.click(screen.getByRole('button', { name: 'Open on the board' }));
    expect(open).toHaveBeenCalledWith(requestId);
  });

  it('shows the summary once nothing waits', () => {
    seeded('done');
    render(<ProjectsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Results/ }));
    expect(screen.getByTestId('projects-results').textContent).toMatch(/Hector|Alphonso/);
  });

  it('lists saved projects', () => {
    saveProject(intake);
    render(<ProjectsPage />);
    expect(screen.getByTestId('projects-list').textContent).toContain('Recipe box');
  });
});
