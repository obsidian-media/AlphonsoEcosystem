import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAgentLlmResponse } from '../lib/ollama';
import { runSentinelSecurityScan } from '../services/sentinelSecurityService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../services/sentinel/sentinelReview', () => ({ runSentinelReview: vi.fn(async () => ({ summary: 'Safe.', resultState: 'completed', schema: { kind: 'security' } })) }));
vi.mock('../services/sessionIntelligenceService', () => ({ appendSessionEvent: vi.fn() }));
vi.mock('../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../services/missionRoomService', () => ({
  classifyMissionRoomRisk: vi.fn(() => ({ secretDetected: false, flags: [], approvalRequired: false })),
  redactMissionRoomSecrets: vi.fn((t) => t)
}));
vi.mock('../lib/ollama', () => ({
  generateOllamaResponse: vi.fn(async () => ({
    response: JSON.stringify({
      severity: 'low',
      requiresApproval: false,
      findings: ['No threats detected'],
      recommendedAction: 'Proceed normally.',
      summary: 'Command appears safe.'
    }),
    done: true
  })),
  generateAgentLlmResponse: vi.fn(async () => null),
  getConfiguredOllamaEndpoint: vi.fn(() => 'http://configured-host:11434'),
  getConfiguredOllamaModel: vi.fn(() => 'picked-by-user:3b'),
  PREFERRED_MODEL: 'llama3.2:3b'
}));

// Agent phase 4: his step is his own review (sentinel/sentinelReview.ts), not the keyword score.
describe('runSentinelSecurityScan', () => {
  it('runs his review with the step input, the command and the project folder', async () => {
    const { runSentinelReview } = await import('../services/sentinel/sentinelReview');
    runSentinelReview.mockClear();
    const stepInput = { instruction: 'Check it.', request: 'r', needs: [], others: [], memory: '', review: null };
    await runSentinelSecurityScan('the request', { agent: 'sentinel', commandId: 'c1' }, { stepInput, projectDirectory: 'D:/p' });
    expect(runSentinelReview).toHaveBeenCalledWith(expect.objectContaining({ agent: 'sentinel' }), stepInput, expect.objectContaining({ commandId: 'c1', workspaceRoot: 'D:/p' }));
  });

  it('without a step input, the command text is what he checks', async () => {
    const { runSentinelReview } = await import('../services/sentinel/sentinelReview');
    runSentinelReview.mockClear();
    await runSentinelSecurityScan('Check this link', {}, {});
    expect(runSentinelReview.mock.calls[0][1]).toMatchObject({ request: 'Check this link', review: null });
  });
});

