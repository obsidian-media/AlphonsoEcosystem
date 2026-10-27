// Agent roles Part C1: the Teams page.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../../services/jose/submitToJose', () => ({
  submitStepsToJose: vi.fn(async () => ({ ok: true, requestId: 'jose-request-team' })),
}));

import { TeamsPage } from '../../../components/teams/TeamsPage';
import { submitStepsToJose } from '../../../services/jose/submitToJose';
import { listUserTemplates } from '../../../services/jose/joseUserTemplates';
import { saveTeam } from '../../../services/jose/teams';

beforeEach(() => {
  localStorage.clear();
  vi.mocked(submitStepsToJose).mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('TeamsPage', () => {
  it('builds a two-agent team and lists it', async () => {
    render(<TeamsPage />);
    fireEvent.click(screen.getByTestId('teams-new'));
    const builder = screen.getByTestId('team-builder');
    fireEvent.change(within(builder).getByLabelText('Team name'), { target: { value: 'Launch' } });
    fireEvent.change(within(builder).getByLabelText('The job'), { target: { value: 'Research and write a launch note' } });
    fireEvent.change(within(builder).getByLabelText('Add an agent'), { target: { value: 'hector' } });
    fireEvent.change(within(builder).getByLabelText('Add an agent'), { target: { value: 'alphonso' } });
    fireEvent.change(within(builder).getByLabelText('Work for Alphonso'), { target: { value: 'assistant_write' } });
    fireEvent.click(within(builder).getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(listUserTemplates().map((t) => t.name)).toEqual(['Launch']));
    expect(screen.getByTestId('teams-templates').textContent).toContain('Launch');
    expect(listUserTemplates()[0].steps.map((s) => [s.agent, s.actionType])).toEqual([['hector', expect.stringMatching(/^research/)], ['alphonso', 'assistant_write']]);
  });

  it('shows a broken template with its problem and no Run', () => {
    localStorage.setItem('alphonso_jose_user_templates_v1', JSON.stringify([{ id: 'user_bad', name: 'Bad', kind: 'normal', matchWords: [], steps: [{ stepId: 'nova', agent: 'nova', actionType: 'research_report', effects: ['read'], needs: [] }] }]));
    render(<TeamsPage />);
    expect(screen.getByTestId('team-problems-user_bad').textContent).toContain("Gives Hector's work to Nova");
    expect(screen.getByTestId('team-run-user_bad').hasAttribute('disabled')).toBe(true);
  });

  it('runs a team with what you ask, and deletes one after asking', async () => {
    const team = saveTeam({ name: 'Launch', job: 'x', members: [{ agent: 'hector', actionType: 'research_report', instruction: 'Find facts.', needs: [] }] }) as any;
    render(<TeamsPage />);
    fireEvent.click(screen.getByTestId(`team-run-${team.template.id}`));
    fireEvent.change(screen.getByLabelText('What should the team do?'), { target: { value: 'two facts about tea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run team' }));
    await waitFor(() => expect(submitStepsToJose).toHaveBeenCalledWith(expect.objectContaining({ text: 'two facts about tea', label: 'Steps set by your team Launch.' })));
    fireEvent.click(screen.getByTestId(`team-delete-${team.template.id}`));
    expect(window.confirm).toHaveBeenCalled();
    expect(listUserTemplates()).toEqual([]);
  });

  it('offers an old pair once as a team, or dismisses it', () => {
    localStorage.setItem('alphonso_agent_pairs_v1', JSON.stringify([{ id: 'p1', agentA: 'jose', agentB: 'miya', triggerOn: 'a new video idea', note: '', createdAt: 1 }]));
    render(<TeamsPage />);
    const offer = screen.getByTestId('old-pair-p1');
    expect(offer.textContent).toContain('a new video idea');
    fireEvent.click(within(offer).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('old-pair-p1')).toBeNull();
  });
});
