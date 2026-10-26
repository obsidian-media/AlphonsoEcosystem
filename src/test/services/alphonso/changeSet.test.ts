// Agent phase 6: a change set says exactly what changes before anything is written.
import { describe, it, expect } from 'vitest';
import { classifyFile, classifyCommand, previewNeeds, describeCodeChange } from '../../../services/alphonso/changeSet';
import type { CodePreview } from '../../../services/alphonso/types';

const place = { kind: 'project' as const, name: 'shop', folder: 'D:/shop', root: 'D:/shop', prefix: '' };
const preview = (files: any[], commands: any[]): CodePreview => ({
  place, plan: 'p', title: 't', files, commands, dropped: [], model: 'm', preparedAtMs: 1,
});

describe('changeSet', () => {
  it('a new file counts its lines', () => {
    const f = classifyFile('a.js', 'one\ntwo\n', null);
    expect(f).toMatchObject({ path: 'a.js', status: 'new', added: 2, removed: 0 });
    expect(f.before).toBeUndefined();
  });

  it('a changed file has its counts, first differing lines and the old content hash', () => {
    const f = classifyFile('a.js', 'one\nTWO\nthree\nfour', 'one\ntwo\nthree');
    expect(f).toMatchObject({ status: 'changed', added: 2, removed: 1, before: 'one\ntwo\nthree' });
    expect(f.firstDiff).toEqual(['- two', '+ TWO', '+ four']);
    expect(f.beforeHash).toBe(classifyFile('x', 'y', 'one\ntwo\nthree').beforeHash);
    expect(classifyFile('a.js', 'same', 'same')).toMatchObject({ added: 0, removed: 0 });
  });

  it('commands are rated by the existing risk check', () => {
    expect(classifyCommand('npm', ['run', 'test'], 'runs the tests')).toMatchObject({ readOnly: false, deletes: false, why: 'runs the tests' });
    expect(classifyCommand('git', ['status'], 'see changes')).toMatchObject({ readOnly: true, deletes: false });
    expect(classifyCommand('git', ['reset', '--hard'], 'x')).toMatchObject({ deletes: true });
  });

  it('what the change needs your approval for', () => {
    const newFile = classifyFile('a.js', 'x', null);
    const changed = classifyFile('b.js', 'y', 'z');
    expect(previewNeeds(preview([newFile], [classifyCommand('git', ['status'], '')]))).toEqual([]);
    expect(previewNeeds(preview([changed], []))).toEqual(['change_project']);
    expect(previewNeeds(preview([newFile], [classifyCommand('npm', ['run', 'test'], '')]))).toEqual(['run']);
    expect(previewNeeds(preview([], [classifyCommand('git', ['clean', '-fd'], '')]))).toEqual(['run', 'delete']);
  });

  it('one line says what changes', () => {
    const files = [
      { ...classifyFile('src/App.tsx', 'x', 'y'), added: 12, removed: 3 },
      { ...classifyFile('src/index.css', 'a', 'b'), added: 4, removed: 0 },
      classifyFile('src/new.ts', 'n', null),
    ];
    expect(describeCodeChange(preview(files, [classifyCommand('npm', ['run', 'test'], '')])))
      .toBe('Change 2 files in shop (src/App.tsx +12 −3, src/index.css +4), add 1, then run: npm run test');
    expect(describeCodeChange(preview([classifyFile('hello.js', 'x', null)], [])))
      .toBe('Add 1 file in shop (hello.js)');
  });
});
