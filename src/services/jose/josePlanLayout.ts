// Where each box of a plan map goes (phase 3). A plan is layered by
// construction (each step runs after the steps it needs), so the columns are
// buildStepWaves() and no graph-layout library is needed.
import { buildStepWaves, type PlanStep } from './stepGraph';

export interface PlanLayout {
  nodes: { stepId: string; col: number; row: number; x: number; y: number }[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
}

export const DEFAULT_BOX = { width: 168, height: 64, gapX: 48, gapY: 20 };

export function layoutPlan(steps: PlanStep[], box = DEFAULT_BOX): PlanLayout {
  let waves: string[][];
  let drawEdges = true;
  try {
    waves = buildStepWaves(steps);
  } catch {
    // A plan that breaks the rules (a cycle) is drawn as a plain list.
    waves = [steps.map((s) => s.stepId)];
    drawEdges = false;
  }
  const nodes = waves.flatMap((wave, col) => wave.map((stepId, row) => ({
    stepId, col, row, x: col * (box.width + box.gapX), y: row * (box.height + box.gapY),
  })));
  const known = new Set(steps.map((s) => s.stepId));
  const edges = drawEdges
    ? steps.flatMap((s) => s.needs.filter((need) => known.has(need)).map((need) => ({ from: need, to: s.stepId })))
    : [];
  const cols = Math.max(1, waves.length);
  const rows = Math.max(1, ...waves.map((w) => w.length));
  return {
    nodes,
    edges,
    width: cols * box.width + (cols - 1) * box.gapX,
    height: rows * box.height + (rows - 1) * box.gapY,
  };
}
