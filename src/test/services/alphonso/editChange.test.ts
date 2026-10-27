// Agent roles Part C2: you can edit Alphonso's change on the board before approving it; what you
// save is what gets written, marked "edited by you".
import { describe, it, expect, beforeEach, vi } from 'vitest';

const disk: Record<string, string> = {};
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    const k = `${args.workspaceRoot}/${args.relativePath}`;
    if (cmd === 'read_workspace_file') {
      if (!(k in disk)) throw new Error('not found');
      return { content: disk[k] };
    }
    if (cmd === 'write_workspace_text_file') { disk[k] = args.content; return { ok: true }; }
    return null;
  }),
}));

import { editCodeFile, EDIT_TOO_LATE } from '../../../services/alphonso/editChange';
import { applyChangeSet } from '../../../services/alphonso/runCode';
import { classifyFile, describeCodeChange } from '../../../services/alphonso/changeSet';
import { createJoseRequest, getJoseRequest, updateJoseStep } from '../../../services/jose/joseRequestStore';

const place = { kind: 'project' as const, name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' };
const preview = () => ({
  place, plan: 'Fix the title.', title: 'Title', files: [classifyFile('src/App.tsx', 'title = "Shop"\nprice = 1', 'title = "Shp"\nprice = 1')],
  commands: [], dropped: [], model: '', preparedAtMs: 1,
});

function seed(status = 'waiting_approval') {
  const r = createJoseRequest({ commandId: 'c1', source: 'user', text: 'Fix the title in shop', kind: 'normal',
    steps: [{ stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['change_project'], needs: [] }] } as never);
  updateJoseStep(r.id, 'build', { status, codePreview: preview() } as never);
  return r.id;
}

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(disk)) delete disk[k];
  disk['D:/shop/src/App.tsx'] = 'title = "Shp"\nprice = 1';
});

describe('editCodeFile', () => {
  it('keeps your edit, with its lines recounted and the mark', () => {
    const id = seed();
    expect(editCodeFile(id, 'build', 'src/App.tsx', 'title = "My Shop"\nprice = 2\nshipping = 0')).toEqual({ ok: true });
    const p: any = getJoseRequest(id)!.steps[0].codePreview;
    expect(p.edited).toBe(true);
    expect(p.files[0]).toMatchObject({ content: 'title = "My Shop"\nprice = 2\nshipping = 0', editedByYou: true, added: 3, removed: 2 });
    expect(p.files[0].beforeHash).toBe(preview().files[0].beforeHash);
    expect(describeCodeChange(p)).toContain('(edited by you)');
  });

  it('what gets written is the edit', async () => {
    const id = seed();
    editCodeFile(id, 'build', 'src/App.tsx', 'title = "My Shop"\nprice = 1');
    const out = await applyChangeSet(getJoseRequest(id)!.steps[0].codePreview as never);
    expect(out.written).toEqual(['src/App.tsx']);
    expect(disk['D:/shop/src/App.tsx']).toBe('title = "My Shop"\nprice = 1');
  });

  it('an edited file that changed on disk since the preview is still refused', async () => {
    const id = seed();
    editCodeFile(id, 'build', 'src/App.tsx', 'title = "My Shop"\nprice = 1');
    disk['D:/shop/src/App.tsx'] = 'someone else changed this';
    const out = await applyChangeSet(getJoseRequest(id)!.steps[0].codePreview as never);
    expect(out.refused).toEqual([{ path: 'src/App.tsx', reason: 'it changed since the preview' }]);
    expect(disk['D:/shop/src/App.tsx']).toBe('someone else changed this');
  });

  it('only while it waits for you, and only a file in the change', () => {
    const done = seed('done');
    expect(editCodeFile(done, 'build', 'src/App.tsx', 'x')).toEqual({ ok: false, reason: EDIT_TOO_LATE });
    localStorage.clear();
    const id = seed();
    expect(editCodeFile(id, 'build', 'src/Other.tsx', 'x').ok).toBe(false);
  });
});
