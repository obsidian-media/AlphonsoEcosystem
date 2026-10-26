// Agent phase 5: the sends that skipped Jose are each one Marcus step now: an old scheduled
// text send, the Content Empire workflow's Publishing task, and Project Execution's handoff packets.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// No importOriginal: loading the real module first would load the callers before the mock.
vi.mock('../../../services/marcus/askMarcus', () => ({
  askMarcusToSend: vi.fn(async () => ({ ok: true, requestId: 'jose-request-k1' })),
  NOTHING_TO_PUBLISH: 'Nothing to publish: this workflow writes no post. Ask Jose to write and post it.',
  MARCUS_LABEL: (source: string) => `Steps set by ${source}.`,
}));
vi.mock('../../../services/marcusPublishService', async (orig) => ({ ...(await orig() as object), executeMarcusPublish: vi.fn() }));
vi.mock('../../../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));

import { askMarcusToSend, NOTHING_TO_PUBLISH } from '../../../services/marcus/askMarcus';
import { executeMarcusPublish } from '../../../services/marcusPublishService';
import { schedulePublish, getScheduledPublishes, runScheduledPublishes } from '../../../services/marcusExecutionService';
import { executeWorkflowStep } from '../../../services/workflowExecutionService';
import { executeApprovedPacket } from '../../../services/packetExecutionService';

const NOW = new Date(2026, 9, 26, 10, 0).getTime();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('the paths that skipped Jose', () => {
  it('an old scheduled text send asks Marcus at its time and is marked asked', async () => {
    const item = schedulePublish({ content: 'Shop opens at 9.', platform: 'telegram', scheduledAt: NOW - 1000, agentId: 'marcus' });
    await runScheduledPublishes(NOW);
    expect(askMarcusToSend).toHaveBeenCalledWith({ text: 'Shop opens at 9.', connector: 'telegram', source: "Marcus's schedule" });
    expect(executeMarcusPublish).not.toHaveBeenCalled();
    expect(getScheduledPublishes().find((i) => i.id === item.id)?.status).toBe('asked');
  });

  it('Content Empire Publishing: with text asks Marcus; without, NOTHING_TO_PUBLISH and not done', async () => {
    const withText = await executeWorkflowStep({ id: 'p', actionType: 'Publishing', payload: { workflowId: 'WF_CONTENT_EMPIRE', context: { text: 'Our new video is out.' } } });
    expect(withText.ok).toBe(true);
    expect(askMarcusToSend).toHaveBeenCalledWith({ text: 'Our new video is out.', source: 'a workflow' });
    vi.mocked(askMarcusToSend).mockClear();
    const without = await executeWorkflowStep({ id: 'p2', actionType: 'Publishing', payload: { workflowId: 'WF_CONTENT_EMPIRE', context: {} } });
    expect(without).toMatchObject({ ok: false, output: NOTHING_TO_PUBLISH });
    expect(askMarcusToSend).not.toHaveBeenCalled();
    expect(executeMarcusPublish).not.toHaveBeenCalled();
  });

  it('an old marcus_publish_handoff packet goes to askMarcusToSend', async () => {
    const result = await executeApprovedPacket({
      id: 'pk1', packetType: 'marcus_publish_handoff', title: 'Marcus publish: slack', actionType: 'external_publish', status: 'approved',
      payload: { platform: 'whatsapp', to: '+15550102030', text: 'Hello.' },
    } as never);
    expect(result.ok).toBe(true);
    expect(askMarcusToSend).toHaveBeenCalledWith({ text: 'Hello.', connector: 'whatsapp', target: '+15550102030', source: 'Project Execution' });
    expect(executeMarcusPublish).not.toHaveBeenCalled();
  });

});
