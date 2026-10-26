// Agent phase 6: a code step is prepared from your project and the earlier work, before it asks.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const llm = vi.fn();
const models: string[] = [];
vi.mock('../../../lib/ollama', () => ({
  generateAgentLlmResponse: (...a: unknown[]) => llm(...a),
  withAgentModel: async (_agent: string, model: string, fn: () => Promise<unknown>) => { models.push(model); return fn(); },
}));
const disk: Record<string, string> = {};
const dirs = new Set<string>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'list_project_files') {
      if (!dirs.has(args.workspaceRoot)) throw new Error('No such folder');
      const pre = `${args.workspaceRoot}/`;
      return { files: Object.keys(disk).filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)), truncated: false };
    }
    if (cmd === 'read_workspace_file') {
      const k = `${args.workspaceRoot}/${args.relativePath}`;
      if (!(k in disk)) throw new Error('not found');
      return { content: disk[k] };
    }
    if (cmd === 'list_workspace_directory') return { entries: [] };
    if (cmd === 'path_exists') return { exists: dirs.has(args.path), is_dir: dirs.has(args.path) };
    return null;
  }),
}));

import { prepareAlphonsoCode, ALPHONSO_NO_PLAN, WHICH_PROJECT, FOLDER_GONE, NEEDS_TO_KNOW } from '../../../services/alphonso/prepareCode';
import { saveProjects, NO_PROJECT } from '../../../services/alphonso/projects';
import { claimProject, busyLine } from '../../../services/alphonso/projectLock';
import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { setStepOutput } from '../../../services/jose/joseStepOutputs';

const say = (o: unknown) => ({ response: JSON.stringify(o) });
const code = (extra: Record<string, unknown> = {}) => say({ title: 'Dark mode', plan: 'Add a toggle.', files: [{ path: 'src/App.tsx', content: 'new app' }], commands: [{ program: 'npm', args: ['run', 'test'], why: 'check' }], ...extra });
const step = (extra: Record<string, unknown> = {}) => ({ stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [], ...extra });
const input = (extra: Record<string, unknown> = {}) => ({ instruction: '', request: 'x', needs: [], others: [], memory: '', review: null, skill: null, ...extra });
let n = 0;
function request(text: string, steps: any[] = [step()]) {
  n += 1;
  const commandId = `c${n}`;
  createJoseRequest({ commandId, source: 'user', text, kind: 'normal', steps } as never);
  return { commandId, requestId: `jose-request-${commandId}` };
}

beforeEach(() => {
  localStorage.clear();
  llm.mockReset();
  models.length = 0;
  for (const k of Object.keys(disk)) delete disk[k];
  dirs.clear();
  dirs.add('D:/shop'); dirs.add('D:/blog');
  disk['D:/shop/src/App.tsx'] = 'old app';
  disk['D:/shop/package.json'] = '{"scripts":{"test":"node test.js"}}';
  saveProjects([{ name: 'shop', folder: 'D:/shop' }, { name: 'blog', folder: 'D:/blog' }]);
});

describe('prepareAlphonsoCode', () => {
  it('the named project is used without asking the model where', async () => {
    llm.mockResolvedValueOnce(code());
    const r = request('In shop, add a dark mode toggle');
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(got.ok).toBe(true);
    if (got.ok !== true) return;
    expect(got.preview.place).toMatchObject({ kind: 'project', name: 'shop', folder: 'D:/shop' });
    expect(got.preview.files[0]).toMatchObject({ path: 'src/App.tsx', status: 'changed', before: 'old app' });
    expect(got.preview.commands[0]).toMatchObject({ program: 'npm', readOnly: false });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(String(llm.mock.calls[0][1].prompt)).toContain('package.json');
  });

  it('several projects and none named → choose', async () => {
    llm.mockResolvedValueOnce(say({ project: 'unknown' }));
    const r = request('Add a README');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never))
      .toEqual({ ok: false, outcome: 'choose', reason: WHICH_PROJECT(['shop', 'blog']), choices: ['shop', 'blog'] });
    expect(WHICH_PROJECT(['shop', 'blog'])).toBe('Which project: shop, blog?');
  });

  it('one project and the model says unknown → that project', async () => {
    saveProjects([{ name: 'shop', folder: 'D:/shop' }]);
    llm.mockResolvedValueOnce(say({ project: 'unknown' })).mockResolvedValueOnce(code());
    const r = request('Add a README');
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(got.ok && got.preview.place.name).toBe('shop');
  });

  it('a saved choice on the request step wins', async () => {
    llm.mockResolvedValueOnce(code({ files: [{ path: 'README.md', content: 'hi' }] }));
    const r = request('Add a README', [step({ project: 'blog' })]);
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(got.ok && got.preview.place.name).toBe('blog');
  });

  it('no project listed and the work needs one → setup', async () => {
    saveProjects([]);
    llm.mockResolvedValueOnce(say({ project: 'unknown' }));
    const r = request('Fix the login bug in my app');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never)).toEqual({ ok: false, outcome: 'setup', reason: NO_PROJECT });
  });

  it('a missing project folder waits for setup', async () => {
    dirs.delete('D:/shop');
    const r = request('In shop, add a toggle');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never))
      .toEqual({ ok: false, outcome: 'setup', reason: FOLDER_GONE('shop', 'D:/shop') });
  });

  it('a busy project → busy, with its folder', async () => {
    claimProject('D:/shop', 'someone-else');
    const r = request('In shop, add a toggle');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never))
      .toEqual({ ok: false, outcome: 'busy', reason: busyLine('shop'), folder: 'D:/shop' });
  });

  it('new code → a scratch place under the output folder', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ outputFolder: 'D:/out' }));
    llm.mockResolvedValueOnce(say({ project: 'new' })).mockResolvedValueOnce(code({ title: 'Rename photos', files: [{ path: 'rename.py', content: 'print(1)' }], commands: [] }));
    const r = request('Write a Python script that renames photos by date');
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(got.ok && got.preview.place).toMatchObject({ kind: 'new', root: 'D:/out', prefix: 'Alphonso/rename-photos/' });
    expect(got.ok && got.preview.files[0].status).toBe('new');
  });

  it('unsafe paths are dropped with a reason', async () => {
    llm.mockResolvedValueOnce(code({ files: [
      { path: '../x.js', content: 'a' }, { path: 'C:/x.js', content: 'b' }, { path: '.git/hooks/pre-commit', content: 'c' }, { path: 'ok.js', content: 'd' },
    ] }));
    const r = request('In shop, add things');
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(got.ok && got.preview.files.map((f) => f.path)).toEqual(['ok.js']);
    expect(got.ok && got.preview.dropped.map((d) => d.path)).toEqual(['../x.js', 'C:/x.js', '.git/hooks/pre-commit']);
    expect(got.ok && got.preview.dropped[0].reason).toBe('Outside the project folder.');
  });

  it('questions → failed with what he needs to know', async () => {
    llm.mockResolvedValueOnce(say({ questions: ['Which framework?'] }));
    const r = request('In shop, build it');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never))
      .toEqual({ ok: false, outcome: 'failed', reason: NEEDS_TO_KNOW(['Which framework?']) });
  });

  it('unreadable twice → ALPHONSO_NO_PLAN', async () => {
    llm.mockResolvedValue({ response: 'sure thing' });
    const r = request('In shop, add a toggle');
    expect(await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never)).toEqual({ ok: false, outcome: 'failed', reason: ALPHONSO_NO_PLAN });
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('the files he asks to read are read, then he writes', async () => {
    llm.mockResolvedValueOnce(say({ read: ['src/App.tsx'] })).mockResolvedValueOnce(code());
    const r = request('In shop, add a toggle');
    await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(String(llm.mock.calls[1][1].prompt)).toContain('old app');
  });

  it("the earlier steps' work (Miya's design) is in the prompt", async () => {
    llm.mockResolvedValueOnce(code());
    const r = request('In shop, build the design');
    await prepareAlphonsoCode(r.commandId, step(), r.requestId, input({ needs: [{ stepId: 'design', agent: 'miya', text: 'A blue header with a menu', files: [], sources: [], cut: 0, main: '' }] }) as never);
    expect(String(llm.mock.calls[0][1].prompt)).toContain('A blue header with a menu');
  });

  it('a fix round works in the same place, with his previous files', async () => {
    const r = request('In shop, add a toggle', [
      step({ codePreview: { place: { kind: 'project', name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' } } }),
      step({ stepId: 'build-fix-1', revises: 'build' }),
    ]);
    setStepOutput(r.commandId, 'build', 'alphonso', { summary: 'done', artifacts: [{ type: 'code_file', relativePath: 'src/App.tsx' }] } as never);
    llm.mockResolvedValueOnce(code());
    const got = await prepareAlphonsoCode(r.commandId, step({ stepId: 'build-fix-1', revises: 'build' }), r.requestId, input() as never);
    expect(got.ok && got.preview.place.name).toBe('shop');
    expect(String(llm.mock.calls[0][1].prompt)).toContain('old app');
  });

  it('the code model setting is used', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ alphonsoCodeModel: 'qwen2.5:7b' }));
    llm.mockResolvedValueOnce(code());
    const r = request('In shop, add a toggle');
    const got = await prepareAlphonsoCode(r.commandId, step(), r.requestId, input() as never);
    expect(models).toEqual(['qwen2.5:7b']);
    expect(got.ok && got.preview.model).toBe('qwen2.5:7b');
  });
});
