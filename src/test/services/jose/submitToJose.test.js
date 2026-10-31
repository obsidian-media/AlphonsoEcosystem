import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/josePlanner', async (importOriginal) => ({
  ...(await importOriginal()),
  planJoseRequest: vi.fn(),
}));

vi.mock('../../../services/joseExecutionEngineService', () => ({
  runPipelineShortcuts: vi.fn(async () => null),
  runJoseCommandExecutionPipeline: vi.fn(async () => ({ ok: true, commandId: 'c1', executedCount: 1, pendingApprovalCount: 0, failedCount: 0, executionReceipts: [] })),
}));

const askChatMedia = vi.fn(async () => null);
vi.mock('../../../services/contentFactory/chatMedia', () => ({ askChatMedia: (...a) => askChatMedia(...a) }));
vi.mock('../../../services/contentFactory/contentFromChat', () => ({
  startContentProjectFromChat: vi.fn(async () => ({ ok: true, projectId: 'p1', note: 'Started the project.' })),
}));
import { startContentProjectFromChat } from '../../../services/contentFactory/contentFromChat';
import { submitToJose, submitStepsToJose, runApprovedPlan, cancelPlan, CONTENT_VIDEO_STUDIO_NOTE } from '../../../services/jose/submitToJose';
import { getJoseRequest, replacePlanSteps, createWaitingPlanRequest } from '../../../services/jose/joseRequestStore';
import { planJoseRequest } from '../../../services/jose/josePlanner';
import { runPipelineShortcuts, runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { getTemplate } from '../../../services/jose/joseTemplates';

const pipeline = vi.mocked(runJoseCommandExecutionPipeline);
const planner = vi.mocked(planJoseRequest);
const startFromChat = vi.mocked(startContentProjectFromChat);

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
  askChatMedia.mockClear();
  startFromChat.mockClear();
  pipeline.mockClear();
  planner.mockReset();
});

// Agent phase 4: Sentinel's automatic checks are added to every plan before it runs.
describe("Sentinel's checks in every plan", () => {
  const sendPlan = { ...freshPlan, steps: [
    { stepId: 'write', agent: 'alphonso', actionType: 'assistant_write', instruction: 'Write it.', effects: ['write_own_work'], needs: [] },
    { stepId: 'send', agent: 'marcus', actionType: 'distribution_slack', instruction: 'Post it.', effects: ['publish_or_send'], needs: ['write'] },
  ] };

  it("Jose's plan gets a check before Marcus sends, said in the note", async () => {
    planner.mockResolvedValueOnce(sendPlan);
    const result = await submitToJose({ text: 'Write a note and post it to Slack', source: 'user' });
    const ids = pipeline.mock.calls[0][0].assignments.map((a) => a.stepId);
    expect(ids).toContain('sentinel-send-send');
    expect(result.planNote).toContain('Sentinel checks added');
  });

  it('a key in the request is said in the note', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    const result = await submitToJose({ text: 'Use sk-live-1234abcd5678efgh to fetch the data', source: 'user' });
    expect(result.planNote).toContain('Your request contains a key (ends …efgh); it was hidden from every agent.');
  });

  // Agent roles Part C2: a request naming two projects gets a code step in each.
  it('a request naming two projects gets one code step per project, each with its check', async () => {
    const { saveProjects } = await import('../../../services/alphonso/projects');
    saveProjects([{ name: 'shop', folder: 'D:\\code\\shop' }, { name: 'blog', folder: 'D:\\code\\blog' }]);
    planner.mockResolvedValueOnce({ ...freshPlan, steps: [
      { stepId: 'alphonso', agent: 'alphonso', actionType: 'local_operation', instruction: 'Change the footer.', effects: ['run'], needs: [] },
    ] });
    await submitToJose({ text: 'Update the footer in shop and blog', source: 'user' });
    const assignments = pipeline.mock.calls[0][0].assignments;
    expect(assignments.filter((a) => a.agent === 'alphonso').map((a) => [a.stepId, a.project])).toEqual([['alphonso', 'shop'], ['alphonso-2', 'blog']]);
    expect(assignments.map((a) => a.stepId)).toEqual(expect.arrayContaining(['sentinel-code-alphonso', 'sentinel-code-alphonso-2']));
  });

  it('given steps get the checks too', async () => {
    await submitStepsToJose({ text: 'Distribute', source: 'boardroom', label: 'Steps set by Boardroom.', steps: sendPlan.steps });
    expect(pipeline.mock.calls[0][0].assignments.map((a) => a.stepId)).toContain('sentinel-send-send');
  });
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
  it('passes on which step a review reviews (phase 4)', async () => {
    planner.mockResolvedValueOnce({ ...freshPlan, steps: [freshPlan.steps[0], { ...freshPlan.steps[1], reviewOf: 'facts' }] });
    await submitToJose({ text: 'Plan a party', source: 'user' });
    expect(pipeline.mock.calls[0][0].assignments[1].reviewOf).toBe('facts');
  });

  it('passes allowPaidModels to the planner and the run, and saves it on a waiting plan', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    await submitToJose({ text: 'Plan a party', source: 'schedule', allowPaidModels: false });
    expect(planner).toHaveBeenCalledWith('Plan a party', expect.objectContaining({ allowPaidModels: false }));
    expect(pipeline.mock.calls[0][0].allowPaidModels).toBe(false);
  });

  it('runs given steps as a plan, labelled', async () => {
    const result = await submitStepsToJose({ text: 'Brief for the launch', source: 'boardroom', label: 'Steps set by Boardroom.', steps: freshPlan.steps });
    const args = pipeline.mock.calls[0][0];
    expect(args.assignments.map((a) => a.stepId)).toEqual(['facts', 'value']);
    expect(args.planInfo).toEqual({ source: 'given', templateId: null, note: 'Steps set by Boardroom.' });
    expect(result.planNote).toBe('Steps set by Boardroom.');
  });

  it('given steps keep their content data and wait reason, and can skip Echo (phase 6b)', async () => {
    const contentStep = { projectId: 'p1', step: 'scenes', task: 'x' };
    await submitStepsToJose({
      text: 'x', source: 'content-factory', label: 'Steps set by Miya Studio.', saveDecisions: false,
      steps: [{ stepId: 'scenes', agent: 'miya', actionType: 'creative_scenes', effects: ['write_own_work'], needs: [], contentStep, waitFor: 'Approve the review in Miya Studio first.' }],
    });
    const args = pipeline.mock.calls[0][0];
    expect(args.assignments[0]).toMatchObject({ contentStep, waitFor: 'Approve the review in Miya Studio first.' });
    expect(args.saveDecisions).toBe(false);
  });

  it('refuses given steps that break the rules', async () => {
    const result = await submitStepsToJose({ text: 'x', source: 'boardroom', label: 'x', steps: [{ stepId: 'a', agent: 'miya', actionType: 'creative_x', effects: ['run'], needs: [] }] });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/only Alphonso/);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('runs a rules plan as explicit steps too', async () => {
    planner.mockResolvedValueOnce({ ...freshPlan, source: 'rules', note: "Jose's model isn't available, so I used the simple plan." });
    const result = await submitToJose({ text: 'research pricing', source: 'user' });
    expect(pipeline.mock.calls[0][0].assignments.map((a) => a.stepId)).toEqual(['facts', 'value']);
    expect(result.planNote).toMatch(/isn't available/);
  });

  // Phase 6b: from Chat a content video becomes a Miya Studio project (owner);
  // other places (Telegram, schedules) still run the template's steps.
  it('from Chat, a content video starts a Miya Studio project instead of planning', async () => {
    const result = await submitToJose({ text: 'Make a YouTube video script about home coffee', source: 'user' });
    expect(startFromChat).toHaveBeenCalledWith('Make a YouTube video script about home coffee', expect.anything(), { source: 'user', allowPaidModels: undefined });
    expect(planner).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, contentProjectId: 'p1', planNote: 'Started the project.' });
  });

  // Real app (2026-10-23): the creative shortcut answered "Making videos from
  // chat isn't available yet" before the content-video check ran.
  it('a content video becomes a project even when a creative shortcut would answer first', async () => {
    vi.mocked(runPipelineShortcuts).mockResolvedValueOnce({ ok: false, reason: "Making videos from chat isn't available yet. Nothing was started." });
    const result = await submitToJose({ text: 'Make a YouTube video script about home coffee', source: 'user' });
    expect(result.contentProjectId).toBe('p1');
    expect(runPipelineShortcuts).not.toHaveBeenCalled();
  });

  // Closing phase (owner, 2026-10-30): video and music from Chat are Miya's step.
  it('a video or music request goes to Miya\'s media step, before any plan', async () => {
    askChatMedia.mockResolvedValueOnce({ ok: true, requestId: 'r-media' });
    const result = await submitToJose({ text: 'make a video of a cat on a boat', source: 'user' });
    expect(askChatMedia).toHaveBeenCalledWith(expect.objectContaining({ text: 'make a video of a cat on a boat', source: 'user' }));
    expect(result).toMatchObject({ ok: true, requestId: 'r-media' });
    expect(planner).not.toHaveBeenCalled();
    expect(runPipelineShortcuts).not.toHaveBeenCalled();
  });

  it('"Plan this fresh" plans instead of making the media at once', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    await submitToJose({ text: 'make a video of a cat on a boat', source: 'user', planFresh: true });
    expect(askChatMedia).not.toHaveBeenCalled();
  });

  it('"Plan this fresh" still plans a content video', async () => {
    planner.mockResolvedValueOnce(freshPlan);
    await submitToJose({ text: 'Make a YouTube video script', source: 'user', planFresh: true });
    expect(startFromChat).not.toHaveBeenCalled();
  });

  // Jose phase 7: Telegram and schedules start a project too; other places still run the steps.
  it('from Telegram or a schedule, a content video starts a Miya Studio project too', async () => {
    for (const source of ['telegram', 'schedule']) {
      startFromChat.mockClear();
      const result = await submitToJose({ text: 'Make a YouTube video script about home coffee', source, allowPaidModels: source !== 'schedule' });
      expect(startFromChat).toHaveBeenCalledWith('Make a YouTube video script about home coffee', expect.anything(), { source, allowPaidModels: source !== 'schedule' });
      expect(result.contentProjectId).toBe('p1');
    }
    expect(planner).not.toHaveBeenCalled();
  });

  it('points to Miya Studio for a content video asked elsewhere', async () => {
    planner.mockResolvedValueOnce({ steps: getTemplate('content_video').steps, source: 'template', templateId: 'content_video', kind: 'normal', note: '' });
    const result = await submitToJose({ text: 'Make a YouTube video script', source: 'whatsapp' });
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

  it("an approved plan keeps each step's review and model", async () => {
    const waiting = createWaitingPlanRequest({
      text: 'Research and judge', source: 'user', kind: 'normal',
      steps: [
        { stepId: 'facts', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [], instruction: 'Find.', model: 'qwen2.5:7b' },
        { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['facts'], instruction: 'Check.', reviewOf: 'facts' },
      ],
      plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' },
    });
    await runApprovedPlan(waiting.id);
    const [facts, check] = pipeline.mock.calls[0][0].assignments;
    expect(facts.model).toBe('qwen2.5:7b');
    expect(check.reviewOf).toBe('facts');
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

describe('a picture request is Miya\'s step (agent roles Part A)', () => {
  it('runs one Miya creative_image step instead of calling ComfyUI from the shortcut', async () => {
    vi.mocked(runPipelineShortcuts).mockResolvedValueOnce({ kind: 'image_step' });
    await submitToJose({ text: 'make a picture of a red fox', source: 'user' });
    expect(planner).not.toHaveBeenCalled();
    const call = pipeline.mock.calls.at(-1)[0];
    expect(call.assignments.map((a) => [a.agent, a.actionType, a.effects])).toEqual([['miya', 'creative_image', ['write_own_work']]]);
    expect(call.planInfo.note).toBe('Picture asked for in Chat.');
  });
});
