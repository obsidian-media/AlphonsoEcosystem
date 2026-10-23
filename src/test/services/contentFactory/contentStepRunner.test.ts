import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/joseExecutionEngineService', () => ({
  runJoseCommandExecutionPipeline: vi.fn(),
}));
vi.mock('../../../services/agentOutputStoreService', () => ({
  getAllAgentOutputs: vi.fn(() => ({})),
}));
vi.mock('../../../services/contentFactory/contentProjectFiles', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/contentProjectFiles')>('../../../services/contentFactory/contentProjectFiles');
  return { ...actual, writeProjectFile: vi.fn(async () => undefined), writeStepText: vi.fn(async () => 'x/v1.md') };
});
vi.mock('../../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));
vi.mock('../../../services/contentFactory/contentImages', () => ({
  renderScenePictures: vi.fn(async () => []),
  renderThumbnails: vi.fn(async () => []),
}));

import { runJoseCommandExecutionPipeline } from '../../../services/joseExecutionEngineService';
import { getAllAgentOutputs } from '../../../services/agentOutputStoreService';
import { writeProjectFile } from '../../../services/contentFactory/contentProjectFiles';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, saveStepVersion } from '../../../services/contentFactory/contentProjectService';
import { runContentStep, STEP_AGENTS, CONTENT_TASK_PREVIEW } from '../../../services/contentFactory/contentStepRunner';
import { canExecutePacket } from '../../../services/agentBusService';
import { renderScenePictures, renderThumbnails } from '../../../services/contentFactory/contentImages';

const settings = { outputFolder: 'D:\\Content' };
const output = (data: unknown) => ({ summary: 'ok', resultState: 'completed', artifacts: [{ type: 'content_step_output', data }] });

function newProject() {
  const brand = saveBrand({ name: 'My brand' });
  return createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'Why we wait' });
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(runJoseCommandExecutionPipeline).mockReset();
  vi.mocked(getAllAgentOutputs).mockReset();
  vi.mocked(writeProjectFile).mockClear();
});

describe('runContentStep', () => {
  it('sends research to Hector and Nova through Jose with the exact task types', async () => {
    const p = newProject();
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({ ok: true, commandId: 'c1', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [] } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({ hector: output({ patterns: ['a'] }), nova: output({ angle: 'b' }) } as never);
    const result = await runContentStep(p.id, 'research', { settings });
    const args = vi.mocked(runJoseCommandExecutionPipeline).mock.calls[0][0] as { assignments: { agent: string; actionType: string; contentStep: { step: string } }[]; source: string };
    expect(args.source).toBe('content-factory');
    expect(args.assignments.map((a) => [a.agent, a.actionType])).toEqual([['hector', 'research_virality'], ['nova', 'analysis_market']]);
    expect(args.assignments.every((a) => a.contentStep.step === 'research')).toBe(true);
    const version = result.steps.research.versions[0];
    expect(version.output).toEqual({ hector: { patterns: ['a'] }, nova: { angle: 'b' } });
    expect(version.joseCommandId).toBe('c1');
    expect(result.steps.research.status).toBe('done');
    expect(writeProjectFile).toHaveBeenCalled();
  });

  it('fails the step with the agent\'s reason when one agent fails', async () => {
    const p = newProject();
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({
      ok: true, commandId: 'c2', failedCount: 1, pendingApprovalCount: 0,
      executionReceipts: [{ agent: 'nova', status: 'dead_letter', reason: "nova: The model's answer could not be read." }],
    } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({ hector: output({ patterns: ['a'] }) } as never);
    const result = await runContentStep(p.id, 'research', { settings });
    expect(result.steps.research.status).toBe('failed');
    expect(result.steps.research.error).toBe("nova: The model's answer could not be read.");
  });

  it('does not run without an output folder', async () => {
    const p = newProject();
    const result = await runContentStep(p.id, 'research', { settings: { outputFolder: '' } });
    expect(result.steps.research.status).toBe('failed');
    expect(result.steps.research.error).toBe('Choose an output folder in Settings first.');
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
  });

  it('gives the script step the chosen research', async () => {
    const p = newProject();
    saveStepVersion(p.id, 'research', { output: { hector: { patterns: ['fast cuts'] } }, summary: 'r', joseCommandId: null });
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({ ok: true, commandId: 'c3', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [] } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({ miya: output({ title: 'T' }) } as never);
    await runContentStep(p.id, 'script', { settings });
    const args = vi.mocked(runJoseCommandExecutionPipeline).mock.calls[0][0] as { assignments: { contentStep: { prior: Record<string, unknown> } }[] };
    expect(args.assignments[0].contentStep.prior.research).toEqual({ hector: { patterns: ['fast cuts'] } });
  });

  it('turns Jose\'s progress into plain messages', async () => {
    const p = newProject();
    vi.mocked(runJoseCommandExecutionPipeline).mockImplementation(async ({ onProgress }: never) => {
      (onProgress as (e: unknown) => void)({ stage: 'wave_start', wave: 0, agents: ['hector', 'nova'] });
      return { ok: true, commandId: 'c4', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [] } as never;
    });
    vi.mocked(getAllAgentOutputs).mockReturnValue({ hector: output({}), nova: output({}) } as never);
    const onProgress = vi.fn();
    await runContentStep(p.id, 'research', { settings, onProgress });
    const messages = getProject(p.id)!.steps.research.progress.map((m) => m.message);
    expect(messages).toContain('Hector is researching what goes viral…');
    expect(messages).toContain('Nova is checking the market…');
    expect(onProgress).toHaveBeenCalled();
  });

  it('waits for approval when Jose holds a task for the user', async () => {
    const p = newProject();
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({ ok: true, commandId: 'c5', failedCount: 0, pendingApprovalCount: 1, executionReceipts: [] } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({} as never);
    const result = await runContentStep(p.id, 'research', { settings });
    expect(result.steps.research.status).toBe('needs_approval');
    expect(result.steps.research.error).toBe('Waiting for your approval in the Approval panel.');
  });

  it('every AI step has agents; the brief has none', () => {
    expect(STEP_AGENTS.brief).toEqual([]);
    expect(STEP_AGENTS.quality.map((a) => a.agent)).toEqual(['maria', 'sentinel']);
  });

  it('makes the pictures after the scene and thumbnail plans', async () => {
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({ ok: true, commandId: 'c6', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [] } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({ miya: output({ style: 's', scenes: [] }) } as never);
    const p = newProject();
    await runContentStep(p.id, 'scenes', { settings });
    expect(renderScenePictures).toHaveBeenCalledWith(p.id, settings, expect.any(Function));
    await runContentStep(p.id, 'thumbnail', { settings });
    expect(renderThumbnails).toHaveBeenCalledWith(p.id, settings, expect.any(Function));
    vi.mocked(renderScenePictures).mockClear();
    await runContentStep(p.id, 'script', { settings });
    expect(renderScenePictures).not.toHaveBeenCalled();
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

  // Review finding 2026-10-22: the step said "Done" while ComfyUI was still
  // making the pictures, with no progress shown (a silent wait).
  it('stays running, with progress, until the pictures are made', async () => {
    vi.mocked(runJoseCommandExecutionPipeline).mockResolvedValue({ ok: true, commandId: 'c7', failedCount: 0, pendingApprovalCount: 0, executionReceipts: [] } as never);
    vi.mocked(getAllAgentOutputs).mockReturnValue({ miya: output({ style: 's', scenes: [] }) } as never);
    const p = newProject();
    let statusDuringPictures = '';
    vi.mocked(renderScenePictures).mockImplementationOnce(async () => {
      statusDuringPictures = getProject(p.id)!.steps.scenes.status;
      return [];
    });
    const result = await runContentStep(p.id, 'scenes', { settings });
    expect(statusDuringPictures).toBe('running');
    expect(result.steps.scenes.status).toBe('done');
  });

  it('asks for the idea first when the brief has none', async () => {
    const brand = saveBrand({ name: 'B2' });
    const p = createProject(brand.id, 'Empty', emptyBrief());
    const result = await runContentStep(p.id, 'research', { settings });
    expect(result.steps.research.status).toBe('failed');
    expect(result.steps.research.error).toBe('Write the idea in the brief first.');
    expect(runJoseCommandExecutionPipeline).not.toHaveBeenCalled();
  });
});
