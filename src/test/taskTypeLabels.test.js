// The board and the plan map show a step's task in plain words, not `distribution_slack` (phone
// phase 3 part C, owner 2026-11-02). Every agent-owned task type given to a step has a meaning.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TASK_TYPE_MEANINGS, STEP_ONLY_MEANINGS, taskLabel } from '../services/jose/taskTypeMeanings';
import { ownerOf } from '../services/jose/agentPermissionTable';

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'test' ? [] : files(p)) : /\.(t|j)sx?$/.test(n) ? [p] : [];
  });
}

describe('task labels', () => {
  it('every agent-owned task type a step is given has a meaning', () => {
    const used = new Set();
    for (const f of files('src')) for (const m of readFileSync(f, 'utf8').matchAll(/actionType: '([a-z_]+)'/g)) used.add(m[1]);
    const missing = [...used].filter((t) => ownerOf(t) && ownerOf(t) !== 'jose' && !TASK_TYPE_MEANINGS[t] && !STEP_ONLY_MEANINGS[t]);
    expect(missing).toEqual([]);
  });

  it('is the meaning up to its first ";" or "(", in plain words', () => {
    expect(taskLabel('distribution_slack')).toBe('post a message to Slack');
    expect(taskLabel('assistant_answer')).toBe('answer a plain question in words');
    expect(taskLabel('creative_campaign')).toBe(TASK_TYPE_MEANINGS.creative_campaign.split(/;| \(/)[0].trim());
    expect(taskLabel('creative_campaign')).not.toBe('captions');
  });

  it("step-only meanings aren't offered to Jose's planner", async () => {
    const { planningMenu } = await import('../services/jose/taskTypeMeanings');
    for (const t of Object.keys(STEP_ONLY_MEANINGS)) expect(planningMenu()).not.toContain(`- ${t}:`);
  });

  it('a task type with no meaning is still readable', () => {
    expect(taskLabel('orchestration_plan_check')).toBe('orchestration plan check');
    expect(taskLabel('')).toBe('');
  });
});
