// Agent phase 6: an approved change is applied exactly, checked, fixed within what you approved,
// and reported plainly.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const llm = vi.fn();
vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: (...a: unknown[]) => llm(...a),
  withAgentModel: async (_a: string, _m: string, fn: () => Promise<unknown>) => fn(),
}));
const disk: Record<string, string> = {};
const runs: { program: string; args: string[]; cwd: string }[] = [];
let exitCodes: number[] = [];
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'read_workspace_file') {
      const k = `${args.workspaceRoot}/${args.relativePath}`;
      if (!(k in disk)) throw new Error('not found');
      return { content: disk[k] };
    }
    if (cmd === 'write_workspace_text_file') { disk[`${args.workspaceRoot}/${args.relativePath}`] = args.content; return { ok: true }; }
    if (cmd === 'execute_command_verified') {
      runs.push({ program: args.program, args: args.args, cwd: args.cwd });
      const code = exitCodes.length ? exitCodes.shift()! : 0;
      return { success: code === 0, exit_code: code, stdout: 'out', stderr: code ? '1 test failed' : '' };
    }
    return null;
  }),
}));
const memory = vi.fn();
vi.mock('../../../services/unifiedMemoryService', async (orig) => ({ ...(await orig() as object), pushMemoryItem: (...a: unknown[]) => memory(...a) }));

import { applyChangeSet, runAlphonsoCode } from '../../../services/alphonso/runCode';
import { classifyCommand, classifyFile } from '../../../services/alphonso/changeSet';
import { claimProject, projectHolder } from '../../../services/alphonso/projectLock';
import { JOSE_LIMITS } from '../../../services/jose/stepGraph';
import type { CodePreview } from '../../../services/alphonso/types';

const place = { kind: 'project' as const, name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' };
const preview = (files = [classifyFile('src/App.tsx', 'new app', 'old app'), classifyFile('src/new.ts', 'n', null)], commands = [classifyCommand('npm', ['run', 'test'], 'check')]): CodePreview => ({
  place, plan: 'Add a toggle.', title: 'Toggle', files, commands, dropped: [], model: '', preparedAtMs: 1,
});
const assignment = { stepId: 'build', agent: 'alphonso', actionType: 'local_operation' };

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
  memory.mockReset();
  for (const k of Object.keys(disk)) delete disk[k];
  runs.length = 0;
  exitCodes = [];
  disk['D:/shop/src/App.tsx'] = 'old app';
});

describe('applying a change set', () => {
  it('writes only the approved content', async () => {
    const got = await applyChangeSet(preview());
    expect(got).toEqual({ written: ['src/App.tsx', 'src/new.ts'], refused: [] });
    expect(disk['D:/shop/src/App.tsx']).toBe('new app');
    expect(disk['D:/shop/src/new.ts']).toBe('n');
  });

  it('a file changed since the preview is not written', async () => {
    disk['D:/shop/src/App.tsx'] = 'someone else edited this';
    const got = await applyChangeSet(preview());
    expect(got.refused).toEqual([{ path: 'src/App.tsx', reason: 'it changed since the preview' }]);
    expect(disk['D:/shop/src/App.tsx']).toBe('someone else edited this');
  });

  it('a new scratch folder is written under the output folder', async () => {
    const p = { ...preview([classifyFile('hello.js', 'x', null)], []), place: { kind: 'new' as const, name: 'hello', folder: 'D:/out/Alphonso/hello', root: 'D:/out', prefix: 'Alphonso/hello/' } };
    await applyChangeSet(p);
    expect(disk['D:/out/Alphonso/hello/hello.js']).toBe('x');
  });
});

describe('runAlphonsoCode', () => {
  it('runs only the approved commands, in the project folder, and reports', async () => {
    claimProject('D:/shop', 'jose-request-c1');
    const r = await runAlphonsoCode('c1', assignment, preview(), null);
    expect(runs).toEqual([{ program: 'npm', args: ['run', 'test'], cwd: 'D:/shop' }]);
    expect(r.resultState).toBe('completed');
    expect(r.summary).toBe('Wrote 1 file in shop: src/new.ts. Changed src/App.tsx. npm run test: passed.');
    expect(r.summary).not.toMatch(/Runtime reachable|confidence/i);
    expect(r.artifacts).toEqual(expect.arrayContaining([
      { type: 'code_file', relativePath: 'src/App.tsx', status: 'changed' },
      { type: 'command_result', program: 'npm', args: ['run', 'test'], exitCode: 0, ok: true },
    ]));
    expect(projectHolder('D:/shop')).toBeNull();
    expect(memory).toHaveBeenCalledWith(expect.objectContaining({ title: 'Alphonso: Add a toggle. — 2 files, checks passed' }));
  });

  it('a failed check gets at most JOSE_LIMITS.maxFixRounds fix rounds', async () => {
    exitCodes = [1, 1, 1];
    llm.mockResolvedValue({ response: JSON.stringify({ files: [{ path: 'src/App.tsx', content: 'fixed app' }] }) });
    const r = await runAlphonsoCode('c1', assignment, preview(), null);
    expect(llm).toHaveBeenCalledTimes(JOSE_LIMITS.maxFixRounds);
    expect(runs).toHaveLength(JOSE_LIMITS.maxFixRounds + 1);
    expect(disk['D:/shop/src/App.tsx']).toBe('fixed app');
    expect(r.resultState).toBe('failed');
    expect(r.summary).toContain('npm run test: failed: 1 test failed');
  });

  it('a fix touching another existing file is not done and is reported', async () => {
    exitCodes = [1, 0];
    disk['D:/shop/src/other.ts'] = 'other';
    llm.mockResolvedValueOnce({ response: JSON.stringify({ files: [{ path: 'src/other.ts', content: 'changed' }, { path: 'src/App.tsx', content: 'fixed' }] }) });
    const r = await runAlphonsoCode('c1', assignment, preview(), null);
    expect(disk['D:/shop/src/other.ts']).toBe('other');
    expect(disk['D:/shop/src/App.tsx']).toBe('fixed');
    expect(r.summary).toContain('Needs your approval: change src/other.ts.');
    expect(r.resultState).toBe('completed');
  });

  it('no checks proposed → completed; a refused file → failed', async () => {
    const ok = await runAlphonsoCode('c1', assignment, preview(undefined, []), null);
    expect(ok.resultState).toBe('completed');
    disk['D:/shop/src/App.tsx'] = 'edited elsewhere';
    const bad = await runAlphonsoCode('c1', assignment, preview(undefined, []), null);
    expect(bad.resultState).toBe('failed');
    expect(bad.summary).toContain('src/App.tsx was not written: it changed since the preview.');
  });

  it('the lock is released even when something throws', async () => {
    claimProject('D:/shop', 'jose-request-c1');
    const broken = { ...preview(), files: null as never };
    await runAlphonsoCode('c1', assignment, broken, null).catch(() => undefined);
    expect(projectHolder('D:/shop')).toBeNull();
  });
});
