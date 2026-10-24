import { describe, it, expect, beforeEach } from 'vitest';
import { getWaitingExpiryDays, expireWaitingRequests } from '../../../services/jose/joseExpiry';
import { createJoseRequest, createWaitingPlanRequest, getJoseRequest, setJoseRequestStatus } from '../../../services/jose/joseRequestStore';
import { createAgentPacket, getPacketById, updatePacketStatus } from '../../../services/agentBusService';
import { createJoseCommandRoute } from '../../../services/joseCommandRouterService';

const DAY = 24 * 60 * 60 * 1000;
const setDays = (value: unknown) => localStorage.setItem('alphonso_settings', JSON.stringify({ joseWaitingExpiryDays: value }));

async function waitingRequest(ageDays: number) {
  const command: any = await createJoseCommandRoute({
    commandText: 'Post it', source: 'test', zeroCostMode: true,
    assignments: [{ agent: 'marcus', actionType: 'distribution_execution', stepId: 'post', effects: ['publish_or_send'], needs: [], title: 'x', rationale: 'x', riskLevel: 'low', requiresApproval: true, commandPreview: '', fragments: [] }],
  });
  const request = createJoseRequest({ commandId: command.id, source: 'test', text: 'Post it', kind: 'normal', steps: [{ stepId: 'post', agent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'], needs: [] }] });
  setJoseRequestStatus(request.id, 'waiting_approval');
  const packetId = command.assignments[0].packetId;
  updatePacketStatus(packetId, 'pending_approval');
  const now = Date.now();
  return { requestId: request.id, packetId, now: now + ageDays * DAY };
}

beforeEach(() => localStorage.clear());

describe('getWaitingExpiryDays', () => {
  it('is 7 by default, 0 or blank for never, and 7 for a negative value', () => {
    expect(getWaitingExpiryDays()).toBe(7);
    setDays(0); expect(getWaitingExpiryDays()).toBe(0);
    setDays(''); expect(getWaitingExpiryDays()).toBe(0);
    setDays(-3); expect(getWaitingExpiryDays()).toBe(7);
    setDays(14); expect(getWaitingExpiryDays()).toBe(14);
  });
});

describe('expireWaitingRequests', () => {
  it('expires a request waiting longer than the set days, with a note, and rejects its waiting packet', async () => {
    const { requestId, packetId, now } = await waitingRequest(8);
    expect(expireWaitingRequests(now)).toBe(1);
    const request = getJoseRequest(requestId)!;
    expect(request.status).toBe('expired');
    expect(request.changeLog!.map((c) => c.text)).toContain('Expired after 7 days without your approval.');
    expect(getPacketById(packetId)!.status).toBe('rejected');
  });

  it('leaves a newer one, and never expires with 0 days', async () => {
    const recent = await waitingRequest(6);
    expect(expireWaitingRequests(recent.now)).toBe(0);
    setDays(0);
    const old = await waitingRequest(400);
    expect(expireWaitingRequests(old.now)).toBe(0);
    expect(getJoseRequest(old.requestId)!.status).toBe('waiting_approval');
  });

  it('expires a plan waiting to be run', () => {
    const waiting = createWaitingPlanRequest({
      text: 'Plan', source: 'user', kind: 'normal',
      steps: [{ stepId: 'a', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }],
      plan: { source: 'fresh', templateId: null, note: '' }, runOptions: { source: 'user' },
    });
    expect(expireWaitingRequests(Date.now() + 8 * DAY)).toBe(1);
    expect(getJoseRequest(waiting.id)!.status).toBe('expired');
  });

  it('does not touch a packet made outside the request', async () => {
    const other = createAgentPacket({ fromAgent: 'jose', toAgent: 'nova', title: 'x', packetType: 'assignment', source: 'test', payload: {} } as any);
    updatePacketStatus(other.id, 'pending_approval');
    const { now } = await waitingRequest(8);
    expireWaitingRequests(now);
    expect(getPacketById(other.id)!.status).toBe('pending_approval');
  });
});

describe('a request waiting for setup (agent roles Part A)', () => {
  it('expires like one waiting for an approval', async () => {
    const old = await waitingRequest(8);
    setJoseRequestStatus(old.requestId, 'waiting_setup');
    expireWaitingRequests(old.now);
    expect(getJoseRequest(old.requestId)!.status).toBe('expired');
  });
});
