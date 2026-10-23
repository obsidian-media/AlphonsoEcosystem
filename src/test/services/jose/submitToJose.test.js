import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/josePlanner', async (importOriginal) => ({
  ...(await importOriginal()),
  planJoseRequest: vi.fn(),
}));

vi.mock('../../../services/joseExecutionEngineService', () => ({
  runPipelineShortcuts: vi.fn(async () => null),
  runJoseCommandExecutionPipeline: vi.fn(async () => ({ ok: true, commandId: 'c1', executedCount: 1, pendingApprovalCount: 0, failedCount: 0, executionReceipts: [] })),
}));

import { submitToJose, runApprovedPlan, cancelPlan, CONTENT_VIDEO_STUDIO_NOTE } from '../../../services/jose/submitToJose';
import { getJoseRequest, replacePlanSteps } from '../../../services/jose/joseRequestStore';
import { planJoseRequest } from '../../../services/jose/josePlanner';
import { runPipelineShortcuts, runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { getTemplate } from '../../../services/jose/joseTemplates';

const pipeline = vi.mocked(runJoseCommandExecutionPipeline);
const planner = vi.mocked(planJoseRequest);

const freshPlan = {
  steps: [
    { stepId: 'facts', agent: 'hector', actionType: 'research_report', instruction: 'Find the facts.', effects: ['read'], needs: [] },
    { stepId: 'value', agent: 'nova', actionType: 'analysis_findings', instruction: 'Judge them.', effects: ['read'], needs: ['facts'] },
  ],
  source: 'fresh', templateId: null, kind: 'normal', note: '',
};

beforeEach(() => {
  localStorage.clear();
  // These tests run plans straight away; showing the plan first is tested below.
  localStorage.setItem('alphonso_settings', JSON.stringify({ showPlanFirst: 'never' }));
  vi.mocked(runPipelineShortcuts).mockReset().mockResolvedValue(null);
  pipeline.mockClear();
  planner.mockReset();
});

describe('submitToJose', () => {
  it('lets a shortcut (an image request) answer without planning', async () => {
    vi.mocked(runPipelineShortcuts).mockResolvedValueOnce({ ok: true, executedCount: 1, creativeResult: { ok: true } });
    const result = await submitToJose({ text: 'make an image of a llama', source: 'user' });
    expect(result.creativeResult).toBeTruthy();
    expect(result.plan).toBeNull();
    expect(planner).not.toHaveBeenCalled();
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('runs Jose’s plan as explicit steps', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    const result = await submitToJose({ text: 'Plan a party', source: 'user', planFresh: true, history: [{ role: 'user', content: 'hi' }] });
    expect(planner).toHaveBeenCalledWith('Plan a party', expect.objectContaining({ planFresh: true, history: [{ role: 'user', content: 'hi' }] }));
    const args = pipeline.mock.calls[0][0];
    expect(args.assignments.map((a) => a.stepId)).toEqual(['facts', 'value']);
    expect(args.assignments[1]).toMatchObject({ agent: 'nova', instruction: 'Judge them.', needs: ['facts'], effects: ['read'], commandPreview: 'Judge them.' });
    expect(args.requestKind).toBe('normal');
    expect(args.planInfo).toEqual({ source: 'fresh', templateId: null, note: '' });
    expect(result.planNote).toBe('Planned fresh.');
  });

  // Phase 3: the simple plan runs as steps too, so a failed step stops the steps that need it.
  it('runs a rules plan as explicit steps too', async () => {
    planner.mockResolvedValueOnce({ ...freshPlan, source: 'rules', note: "Jose's model isn't available, so I used the simple plan." });
    const result = await submitToJose({ text: 'research pricing', source: 'user' });
    expect(pipeline.mock.calls[0][0].assignments.map((a) => a.stepId)).toEqual(['facts', 'value']);
    expect(result.planNote).toMatch(/isn't available/);
  });

  it('points to Miya Studio for a content video', async () => {
    planner.mockResolvedValueOnce({ steps: getTemplate('content_video').steps, source: 'template', templateId: 'content_video', kind: 'normal', note: '' });
    const result = await submitToJose({ text: 'Make a YouTube video script', source: 'user' });
    expect(result.planNote).toContain('Based on template Content video.');
    expect(result.planNote).toContain(CONTENT_VIDEO_STUDIO_NOTE);
  });

  it('passes a project-type plan on as a project', async () => {
    planner.mockResolvedValueOnce({ steps: getTemplate('build_app').steps, source: 'template', templateId: 'build_app', kind: 'project', note: '' });
    await submitToJose({ text: 'Build a web app', source: 'user' });
    expect(pipeline.mock.calls[0][0].requestKind).toBe('project');
  });
});

// Phase 3 (2026-10-23): bigger requests show their plan first.
describe('showing the plan first', () => {
  beforeEach(() => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ showPlanFirst: 'bigger' }));
  });

  async function waitingPlan() {
    planner.mockResolvedValueOnce(freshPlan);
    return submitToJose({ text: 'Research and judge it', source: 'user', previewMode: true });
  }

  it('saves a bigger plan to wait, without running it', async () => {
    const result = await waitingPlan();
    expect(result.waitingForPlan).toBe(true);
    expect(pipeline).not.toHaveBeenCalled();
    expect(getJoseRequest(result.requestId).status).toBe('waiting_plan_approval');
    expect(result.planNote).toBe('Planned fresh.');
  });

  it('a setting passed in wins over the saved one', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    const result = await submitToJose({ text: 'x', source: 'user', showPlanFirst: 'never' });
    expect(result.waitingForPlan).toBeUndefined();
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('runs an approved plan once, on the same saved request', async () => {
    const { requestId } = await waitingPlan();
    await runApprovedPlan(requestId);
    const args = pipeline.mock.calls[0][0];
    expect(args.existingRequestId).toBe(requestId);
    expect(args.assignments.map((a) => a.stepId)).toEqual(['facts', 'value']);
    expect(args.previewMode).toBe(true);
    const again = await runApprovedPlan(requestId);
    expect(again).toMatchObject({ ok: false, reason: 'This plan is no longer waiting.' });
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('keeps an edited plan that breaks the rules waiting, with the problems', async () => {
    const { requestId } = await waitingPlan();
    replacePlanSteps(requestId, [{ ...freshPlan.steps[0], needs: ['value'] }, freshPlan.steps[1]], 'Changed what Hector needs');
    const result = await runApprovedPlan(requestId);
    expect(result).toMatchObject({ ok: false, reason: 'plan_rejected' });
    expect(result.problems.join(' ')).toMatch(/cycle/);
    expect(getJoseRequest(requestId).status).toBe('waiting_plan_approval');
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('cannot run a cancelled plan', async () => {
    const { requestId } = await waitingPlan();
    cancelPlan(requestId);
    expect(await runApprovedPlan(requestId)).toMatchObject({ ok: false, reason: 'This plan is no longer waiting.' });
    expect(pipeline).not.toHaveBeenCalled();
  });
});
