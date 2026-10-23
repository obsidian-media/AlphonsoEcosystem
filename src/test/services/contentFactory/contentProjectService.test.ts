import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  listProjects,
  getProject,
  updateBrief,
  startStep,
  addStepProgress,
  saveStepVersion,
  failStep,
  chooseVersion,
  approveStep,
  sendBackStep,
  isStepStale,
  recoverInterruptedSteps,
  emptyBrief,
} from '../../../services/contentFactory/contentProjectService';

const out = (summary: string) => ({ output: { text: summary }, summary, joseCommandId: null });

beforeEach(() => localStorage.clear());

describe('contentProjectService', () => {
  it('a new project has every step not started', () => {
    const p = createProject('brand-1', 'Launch video', { ...emptyBrief(), idea: 'Why we procrastinate' });
    expect(Object.values(p.steps).every((s) => s.status === 'not_started')).toBe(true);
    expect(p.folderName).toBe('launch-video');
    expect(listProjects('brand-1').map((x) => x.id)).toEqual([p.id]);
    expect(listProjects('other')).toEqual([]);
  });

  it('versions count up and are capped at 20', () => {
    const p = createProject('b', 'P', emptyBrief());
    for (let i = 0; i < 22; i += 1) saveStepVersion(p.id, 'script', out(`v${i}`));
    const step = getProject(p.id)!.steps.script;
    expect(step.versions).toHaveLength(20);
    expect(step.versions[step.versions.length - 1].version).toBe(22);
    expect(step.chosenVersion).toBe(22);
    expect(step.status).toBe('done');
  });

  it('a new script makes later steps that have versions out of date, not earlier ones', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'research', out('r1'));
    saveStepVersion(p.id, 'script', out('s1'));
    saveStepVersion(p.id, 'scenes', out('sc1'));
    expect(isStepStale(getProject(p.id)!, 'scenes')).toBe(false);
    saveStepVersion(p.id, 'script', out('s2'));
    const after = getProject(p.id)!;
    expect(isStepStale(after, 'scenes')).toBe(true);
    expect(isStepStale(after, 'research')).toBe(false);
    expect(isStepStale(after, 'thumbnail')).toBe(false); // no version yet
  });

  it('a version made while an earlier step changed is saved as out of date', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'script', out('s1'));
    startStep(p.id, 'scenes');
    saveStepVersion(p.id, 'script', out('s2'));
    const scenes = saveStepVersion(p.id, 'scenes', out('sc1')).steps.scenes;
    expect(scenes.versions[0].stale).toBe(true);
    expect(scenes.versions[0].basedOn.script).toBe(1);
  });

  it('review waits for approval, then is approved; send back keeps the reason', () => {
    const p = createProject('b', 'P', emptyBrief());
    expect(saveStepVersion(p.id, 'review', out('r')).steps.review.status).toBe('needs_approval');
    expect(approveStep(p.id, 'review').steps.review.status).toBe('approved');
    const back = sendBackStep(p.id, 'review', 'Hook is weak');
    expect(back.steps.review.status).toBe('sent_back');
    expect(back.steps.review.error).toBe('Hook is weak');
  });

  it('progress, failure and choosing a version', () => {
    const p = createProject('b', 'P', emptyBrief());
    startStep(p.id, 'research');
    addStepProgress(p.id, 'research', 'Hector is researching…');
    expect(getProject(p.id)!.steps.research.progress[0].message).toBe('Hector is researching…');
    expect(failStep(p.id, 'research', 'No model').steps.research).toMatchObject({ status: 'failed', error: 'No model' });
    saveStepVersion(p.id, 'script', out('s1'));
    saveStepVersion(p.id, 'scenes', out('sc1'));
    saveStepVersion(p.id, 'script', out('s2'));
    chooseVersion(p.id, 'script', 1);
    const chosen = getProject(p.id)!;
    expect(chosen.steps.script.chosenVersion).toBe(1);
    expect(isStepStale(chosen, 'scenes')).toBe(false);
  });

  it('changing the brief makes started steps out of date', () => {
    const p = createProject('b', 'P', emptyBrief());
    saveStepVersion(p.id, 'research', out('r1'));
    updateBrief(p.id, { ...emptyBrief(), idea: 'New idea' });
    expect(isStepStale(getProject(p.id)!, 'research')).toBe(true);
  });

  it('a step left running when the app closed becomes interrupted', () => {
    const p = createProject('b', 'P', emptyBrief());
    startStep(p.id, 'research');
    startStep(p.id, 'script');
    expect(recoverInterruptedSteps()).toBe(2);
    expect(getProject(p.id)!.steps.research.status).toBe('interrupted');
  });
});
