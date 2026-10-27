// Agent roles Part C1: teams are checked templates, run by name.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const submitted: any[] = [];
vi.mock('../../../services/jose/submitToJose', async (importOriginal) => ({
  ...(await importOriginal() as object),
  submitStepsToJose: vi.fn(async (input: any) => { submitted.push(input); return { ok: true, requestId: 'jose-request-t' }; }),
}));

import {
  teamSteps, templateProblems, saveTeam, findTeam, parseTeamRequest, runTeam, oldPairOffers, dismissOldPair, takeOldPair,
  TEAM_NEEDS_TEXT, TEAM_LABEL, TEAM_NOT_FOUND,
} from '../../../services/jose/teams';
import { listUserTemplates } from '../../../services/jose/joseUserTemplates';

const hector = { agent: 'hector', actionType: 'research_report', instruction: 'Find the facts.', needs: [] };
const alphonso = { agent: 'alphonso', actionType: 'assistant_write', instruction: 'Write it up.', needs: ['hector'] };

beforeEach(() => {
  localStorage.clear();
  submitted.length = 0;
});

describe('teamSteps and saveTeam', () => {
  it('gives each agent its step, with ids, needs and effects', () => {
    const steps = teamSteps([hector, alphonso, { ...hector, instruction: 'More facts.' }]);
    expect(steps.map((s) => [s.stepId, s.needs])).toEqual([['hector', []], ['alphonso', ['hector']], ['hector-2', []]]);
    expect(steps[0].effects).toContain('read');
  });

  it('saves a team that keeps each agent to its own work', () => {
    const out = saveTeam({ name: 'Launch', job: 'Research and write a launch note', members: [hector, alphonso] });
    expect(out.ok).toBe(true);
    expect(listUserTemplates().map((t) => t.name)).toEqual(['Launch']);
  });

  it("refuses a team that gives one agent another's work, in plain words", () => {
    const out = saveTeam({ name: 'Wrong', job: 'x', members: [{ ...hector, agent: 'nova' }] });
    expect(out).toEqual({ ok: false, problems: ["Gives Hector's work to Nova (research_report)."] });
    expect(listUserTemplates()).toEqual([]);
  });
});

describe('templateProblems', () => {
  it('a template with no steps, or with work given to the wrong agent', () => {
    expect(templateProblems({ id: 't', name: 'Empty', kind: 'normal', matchWords: [], steps: [] })).toEqual(['This template has no steps.']);
    expect(templateProblems({ id: 't', name: 'Bad', kind: 'normal', matchWords: [], steps: teamSteps([{ ...hector, agent: 'nova' }]) }))
      .toEqual(["Gives Hector's work to Nova (research_report)."]);
  });
});

describe('finding a team by name', () => {
  it('matches without caring about capitals, then by the start of the name, and says when two fit', () => {
    saveTeam({ name: 'Launch', job: 'x', members: [hector] });
    saveTeam({ name: 'Launch party', job: 'x', members: [hector] });
    saveTeam({ name: 'Weekly report', job: 'x', members: [hector] });
    expect((findTeam('launch') as any).name).toBe('Launch');
    expect((findTeam('WEEKLY') as any).name).toBe('Weekly report');
    expect(findTeam('laun')).toEqual({ ambiguous: ['Launch', 'Launch party'] });
    expect(findTeam('budget')).toBeNull();
  });
});

describe('parseTeamRequest', () => {
  it('reads the three ways of asking, and nothing else', () => {
    expect(parseTeamRequest('/team Launch write two lines about tea')).toEqual({ name: 'Launch', rest: 'write two lines about tea' });
    expect(parseTeamRequest('use team Launch to write two lines about tea')).toEqual({ name: 'Launch', rest: 'write two lines about tea' });
    expect(parseTeamRequest('Use team Launch party: plan the party')).toEqual({ name: 'Launch party', rest: 'plan the party' });
    expect(parseTeamRequest("use the team's notes for the report")).toBeNull();
  });

  it('a saved team whose name has " to " in it is read whole', () => {
    saveTeam({ name: 'Back to school', job: 'x', members: [hector] });
    expect(parseTeamRequest('use team Back to school to plan the trip')).toEqual({ name: 'Back to school', rest: 'plan the trip' });
    expect(parseTeamRequest('use team back to school: plan the trip')).toEqual({ name: 'Back to school', rest: 'plan the trip' });
  });
});

describe('runTeam', () => {
  it('needs a request, refuses a broken template, else runs its steps with its label', async () => {
    const team = saveTeam({ name: 'Launch', job: 'x', members: [hector, alphonso] }) as any;
    expect(await runTeam(team.template.id, '   ', { source: 'user' })).toEqual({ ok: false, reason: TEAM_NEEDS_TEXT });
    expect(submitted).toHaveLength(0);
    expect(TEAM_NEEDS_TEXT).toBe('Say what the team should do.');
    await runTeam(team.template.id, 'write two lines about tea', { source: 'user' });
    expect(submitted[0]).toMatchObject({ text: 'write two lines about tea', source: 'user', label: TEAM_LABEL('Launch') });
    expect(submitted[0].steps.map((s: any) => s.agent)).toEqual(['hector', 'alphonso']);
    expect(TEAM_LABEL('Launch')).toBe('Steps set by your team Launch.');
    localStorage.setItem('alphonso_jose_user_templates_v1', JSON.stringify([{ id: 'user_bad', name: 'Bad', kind: 'normal', matchWords: [], steps: [] }]));
    expect(await runTeam('user_bad', 'do it', { source: 'user' })).toMatchObject({ ok: false, reason: 'plan_rejected', problems: ['This template has no steps.'] });
  });

  it('names your teams when none matches', () => {
    expect(TEAM_NOT_FOUND([])).toBe('You have no teams yet: make one on the Teams page.');
    expect(TEAM_NOT_FOUND(['Launch', 'Weekly report'])).toBe('No team called that. Your teams: Launch, Weekly report.');
  });
});

describe('asked for by name through Jose', () => {
  it("submitToJose runs the named team, or names the teams when it doesn't know it", async () => {
    const { submitToJose } = await import('../../../services/jose/submitToJose');
    saveTeam({ name: 'Launch', job: 'x', members: [hector, alphonso] });
    await submitToJose({ text: 'use team launch to write two lines about tea', source: 'user' });
    expect(submitted[0]).toMatchObject({ label: TEAM_LABEL('Launch'), text: 'write two lines about tea' });
    expect(await submitToJose({ text: '/team Budget plan it', source: 'user' })).toEqual({ ok: false, reason: TEAM_NOT_FOUND(['Launch']) });
  });
});

describe('old saved pairs', () => {
  const pairs = [
    { id: 'p1', agentA: 'jose', agentB: 'miya', triggerOn: 'a new video idea', note: 'Miya drafts it', createdAt: 1 },
    { id: 'p2', agentA: 'miya', agentB: 'comfyui', triggerOn: 'a picture', note: '', createdAt: 2 },
  ];

  it('offers each real pair once with its trigger as the job, and drops one that names no agent', () => {
    localStorage.setItem('alphonso_agent_pairs_v1', JSON.stringify(pairs));
    expect(oldPairOffers()).toEqual([{ id: 'p1', agents: ['jose', 'miya'], job: 'a new video idea', note: 'Miya drafts it' }]);
    expect(JSON.parse(localStorage.getItem('alphonso_agent_pairs_v1')!).map((p: any) => p.id)).toEqual(['p1']);
    dismissOldPair('p1');
    expect(oldPairOffers()).toEqual([]);
  });

  it('taking a pair removes it and hands it to the builder', () => {
    localStorage.setItem('alphonso_agent_pairs_v1', JSON.stringify(pairs.slice(0, 1)));
    expect(takeOldPair('p1')).toMatchObject({ agents: ['jose', 'miya'] });
    expect(oldPairOffers()).toEqual([]);
  });
});
