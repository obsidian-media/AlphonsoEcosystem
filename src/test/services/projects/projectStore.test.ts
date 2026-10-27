// Agent roles Part C1: a project starts a real Jose request from the "Build an app" template.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const submitted: any[] = [];
let nextResult: any = { ok: true, requestId: 'jose-request-c1' };
vi.mock('../../../services/jose/submitToJose', () => ({
  submitToJose: vi.fn(async (input: any) => { submitted.push(input); return nextResult; }),
}));

import { intakeText, saveProject, listProjects, getProject, startProject, deleteProject, PROJECT_NEEDS_TEXT, type ProjectIntake } from '../../../services/projects/projectStore';

const intake = (extra: Partial<ProjectIntake> = {}): ProjectIntake => ({
  name: 'Recipe box', description: 'A small web app to save recipes', stack: '', deadline: '', type: 'web_app',
  features: '', constraints: '', risks: '', priority: 'medium', ...extra,
});

beforeEach(() => {
  localStorage.clear();
  submitted.length = 0;
  nextResult = { ok: true, requestId: 'jose-request-c1' };
});

describe('intakeText', () => {
  it('says what to build and leaves empty fields out', () => {
    expect(intakeText(intake())).toBe('Build Recipe box: A small web app to save recipes.\nPriority: medium');
    expect(intakeText(intake({ stack: 'React', features: 'search, tags', constraints: 'no paid services' })))
      .toBe('Build Recipe box: A small web app to save recipes.\nStack: React\nFeatures: search, tags\nMust not: no paid services\nPriority: medium');
  });
});

describe('startProject', () => {
  it('asks Jose with the Build an app template and keeps each run', async () => {
    const p = saveProject(intake());
    expect(await startProject(p.id)).toEqual({ ok: true, requestId: 'jose-request-c1' });
    expect(submitted[0]).toMatchObject({ text: intakeText(intake()), source: 'user', templateId: 'build_app' });
    nextResult = { ok: true, waitingForPlan: true, requestId: 'jose-request-plan-2' };
    await startProject(p.id);
    expect(getProject(p.id)!.runs.map((r) => r.requestId)).toEqual(['jose-request-c1', 'jose-request-plan-2']);
  });

  it('a project without a name or description is not started', async () => {
    const p = saveProject(intake({ description: '  ' }));
    expect(await startProject(p.id)).toEqual({ ok: false, reason: PROJECT_NEEDS_TEXT });
    expect(submitted).toHaveLength(0);
    expect(PROJECT_NEEDS_TEXT).toBe('Give the project a name and a description first.');
  });

  it("an unknown project or Jose's refusal says why", async () => {
    expect((await startProject('nope')).ok).toBe(false);
    const p = saveProject(intake());
    nextResult = { ok: false, reason: 'plan_rejected', problems: ['x'] };
    expect(await startProject(p.id)).toMatchObject({ ok: false });
    expect(getProject(p.id)!.runs).toEqual([]);
  });
});

describe('the store', () => {
  it('keeps 50 projects, newest first; saving an id updates it; delete removes it', () => {
    for (let i = 0; i < 51; i += 1) saveProject(intake({ name: `P${i}` }));
    expect(listProjects()).toHaveLength(50);
    expect(listProjects()[0].name).toBe('P50');
    const p = listProjects()[0];
    saveProject(intake({ name: 'Renamed' }), p.id);
    expect(getProject(p.id)!.name).toBe('Renamed');
    deleteProject(p.id);
    expect(getProject(p.id)).toBeNull();
  });
});
