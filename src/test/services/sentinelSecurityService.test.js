// Agent phase 4: the sidebar, /scan and the daily schedule review the last week's activity
// through recentActivityText(); the keyword scan that lived here is gone.
import { describe, it, expect, vi } from 'vitest';
import { recentActivityText } from '../../services/sentinelSecurityService';
import { listOrchestrationReceipts } from '../../services/orchestrationReceiptService';
import { listAgentActivity } from '../../services/agentActivityService';

vi.mock('../../services/orchestrationReceiptService', () => ({ listOrchestrationReceipts: vi.fn(() => []) }));
vi.mock('../../services/agentActivityService', () => ({ listAgentActivity: vi.fn(() => []) }));

describe('recentActivityText', () => {
  it("is the last week's receipts and activity, keys hidden, older work left out", () => {
    const now = Date.now();
    listOrchestrationReceipts.mockReturnValue([
      { id: 'r1', agent: 'jose', eventType: 'executed', status: 'completed', timestampMs: now - 1000, details: { summary: 'Saved config with sk-live-1234abcd5678efgh' } },
      { id: 'r2', agent: 'miya', eventType: 'executed', status: 'completed', timestampMs: now - 30 * 86_400_000, details: { summary: 'old work' } },
    ]);
    listAgentActivity.mockReturnValue([{ agent: 'hector', action: 'research', detail: 'read three sources', ts: now - 500 }]);
    const { text, items } = recentActivityText(7);
    expect(items).toBe(2);
    expect(text).toContain('[hidden key, ends …efgh]');
    expect(text).not.toContain('sk-live-1234abcd5678efgh');
    expect(text).not.toContain('old work');
    expect(text).toContain('hector research read three sources');
  });

  it('nothing in the last week: no items', () => {
    listOrchestrationReceipts.mockReturnValue([]);
    listAgentActivity.mockReturnValue([]);
    expect(recentActivityText(7)).toEqual({ text: '', items: 0 });
  });
});
