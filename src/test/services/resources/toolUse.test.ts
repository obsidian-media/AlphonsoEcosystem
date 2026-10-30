// Resource manager Task 6: when each tool and model was last used, and what a step uses now.
import { describe, it, expect, beforeEach } from 'vitest';
import { beginUse, endUse, isInUse, lastUsedAt, markUsed, usageRecord, resetToolUseForTests } from '../../../services/resources/toolUse';

beforeEach(() => {
  localStorage.clear();
  resetToolUseForTests();
});

describe('toolUse', () => {
  it('a tool stays in use until every step using it has ended', () => {
    beginUse('comfyui', 's1', 1000);
    beginUse('comfyui', 's2', 2000);
    endUse('comfyui', 's1', 3000);
    expect(isInUse('comfyui')).toBe(true);
    endUse('comfyui', 's2', 4000);
    expect(isInUse('comfyui')).toBe(false);
    expect(lastUsedAt('comfyui')).toBe(4000);
  });

  it('ending a step twice, or one never begun, changes nothing', () => {
    beginUse('comfyui', 's1', 1000);
    endUse('comfyui', 'other', 2000);
    expect(isInUse('comfyui')).toBe(true);
    endUse('comfyui', 's1', 3000);
    endUse('comfyui', 's1', 9000);
    expect(lastUsedAt('comfyui')).toBe(3000);
  });

  it('last use is kept across a restart', () => {
    markUsed('model:qwen', 5000);
    resetToolUseForTests({ keepSaved: true });
    expect(lastUsedAt('model:qwen')).toBe(5000);
    expect(lastUsedAt('never-used')).toBeNull();
  });

  it('is a usage record for the resource reading', () => {
    beginUse('model:qwen', 's1', 100);
    const record = usageRecord();
    expect(record.isInUse('model:qwen')).toBe(true);
    expect(record.lastUsedAt('model:qwen')).toBe(100);
  });
});
