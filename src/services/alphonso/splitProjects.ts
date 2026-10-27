// One request, several projects (agent roles Part C2, owner 2026-10-26): "update the footer in shop
// and blog" gets one Alphonso code step per project, each with its own preview, approval and lock.
// Applied to every plan (Jose's own and given steps) before Sentinel's checks are added.
import type { PlanStep } from '../jose/stepGraph';
import { isAlphonsoCodeStep } from './codeStep';
import { projectsNamedIn } from './projects';

export function splitPerProject(steps: PlanStep[], request: string): PlanStep[] {
  const projects = projectsNamedIn(request);
  if (projects.length < 2) return steps;
  const code = steps.filter((s) => isAlphonsoCodeStep(s) && !s.project);
  if (!code.length || steps.some((s) => isAlphonsoCodeStep(s) && s.project)) return steps;
  // As many code steps as projects: the planner already split the work; give each its project in order.
  if (code.length === projects.length) {
    return steps.map((s) => {
      const i = code.indexOf(s);
      return i < 0 ? s : { ...s, project: projects[i].name };
    });
  }
  if (code.length !== 1) return steps;
  const original = code[0];
  // Each copy gets the next id not already in the plan, so two steps never share one.
  const taken = new Set(steps.map((x) => x.stepId));
  const freeId = (): string => {
    let n = 2;
    while (taken.has(`${original.stepId}-${n}`)) n += 1;
    const id = `${original.stepId}-${n}`;
    taken.add(id);
    return id;
  };
  const copies = projects.map((project, i) => ({
    ...original,
    stepId: i === 0 ? original.stepId : freeId(),
    project: project.name,
    instruction: `In ${project.name}: ${original.instruction || ''}`.trim(),
    needs: [...original.needs],
  }));
  const ids = copies.map((c) => c.stepId);
  return steps.flatMap((s) => {
    if (s === original) return copies;
    if (!s.needs.includes(original.stepId)) return [s];
    return [{ ...s, needs: [...s.needs.filter((id) => id !== original.stepId), ...ids] }];
  });
}
