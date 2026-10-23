import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StepPanel } from '../../../components/miya/StepPanel';
import { createProject, emptyBrief, getProject, saveStepVersion, startStep, addStepProgress, failStep } from '../../../services/contentFactory/contentProjectService';

beforeEach(() => localStorage.clear());

function project() {
  return createProject('b', 'P', emptyBrief());
}

describe('StepPanel', () => {
  it('says when a step is out of date and offers to run it again', () => {
    const p = project();
    saveStepVersion(p.id, 'script', { output: {}, summary: 's', joseCommandId: null });
    saveStepVersion(p.id, 'scenes', { output: {}, summary: 'sc', joseCommandId: null });
    saveStepVersion(p.id, 'script', { output: {}, summary: 's2', joseCommandId: null });
    const onRun = vi.fn();
    render(<StepPanel project={getProject(p.id)!} step="scenes" onRun={onRun} onChooseVersion={vi.fn()} />);
    expect(screen.getByText(/Out of date/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /run again/i }));
    expect(onRun).toHaveBeenCalled();
  });

  it('shows each progress message while it runs', () => {
    const p = project();
    startStep(p.id, 'research');
    addStepProgress(p.id, 'research', 'Hector is researching what goes viral…');
    render(<StepPanel project={getProject(p.id)!} step="research" onRun={vi.fn()} onChooseVersion={vi.fn()} />);
    expect(screen.getByText('Hector is researching what goes viral…')).toBeTruthy();
    expect((screen.getByRole('button', { name: /running/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a failure and a Retry button', () => {
    const p = project();
    failStep(p.id, 'research', "nova: The model's answer could not be read.");
    const onRun = vi.fn();
    render(<StepPanel project={getProject(p.id)!} step="research" onRun={onRun} onChooseVersion={vi.fn()} />);
    expect(screen.getByText("nova: The model's answer could not be read.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRun).toHaveBeenCalled();
  });

  it('asks for approval on review steps, and send back needs a reason', () => {
    const p = project();
    saveStepVersion(p.id, 'review', { output: {}, summary: 'r', joseCommandId: null });
    const onApprove = vi.fn();
    const onSendBack = vi.fn();
    render(<StepPanel project={getProject(p.id)!} step="review" onRun={vi.fn()} onChooseVersion={vi.fn()} onApprove={onApprove} onSendBack={onSendBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }));
    const send = screen.getByRole('button', { name: 'Send back with this reason' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Why are you sending it back?'), { target: { value: 'Hook is weak' } });
    fireEvent.click(send);
    expect(onSendBack).toHaveBeenCalledWith('Hook is weak');
  });

  it('lets you pick an earlier version', () => {
    const p = project();
    saveStepVersion(p.id, 'script', { output: {}, summary: 'one', joseCommandId: null });
    saveStepVersion(p.id, 'script', { output: {}, summary: 'two', joseCommandId: null });
    const onChooseVersion = vi.fn();
    render(<StepPanel project={getProject(p.id)!} step="script" onRun={vi.fn()} onChooseVersion={onChooseVersion} />);
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1' } });
    expect(onChooseVersion).toHaveBeenCalledWith(1);
  });
});
