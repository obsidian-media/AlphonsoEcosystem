import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../components/DeadLetterQueueView', () => ({ DeadLetterQueueView: vi.fn(() => null) }));
vi.mock('../../components/teams/TeamsPage', () => ({
  TeamsPage: vi.fn(({ onOpenJoseBoard }: { onOpenJoseBoard?: unknown }) => <div data-testid="teams-page">{typeof onOpenJoseBoard}</div>),
}));

import { AutomationView } from '../../components/AutomationView';
import { listSchedules, startScheduler, stopScheduler } from '../../services/joseSchedulerService';

// QA 2026-10-22: the Schedules tab uses the real scheduler here. Until then a
// schedule never ran anything and "Run now" did nothing.

function openSchedules() {
  render(<AutomationView />);
  fireEvent.click(screen.getByRole('button', { name: 'Schedules' }));
}

// 2.11.0 QA (owner, 2026-11-01): the Builder's steps had no code behind them and the 16
// "registered operations" wrote made-up text. Automation is Teams (real Jose requests) and Schedules.
describe('AutomationView', () => {
  it('opens on Teams, and offers only Teams, Schedules and Dead Letter', () => {
    render(<AutomationView onOpenJoseBoard={() => {}} />);
    expect(screen.getByTestId('teams-page').textContent).toBe('function');
    expect(screen.getAllByRole('button').filter((b) => ['Teams', 'Schedules', 'Dead Letter', 'Overview', 'Builder'].includes(b.textContent || '')).map((b) => b.textContent))
      .toEqual(['Teams', 'Schedules', 'Dead Letter']);
    expect(screen.queryByText(/Registered Operations/)).toBeNull();
  });
});

describe('AutomationView → Schedules', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => stopScheduler());

  it('creates a command schedule with how often it runs', () => {
    openSchedules();
    fireEvent.change(screen.getByLabelText('Schedule name'), { target: { value: 'Daily note' } });
    fireEvent.change(screen.getByLabelText('How often'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('Command for Jose'), { target: { value: 'Summarise today' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }));
    expect(listSchedules()).toEqual([expect.objectContaining({ name: 'Daily note', presetId: 'daily', commandText: 'Summarise today' })]);
    expect(screen.getByTestId('schedule-card').textContent).toMatch(/Next run:/);
  });

  it('a built-in job needs no command and explains what it does', () => {
    openSchedules();
    fireEvent.change(screen.getByLabelText('What to run'), { target: { value: 'hector_morning_briefing' } });
    expect(screen.queryByLabelText('Command for Jose')).toBeNull();
    expect(screen.getByText(/Hector collects the top headlines/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Schedule name'), { target: { value: 'Morning news' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }));
    expect(listSchedules()[0]).toMatchObject({ presetId: 'hector_morning_briefing', commandText: '' });
  });

  it('Run now runs the command and shows the result', async () => {
    const runCommand = vi.fn(async () => ({ ok: true, summary: 'Note written.', details: 'alphonso: Backups matter because disks fail.', pendingApprovalCount: 0 }));
    startScheduler({ runCommand });
    openSchedules();
    fireEvent.change(screen.getByLabelText('Schedule name'), { target: { value: 'Daily note' } });
    fireEvent.change(screen.getByLabelText('Command for Jose'), { target: { value: 'Summarise today' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run Daily note now' }));
    expect(await screen.findByText(/Finished\. Note written\./)).toBeTruthy();
    // The work itself is kept, not only Jose's one-line summary.
    expect(screen.getByTestId('schedule-result').textContent).toBe('alphonso: Backups matter because disks fail.');
    expect(runCommand).toHaveBeenCalledWith('Summarise today', expect.anything());
  });
});
