// Agent roles Part C2: a send with a time waits in Marcus's runner, goes once at its time,
// shows on the Calendar, and is never sent twice after the app closes mid-send.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sends: unknown[] = [];
vi.mock('../../../services/marcus/runSend', () => ({
  runMarcusSend: vi.fn(async (...args: unknown[]) => { sends.push(args); return { ok: true, sentence: 'Sent to Slack #team.' }; }),
}));
vi.mock('../../../services/memoryService', () => ({ pushMemoryItem: vi.fn() }));
vi.mock('../../../services/orchestrationReceiptService', () => ({ appendOrchestrationReceipt: vi.fn() }));
vi.mock('../../../services/contentFactory/postMetrics', () => ({ readDueMetrics: vi.fn(async () => 0) }));

import {
  runMarcusDistribution, runScheduledPublishes, recoverScheduledPublishes, getScheduledPublishes, cancelScheduledPublish,
} from '../../../services/marcusExecutionService';
import { createJoseRequest, updateJoseStep } from '../../../services/jose/joseRequestStore';
import { listCalendarItems } from '../../../services/contentFactory/calendarItems';

const NOW = new Date(2026, 10, 2, 10, 0).getTime();
const HOUR = 3_600_000;
const preview = (sendAtMs?: number) => ({
  connector: 'slack', target: '#team', kind: 'message', label: 'Slack #team', text: 'Standup moved to 10.', sourceStepId: 'write',
  preparedAtMs: NOW, ...(sendAtMs ? { sendAtMs } : {}),
});
const step = { stepId: 'marcus', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: ['write'] };

function seed(sendAtMs?: number) {
  createJoseRequest({ commandId: 'c1', source: 'user', text: 'Tell the team on Slack #team tomorrow at 9', kind: 'normal', steps: [step] } as never);
  updateJoseStep('jose-request-c1', 'marcus', { sendPreview: preview(sendAtMs) } as never);
}

beforeEach(() => {
  localStorage.clear();
  sends.length = 0;
});

describe('a timed send', () => {
  it('waits in the runner, then goes once at its time', async () => {
    seed(NOW + 23 * HOUR);
    const r: any = await runMarcusDistribution('x', step as never, null, { commandId: 'c1', nowMs: NOW });
    expect(r.resultState).toBe('completed');
    expect(r.summary).toBe('Marcus will send it to Slack #team at Tue 09:00.');
    expect(sends).toEqual([]);
    const item: any = getScheduledPublishes().find((i: any) => i.kind === 'approved_send');
    expect(item).toMatchObject({ status: 'pending', scheduledAt: NOW + 23 * HOUR, commandId: 'c1', stepId: 'marcus' });

    await runScheduledPublishes(NOW + 22 * HOUR);
    expect(sends).toEqual([]);
    await runScheduledPublishes(NOW + 23 * HOUR + 1000);
    expect(sends).toHaveLength(1);
    expect(sends[0]).toEqual(['c1', 'marcus', expect.objectContaining({ text: 'Standup moved to 10.' })]);
    await runScheduledPublishes(NOW + 24 * HOUR);
    expect(sends).toHaveLength(1);
    expect(getScheduledPublishes().find((i: any) => i.id === item.id)?.status).toBe('done');
  });

  it('a time already past sends now and says so', async () => {
    seed(NOW - HOUR);
    const r: any = await runMarcusDistribution('x', step as never, null, { commandId: 'c1', nowMs: NOW });
    expect(sends).toHaveLength(1);
    expect(r.summary.startsWith('The time had passed, so it was sent now.')).toBe(true);
  });

  it('cut off mid-send when the app closed: marked check at start, never sent again', async () => {
    seed(NOW + HOUR);
    await runMarcusDistribution('x', step as never, null, { commandId: 'c1', nowMs: NOW });
    const items: any[] = JSON.parse(localStorage.getItem('alphonso_marcus_schedule_v1') || '[]');
    items[0].status = 'posting';
    localStorage.setItem('alphonso_marcus_schedule_v1', JSON.stringify(items));
    recoverScheduledPublishes(NOW + 2 * HOUR);
    expect(getScheduledPublishes()[0].status).toBe('check');
    await runScheduledPublishes(NOW + 3 * HOUR);
    expect(sends).toEqual([]);
  });

  it('shows on the Calendar, and cancelling it means it is never sent', async () => {
    seed(NOW + HOUR);
    await runMarcusDistribution('x', step as never, null, { commandId: 'c1', nowMs: NOW });
    const shown = listCalendarItems(NOW).find((i) => i.kind === 'send');
    expect(shown).toMatchObject({ atMs: NOW + HOUR, statusLabel: 'Scheduled send (Slack #team)', caption: 'Standup moved to 10.' });
    cancelScheduledPublish(String(shown!.sendId));
    await runScheduledPublishes(NOW + 2 * HOUR);
    expect(sends).toEqual([]);
  });
});
