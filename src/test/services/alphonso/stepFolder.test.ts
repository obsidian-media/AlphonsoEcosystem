// Agent phase 6: the folder an Alphonso step worked in, for whoever reads his files.
import { describe, it, expect, beforeEach } from 'vitest';
import { createJoseRequest, createWaitingPlanRequest, attachRunToRequest } from '../../../services/jose/joseRequestStore';
import { stepFolder, reviewedFolder, readingFolder } from '../../../services/alphonso/stepFolder';
import { saveProjects } from '../../../services/alphonso/projects';

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
  it('finds the folder in a plan you approved first (final review)', () => {
    const steps = [{ stepId: 'build', agent: 'alphonso', actionType: 'local_operation', effects: ['run'], needs: [], codePreview: { place: { ...place, root: 'D:/plan' } } }];
    const waiting = createWaitingPlanRequest({ text: 'x', source: 'user', kind: 'normal', steps, plan: { source: 'fresh' }, runOptions: { source: 'user' } } as never);
    attachRunToRequest(waiting.id, { commandId: 'c-plan', steps } as never);
    expect(stepFolder('c-plan', 'build')).toBe('D:/plan');
  });

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

// Agent roles Part C2: explaining code and summarising a file read from your project.
describe('readingFolder', () => {
  const shop = { name: 'shop', folder: 'D:\code\shop' };
  const blog = { name: 'blog', folder: 'D:\code\blog' };
  const explain = { agent: 'alphonso', actionType: 'assistant_explain_code' };

  it('is the project the request names', () => {
    saveProjects([shop, blog]);
    expect(readingFolder(explain, 'Explain how src/cart.ts works in shop')).toBe(shop.folder);
  });

  it('is the only project when just one is saved', () => {
    saveProjects([blog]);
    expect(readingFolder({ ...explain, actionType: 'assistant_summarize' }, 'Summarise notes/plan.md')).toBe(blog.folder);
  });

  it('is none with several projects and none named, and never for other steps', () => {
    saveProjects([shop, blog]);
    expect(readingFolder(explain, 'Explain the cart code')).toBeNull();
    expect(readingFolder({ agent: 'alphonso', actionType: 'local_operation' }, 'fix shop')).toBeNull();
    expect(readingFolder({ agent: 'maria', actionType: 'assistant_explain_code' }, 'shop')).toBeNull();
  });
});
