// Agent phase 6: the folder an Alphonso step worked in, for whoever reads his files.
import { describe, it, expect, beforeEach } from 'vitest';
import { createJoseRequest } from '../../../services/jose/joseRequestStore';
import { stepFolder, reviewedFolder } from '../../../services/alphonso/stepFolder';

const place = { kind: 'new', name: 'hello', folder: 'D:/out/Alphonso/hello', root: 'D:/out', prefix: 'Alphonso/hello/' };

beforeEach(() => {
  localStorage.clear();
  createJoseRequest({ commandId: 'c1', source: 'user', text: 'x', kind: 'normal', steps: [
    { stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [], codePreview: { place } },
    { stepId: 'build-fix-1', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [], revises: 'build' },
    { stepId: 'check', agent: 'maria', actionType: 'audit_quality', effects: ['read'], needs: ['build'], reviewOf: 'build' },
  ] } as never);
});

describe('stepFolder', () => {
  it("the step's own place root, else the step it revises", () => {
    expect(stepFolder('c1', 'build')).toBe('D:/out');
    expect(stepFolder('c1', 'build-fix-1')).toBe('D:/out');
    expect(stepFolder('c1', 'check')).toBeNull();
    expect(stepFolder('nope', 'build')).toBeNull();
  });

  it('a review reads the folder of the work it reviews', () => {
    expect(reviewedFolder('c1', { reviewOf: 'build' })).toBe('D:/out');
    expect(reviewedFolder('c1', { needs: ['build-fix-1'] })).toBe('D:/out');
    expect(reviewedFolder('c1', {})).toBeNull();
  });
});
