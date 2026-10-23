import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 6b: a project runs as one Jose request (submitStepsToJose); each step's
// version is saved by the recorder as it finishes (contentStepRecorder.test.ts).
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: vi.fn() }));
vi.mock('../../../services/joseExecutionEngineService', () => ({ approveRequestStep: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../../services/jose/joseRequestStore', () => ({ getJoseRequest: vi.fn(() => null) }));
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));

import { submitStepsToJose } from '../../../services/jose/submitToJose';
import { approveRequestStep } from '../../../services/joseExecutionEngineService';
import { getJoseRequest } from '../../../services/jose/joseRequestStore';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, markStepStatus, startStep } from '../../../services/contentFactory/contentProjectService';
import {
  runContentStep, runContentProject, approveContentStep, STEP_AGENTS, CONTENT_TASK_PREVIEW, PROJECT_LABEL, WAITING_FOR_APPROVAL,
} from '../../../services/contentFactory/contentStepRunner';
import { REVIEW_WAIT } from '../../../services/contentFactory/contentProjectPlan';
import { canExecutePacket } from '../../../services/agentBusService';

const settings = { outputFolder: 'D:\\Content' };
const submitted = () => vi.mocked(submitStepsToJose).mock.calls[0][0] as any;
const ok = (extra = {}) => ({ ok: true, commandId: 'c1', requestId: 'jose-request-c1', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [], ...extra });

function newProject() {
  const brand = saveBrand({ name: 'My brand' });
  return createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('runContentProject', () => {
  it("submits the template's steps labelled, without Echo saving each step", async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok() as never);
    const result = await runContentProject(p.id, { settings });
    expect(result).toEqual({ ok: true, requestId: 'jose-request-c1' });
    const args = submitted();
    expect(args).toMatchObject({ source: 'content-factory', label: PROJECT_LABEL, saveDecisions: false });
    expect(PROJECT_LABEL).toBe('Steps set by Miya Studio.');
    expect(args.steps).toHaveLength(15);
    expect(args.text).toContain('Why we wait');
    expect(getProject(p.id)!.joseRequestId).toBe('jose-request-c1');
  });

  it('refuses while a step of the project is running', async () => {
    const p = newProject();
    startStep(p.id, 'script');
    expect(await runContentProject(p.id, { settings })).toEqual({ ok: false, requestId: null, reason: 'A step of this project is already running.' });
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });

  it('needs the idea and the output folder', async () => {
    const brand = saveBrand({ name: 'B2' });
    const empty = createProject(brand.id, 'Empty', emptyBrief());
    expect((await runContentProject(empty.id, { settings })).reason).toBe('Write the idea in the brief first.');
    const p = newProject();
    expect((await runContentProject(p.id, { settings: {} })).reason).toMatch(/output folder/i);
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });

  it('says why when Jose refuses the plan', async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce({ ok: false, reason: 'plan_rejected', problems: ['x is wrong.'] } as never);
    expect(await runContentProject(p.id, { settings })).toEqual({ ok: false, requestId: null, reason: "Jose couldn't run it: x is wrong." });
  });
});

describe('runContentStep', () => {
  it("submits just that step's agents, with the exact task types", async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok() as never);
    await runContentStep(p.id, 'research', { settings });
    const args = submitted();
    expect(args.source).toBe('content-factory');
    expect(args.steps.map((s: any) => [s.agent, s.actionType])).toEqual([['hector', 'research_virality'], ['nova', 'analysis_market']]);
    expect(args.steps.every((s: any) => s.contentStep.step === 'research' && !s.waitFor && s.needs.length === 0)).toBe(true);
    expect(getProject(p.id)!.joseRequestId).toBe('jose-request-c1');
  });

  it('adds the reason the step was sent back with', async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok() as never);
    await runContentStep(p.id, 'script', { settings, extraTask: 'The user sent the last version back: shorter' });
    expect(submitted().steps[0].contentStep.task).toContain('shorter');
  });

  it("fails the step with the agent's reason when one agent fails", async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok({ failedCount: 1, executionReceipts: [{ agent: 'nova', status: 'failed', reason: 'Nova could not answer.' }] }) as never);
    const result = await runContentStep(p.id, 'research', { settings });
    expect(result.steps.research).toMatchObject({ status: 'failed', error: 'Nova could not answer.' });
  });

  it('waits for approval when Jose holds a task for you', async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok({ pendingApprovalCount: 1 }) as never);
    const result = await runContentStep(p.id, 'research', { settings });
    expect(result.steps.research).toMatchObject({ status: 'needs_approval', error: WAITING_FOR_APPROVAL });
  });

  it('does not run without an output folder, or without the idea', async () => {
    const p = newProject();
    expect((await runContentStep(p.id, 'research', { settings: {} })).steps.research.status).toBe('failed');
    const brand = saveBrand({ name: 'B2' });
    const empty = createProject(brand.id, 'Empty', emptyBrief());
    expect((await runContentStep(empty.id, 'research', { settings })).steps.research.error).toBe('Write the idea in the brief first.');
    expect(submitStepsToJose).not.toHaveBeenCalled();
  });

  it('every AI step has agents; the brief has none', () => {
    expect(STEP_AGENTS.brief).toEqual([]);
    for (const step of ['research', 'script', 'review', 'scenes', 'thumbnail', 'campaign', 'quality'] as const) {
      expect(STEP_AGENTS[step].length).toBeGreaterThan(0);
    }
  });

  // Found in the real app (2026-10-22): Jose's bus refused every step, because
  // the task text said "nothing is published" and one task type contained
  // "post". Every factory task must pass the real gates.
  it("every factory task passes Jose's execution gates", () => {
    for (const [step, agents] of Object.entries(STEP_AGENTS)) {
      for (const { agent, actionType } of agents) {
        const gate = canExecutePacket({ toAgent: agent, actionType, commandPreview: CONTENT_TASK_PREVIEW, status: 'queued', requiresApproval: false } as never);
        expect(gate, `${step} ${agent} ${actionType}`).toEqual({ ok: true, reason: null });
      }
    }
  });
});

describe('approveContentStep', () => {
  it('approving the review carries the request on to Scenes', async () => {
    const p = newProject();
    vi.mocked(submitStepsToJose).mockResolvedValueOnce(ok({ pendingApprovalCount: 1 }) as never);
    await runContentProject(p.id, { settings });
    markStepStatus(p.id, 'review', 'needs_approval', null);
    vi.mocked(getJoseRequest).mockReturnValue({ id: 'jose-request-c1', status: 'waiting_approval', steps: [{ stepId: 'scenes', status: 'waiting_approval', waitFor: REVIEW_WAIT }] } as never);
    const result = await approveContentStep(p.id, 'review');
    expect(result.steps.review.status).toBe('approved');
    expect(approveRequestStep).toHaveBeenCalledWith('jose-request-c1', 'scenes');
  });

  it('when nothing waits, only the status changes', async () => {
    const p = newProject();
    markStepStatus(p.id, 'quality', 'needs_approval', null);
    const result = await approveContentStep(p.id, 'quality');
    expect(result.steps.quality.status).toBe('approved');
    expect(approveRequestStep).not.toHaveBeenCalled();
  });
});
