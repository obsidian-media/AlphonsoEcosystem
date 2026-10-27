// Agent roles Part C2: a request naming two or more of your projects gets one Alphonso step per project.
import { describe, it, expect, beforeEach } from 'vitest';
import { saveProjects, projectsNamedIn } from '../../../services/alphonso/projects';
import { splitPerProject } from '../../../services/alphonso/splitProjects';
import { addSecurityChecks } from '../../../services/sentinel/addSecurityChecks';
import { checkPlan, type PlanStep } from '../../../services/jose/stepGraph';
import { claimProject } from '../../../services/alphonso/projectLock';

const shop = { name: 'shop', folder: 'D:\\code\\shop' };
const blog = { name: 'blog', folder: 'D:\\code\\blog' };
const admin = { name: 'shop-admin', folder: 'D:\\code\\shop-admin' };
const s = (stepId: string, agent: string, actionType: string, effects: string[], needs: string[] = [], extra: Partial<PlanStep> = {}): PlanStep =>
  ({ stepId, agent, actionType, effects, needs, instruction: 'Change the footer.', ...extra }) as PlanStep;

beforeEach(() => localStorage.clear());

describe('projectsNamedIn', () => {
  it('finds every project named, a longer name not counted twice', () => {
    saveProjects([shop, blog, admin]);
    expect(projectsNamedIn('fix shop-admin and shop').map((p) => p.name)).toEqual(['shop-admin', 'shop']);
    expect(projectsNamedIn('fix shop-admin').map((p) => p.name)).toEqual(['shop-admin']);
    // A project name inside another word is not that project.
    expect(projectsNamedIn('fix the workshop and blogger page').map((p) => p.name)).toEqual([]);
    expect(projectsNamedIn('Update the footer in shop and blog').map((p) => p.name).sort()).toEqual(['blog', 'shop']);
  });
});

describe('splitPerProject', () => {
  it('one code step becomes one per project, and what needed it needs them all', () => {
    saveProjects([shop, blog]);
    const steps = splitPerProject([
      s('alphonso', 'alphonso', 'local_operation', ['run']),
      s('maria', 'maria', 'audit_code', ['read'], ['alphonso'], { reviewOf: 'alphonso' }),
    ], 'Update the footer in shop and blog');
    const code = steps.filter((x) => x.agent === 'alphonso');
    expect(code.map((x) => [x.stepId, x.project, x.instruction])).toEqual([
      ['alphonso', 'shop', 'In shop: Change the footer.'],
      ['alphonso-2', 'blog', 'In blog: Change the footer.'],
    ]);
    expect(steps.find((x) => x.stepId === 'maria')!.needs).toEqual(['alphonso', 'alphonso-2']);
    const secured = addSecurityChecks(steps, 'Update the footer in shop and blog').steps;
    expect(secured.filter((x) => x.agent === 'sentinel').map((x) => x.reviewOf)).toEqual(['alphonso', 'alphonso-2']);
    expect(checkPlan(secured, { taskTypes: true }).ok).toBe(true);
  });

  it('as many code steps as projects: each gets its project in order', () => {
    saveProjects([shop, blog]);
    const steps = splitPerProject([s('a', 'alphonso', 'local_operation', ['run']), s('b', 'alphonso', 'local_operation', ['run'], ['a'])], 'Update shop and blog');
    expect(steps.map((x) => x.project)).toEqual(['shop', 'blog']);
  });

  it('one project, or none, changes nothing', () => {
    saveProjects([shop, blog]);
    const one = [s('alphonso', 'alphonso', 'local_operation', ['run'])];
    expect(splitPerProject(one, 'Update the footer in shop')).toEqual(one);
    expect(splitPerProject(one, 'Update the footer')).toEqual(one);
  });

  it('each project gets its own lock', () => {
    expect(claimProject(shop.folder, 'r1')).toEqual({ ok: true });
    expect(claimProject(blog.folder, 'r1')).toEqual({ ok: true });
    expect(claimProject(shop.folder, 'r2').ok).toBe(false);
  });
});
