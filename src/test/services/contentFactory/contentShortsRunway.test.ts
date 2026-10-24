// Phase 4a: Runway clips in Shorts are asked for once per run, with the cost.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/contentFactory/runwayClip', async () => {
  const actual = await vi.importActual<typeof import('../../../services/contentFactory/runwayClip')>('../../../services/contentFactory/runwayClip');
  return {
    ...actual,
    runwayClipAvailable: () => ({ ok: true }),
    estimateRunwayUsd: (seconds: number[]) => seconds.length * 0.5,
  };
});

import { contentProjectPlanSteps, shortsRunwayEstimate, SHORTS_WAIT_PAID } from '../../../services/contentFactory/contentProjectPlan';
import { saveBrand } from '../../../services/contentFactory/contentBrandService';
import { createProject, emptyBrief, getProject, setShortsSettings } from '../../../services/contentFactory/contentProjectService';
import { checkPlan } from '../../../services/jose/stepGraph';

beforeEach(() => localStorage.clear());

function project(aiClips: 'main' | 'every' | 'none', engine: 'runway' | 'local' | null) {
  const brand = saveBrand({ name: 'Acme' });
  const p = createProject(brand.id, 'Launch', { ...emptyBrief(), idea: 'x', outputs: ['2 Shorts'] });
  setShortsSettings(p.id, { aiClips, clipEngine: engine });
  return { brand, p: getProject(p.id)! };
}

describe('Runway clips in Shorts', () => {
  it('estimates the clips for the Shorts asked for', () => {
    expect(shortsRunwayEstimate(project('main', 'runway').p)).toEqual({ clips: 4, shorts: 2, usd: 2 });
    expect(shortsRunwayEstimate(project('every', 'runway').p)).toEqual({ clips: 12, shorts: 2, usd: 6 });
    expect(shortsRunwayEstimate(project('main', 'local').p)).toBeNull();
    expect(shortsRunwayEstimate(project('none', 'runway').p)).toBeNull();
  });

  it('a full run waits once at Shorts with the cost; the step may spend', () => {
    const { brand, p } = project('main', 'runway');
    const step = contentProjectPlanSteps(p, brand).find((s) => s.contentStep?.step === 'shorts')!;
    expect(step.effects).toContain('spend');
    expect(step.waitFor).toBe(SHORTS_WAIT_PAID(4, 2, 2));
    expect(step.waitFor).toBe('Make 4 Runway clips for 2 Shorts, about $2.00.');
    expect(step.costEstimateUsd).toBe(2);
    const problems = checkPlan([{ stepId: 'miya', agent: 'miya', actionType: 'creative_shorts', effects: ['write_own_work', 'spend'], needs: [] }] as any).problems;
    expect(problems).toEqual([]);
  });

  it('run on its own, the Shorts step still asks for the cost but does not stop first', () => {
    const { brand, p } = project('main', 'runway');
    const [step] = contentProjectPlanSteps(p, brand, 'shorts', { only: true });
    expect(step.effects).toContain('spend');
    expect(step.waitFor).toBeUndefined();
  });

  it('without Runway the Shorts step neither spends nor stops', () => {
    const { brand, p } = project('main', 'local');
    const step = contentProjectPlanSteps(p, brand).find((s) => s.contentStep?.step === 'shorts')!;
    expect(step.effects).not.toContain('spend');
    expect(step.waitFor).toBeUndefined();
  });
});
