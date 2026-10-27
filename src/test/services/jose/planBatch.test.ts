// Jose phase 7: a whole batch is planned in one call; a plan that breaks the rules, or an
// answer that can't be read, leaves that task to be planned on its own as before.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/ollama', () => ({ generateAgentLlmResponse: vi.fn() }));
vi.mock('../../../services/jose/joseModels', async (importOriginal) => ({
  ...(await importOriginal()),
  listInstalledModels: vi.fn(async () => ['llama3.2:3b']),
}));

import { generateAgentLlmResponse } from '../../../lib/ollama';
import { planBatch, BATCH_LABEL } from '../../../services/jose/josePlanner';

const llm = vi.mocked(generateAgentLlmResponse);
const research = (n: number) => ({ id: `facts${n}`, agent: 'hector', taskType: 'research_report', instruction: `Find facts ${n}.`, effects: ['read'], needs: [] });
const plans = (items: unknown[]) => ({ response: JSON.stringify({ plans: items }) }) as never;

beforeEach(() => {
  llm.mockReset();
  localStorage.clear();
});

describe('planBatch', () => {
  it('plans every task in one call, and a plan that breaks the rules is left out', async () => {
    llm.mockResolvedValueOnce(plans([
      { task: 1, steps: [research(1)] },
      { task: 2, steps: [{ id: 'post', agent: 'hector', taskType: 'distribution_execution', instruction: 'Post it.', effects: ['publish_or_send'], needs: [] }] },
      { task: 3, steps: [research(3)] },
    ]));
    const out = await planBatch(['Research bees', 'Post about bees', 'Research wasps']);
    expect(llm).toHaveBeenCalledTimes(1);
    expect(out[0]!.map((s) => s.stepId)).toEqual(['facts1']);
    expect(out[1]).toBeNull();
    expect(out[2]!.map((s) => s.stepId)).toEqual(['facts3']);
    expect(BATCH_LABEL).toBe('Steps planned for a batch.');
  });

  it('an answer that cannot be read leaves every task to be planned on its own', async () => {
    llm.mockResolvedValueOnce({ response: 'not json' } as never);
    expect(await planBatch(['a', 'b', 'c'])).toEqual([null, null, null]);
  });

  it('a missing plan is null, and more than 20 tasks are planned in calls of 20', async () => {
    llm.mockResolvedValue(plans([{ task: 1, steps: [research(1)] }]));
    const out = await planBatch(Array.from({ length: 21 }, (_, i) => `Research ${i}`));
    expect(llm).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(21);
    expect(out[1]).toBeNull();
    expect(out[20]).not.toBeNull();
  });

  it("Jose's model being down plans nothing here", async () => {
    llm.mockRejectedValueOnce(new Error('down'));
    expect(await planBatch(['a'])).toEqual([null]);
  });
});
