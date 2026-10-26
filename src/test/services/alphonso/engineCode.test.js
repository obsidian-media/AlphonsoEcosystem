// Agent phase 6: Jose runs Alphonso's code steps through the prepared change set.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({ response: '{}' })),
  fetchOllamaModels: vi.fn(async () => ({ models: [] })),
  PREFERRED_MODEL: 'llama3.2:3b',
  getConfiguredOllamaModel: () => 'llama3.2:3b',
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
  generateAgentLlmResponse: vi.fn(async () => ({ response: JSON.stringify({ verdict: 'safe', summary: 'Nothing risky.', findings: [] }) })),
  withAgentModel: async (_a, _m, fn) => fn(),
  getAgentModelOverride: () => null,
}));
vi.mock('../../../services/verificationService', () => ({
  verifyOllamaRuntimeProof: vi.fn(async () => ({ id: 'r', payload: { reachable: true } })),
  verifyProcessProof: vi.fn(async () => ({ id: 'p', payload: [] })),
  verifyCommandExecution: vi.fn(async () => ({ payload: { success: true, exitCode: 0, stdout: '', stderr: '' } })),
}));
const prepared = [];
vi.mock('../../../services/alphonso/prepareCode', async (orig) => ({
  ...(await orig()),
  prepareAlphonsoCode: vi.fn(async () => prepared.shift()),
}));
vi.mock('../../../services/alphonso/runCode', async (orig) => ({
  ...(await orig()),
  runAlphonsoCode: vi.fn(async (commandId, assignment, preview) => {
    const { releaseProject } = await import('../../../services/alphonso/projectLock');
    releaseProject(preview.place.folder, `jose-request-${commandId}`);
    return { summary: `Wrote ${preview.files.length} files in ${preview.place.name}.`, resultState: 'completed', resultUrl: null, sources: [], contractAction: assignment.actionType, artifacts: preview.files.map((f) => ({ type: 'code_file', relativePath: f.path, status: f.status })) };
  }),
}));

import { runJoseCommandExecutionPipeline, approveRequestStep, rejectRequestStep, carryOnRequest, pickAlphonsoProject } from '../../../services/joseExecutionEngineService';
import { getJoseRequest } from '../../../services/jose/joseRequestStore';
import { getStepOutput } from '../../../services/jose/joseStepOutputs';
import { prepareAlphonsoCode } from '../../../services/alphonso/prepareCode';
import { runAlphonsoCode } from '../../../services/alphonso/runCode';
import { classifyCommand, classifyFile } from '../../../services/alphonso/changeSet';
import { claimProject, projectHolder, releaseProject } from '../../../services/alphonso/projectLock';
import { saveProjects } from '../../../services/alphonso/projects';

const place = { kind: 'project', name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' };
const preview = (files, commands = []) => ({ place, plan: 'p', title: 't', files, commands, dropped: [], model: '', preparedAtMs: 1 });
const changed = () => preview([classifyFile('src/App.tsx', 'new', 'old')], [classifyCommand('npm', ['run', 'test'], 'check')]);
const newOnly = () => preview([classifyFile('hello.js', 'x', null)], [classifyCommand('git', ['status'], 'look')]);
const codeStep = (extra = {}) => ({
  agent: 'alphonso', actionType: 'local_operation', stepId: 'build', title: 'Build', rationale: 't', riskLevel: 'high',
  requiresApproval: false, commandPreview: 'code', fragments: [], effects: ['run'], needs: [], ...extra,
});
const run = (text = 'In shop, add a toggle', assignments = [codeStep()]) =>
  runJoseCommandExecutionPipeline({ commandText: text, source: 'test', zeroCostMode: true, assignments });
const stepOf = (result) => getJoseRequest(`jose-request-${result.commandId}`).steps.find((s) => s.stepId === 'build');

beforeEach(() => {
  localStorage.clear();
  prepared.length = 0;
  vi.mocked(prepareAlphonsoCode).mockClear();
  vi.mocked(runAlphonsoCode).mockClear();
  saveProjects([{ name: 'shop', folder: 'D:/shop' }, { name: 'blog', folder: 'D:/blog' }]);
});

describe("Alphonso's code steps", () => {
  it('a code step is prepared before its gate and waits with the change line', async () => {
    prepared.push({ ok: true, preview: changed() });
    const result = await run();
    const step = stepOf(result);
    expect(step.status).toBe('waiting_approval');
    expect(step.codePreview.files[0].path).toBe('src/App.tsx');
    expect(step.folder).toBe('D:/shop');
    expect(step.project).toBe('shop');
    expect(step.note).toBe('Change 1 file in shop (src/App.tsx +1 −1), then run: npm run test');
    expect(runAlphonsoCode).not.toHaveBeenCalled();
    await approveRequestStep(`jose-request-${result.commandId}`, 'build');
    expect(runAlphonsoCode).toHaveBeenCalledTimes(1);
    expect(prepareAlphonsoCode).toHaveBeenCalledTimes(1);
    expect(getStepOutput(result.commandId, 'build').summary).toBe('Wrote 1 files in shop.');
  });

  it('new files only and read-only commands → no wait, applied and reported', async () => {
    prepared.push({ ok: true, preview: newOnly() });
    const result = await run();
    expect(stepOf(result).status).toBe('done');
    expect(runAlphonsoCode).toHaveBeenCalledTimes(1);
    expect(getStepOutput(result.commandId, 'build').summary).not.toMatch(/Runtime reachable/);
  });

  it('several projects → setup_needed with choices; picking one carries it on', async () => {
    prepared.push({ ok: false, outcome: 'choose', reason: 'Which project: shop, blog?', choices: ['shop', 'blog'] });
    const result = await run('Add a README');
    const step = stepOf(result);
    expect(step.status).toBe('setup_needed');
    expect(step.projectChoices).toEqual(['shop', 'blog']);
    expect(step.error).toBe('Which project: shop, blog?');
    prepared.push({ ok: true, preview: { ...newOnly(), place: { ...place, name: 'blog', folder: 'D:/blog', root: 'D:/blog' } } });
    const picked = await pickAlphonsoProject(`jose-request-${result.commandId}`, 'build', 'blog');
    expect(picked.ok).toBe(true);
    const after = stepOf(result);
    expect(after.project).toBe('blog');
    expect(vi.mocked(prepareAlphonsoCode).mock.calls[1][1]).toMatchObject({ stepId: 'build' });
    expect(after.status).toBe('done');
  });

  it('a busy project waits and carries on when released', async () => {
    claimProject('D:/shop', 'other-request');
    prepared.push({ ok: false, outcome: 'busy', reason: 'Waiting: shop is busy with another request.', folder: 'D:/shop' });
    const result = await run();
    expect(stepOf(result).status).toBe('setup_needed');
    expect(stepOf(result).waitingForFolder).toBe('D:/shop');
    prepared.push({ ok: true, preview: newOnly() });
    releaseProject('D:/shop', 'other-request');
    await vi.waitFor(() => expect(stepOf(result).status).toBe('done'));
  });

  it('rejecting a code step writes nothing and frees the project', async () => {
    prepared.push({ ok: true, preview: changed() });
    const result = await run();
    claimProject('D:/shop', `jose-request-${result.commandId}`);
    rejectRequestStep(`jose-request-${result.commandId}`, 'build');
    expect(runAlphonsoCode).not.toHaveBeenCalled();
    expect(projectHolder('D:/shop')).toBeNull();
  });

  it('carry on reuses the saved preview', async () => {
    prepared.push({ ok: true, preview: changed() });
    const result = await run();
    const { setJoseRequestStatus } = await import('../../../services/jose/joseRequestStore');
    setJoseRequestStatus(`jose-request-${result.commandId}`, 'interrupted');
    await carryOnRequest(`jose-request-${result.commandId}`);
    expect(prepareAlphonsoCode).toHaveBeenCalledTimes(1);
    expect(stepOf(result).status).toBe('waiting_approval');
  });

  it('a failed preparation ends the step with its reason and asks nothing', async () => {
    prepared.push({ ok: false, outcome: 'failed', reason: "Alphonso's model didn't give a change he could use." });
    const result = await run();
    expect(stepOf(result).status).toBe('failed');
    expect(result.pendingApprovalCount).toBe(0);
  });

  it('a failed code step is not retried: its fix rounds already ran', async () => {
    prepared.push({ ok: true, preview: newOnly() });
    vi.mocked(runAlphonsoCode).mockResolvedValueOnce({ summary: 'npm run test: failed: 1 test failed', resultState: 'failed', resultUrl: null, sources: [], contractAction: 'local_operation', artifacts: [] });
    const result = await run();
    expect(runAlphonsoCode).toHaveBeenCalledTimes(1);
    expect(stepOf(result).status).toBe('failed');
  });

  it('a help request ends the step with a HELP line for Jose', async () => {
    prepared.push({ ok: false, outcome: 'help', reason: 'the docs for the payments library' });
    const result = await run();
    expect(getStepOutput(result.commandId, 'build').summary).toBe('HELP: the docs for the payments library');
  });
});
