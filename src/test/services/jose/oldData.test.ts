// Agent roles Part C1: data saved before Part C keeps working, and nothing is changed silently.
import { describe, it, expect, beforeEach } from 'vitest';
import { getJoseRequest, listJoseRequests } from '../../../services/jose/joseRequestStore';
import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { listUserTemplates } from '../../../services/jose/joseUserTemplates';
import { templateProblems } from '../../../services/jose/teams';
import { toCurrentOwners } from '../../../services/jose/movedTaskTypes';

beforeEach(() => localStorage.clear());

describe('old saved data', () => {
  it('requests and step outputs saved before Part C load as they were', () => {
    localStorage.setItem('alphonso_jose_requests_v1', JSON.stringify([{
      id: 'jose-request-old', commandId: 'old', source: 'user', text: 'Research tea', kind: 'normal', status: 'done',
      steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], status: 'done' }],
      createdAtMs: 1, updatedAtMs: 2, changeLog: [],
    }]));
    localStorage.setItem('alphonso_jose_step_outputs_v1', JSON.stringify({ old: { atMs: 1, steps: { hector: { agent: 'hector', summary: 'Tea is a drink.' } } } }));
    expect(listJoseRequests().map((r) => r.id)).toContain('jose-request-old');
    expect(getJoseRequest('jose-request-old')!.steps[0].status).toBe('done');
    expect(getStepOutput('old', 'hector')).toMatchObject({ summary: 'Tea is a drink.' });
  });

  it('a saved template with a task type that moved is checked as its new owner, and stored unchanged', () => {
    const steps = [{ stepId: 'alphonso', agent: 'alphonso', actionType: 'runtime_assemble_video', effects: ['write_own_work'], needs: [] }];
    localStorage.setItem('alphonso_jose_user_templates_v1', JSON.stringify([{ id: 'user_old', name: 'Old video', kind: 'normal', matchWords: [], steps }]));
    const template = listUserTemplates()[0];
    expect(templateProblems(template)).toEqual([]);
    expect(toCurrentOwners(template.steps as never).steps[0]).toMatchObject({ agent: 'miya', actionType: 'creative_assemble_video' });
    expect(JSON.parse(localStorage.getItem('alphonso_jose_user_templates_v1')!)[0].steps[0].agent).toBe('alphonso');
  });

  it('a template that gives work to a non-owner (not a move) still shows its problem', () => {
    expect(templateProblems({ steps: [{ stepId: 'nova', agent: 'nova', actionType: 'research_report', effects: ['read'], needs: [] }] } as never))
      .toEqual(["Gives Hector's work to Nova (research_report)."]);
  });
});
