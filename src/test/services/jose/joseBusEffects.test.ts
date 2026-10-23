import { describe, it, expect, beforeEach } from 'vitest';
import { createAgentPacket, canExecutePacket, approvePacket, getPacketById } from '../../../services/agentBusService';

// Approval by declared effect at the bus (2026-10-23), instead of guessing
// from words in the task description.
function packet(input: Record<string, unknown>) {
  return createAgentPacket({
    fromAgent: 'jose', toAgent: 'nova', title: 't', packetType: 'jose_assigned_work', payload: {},
    requiresApproval: false, actionType: 'analysis_x', ...input,
  } as never);
}

beforeEach(() => localStorage.clear());

describe('the bus approves by effect', () => {
  it('runs a read-only task even if its text mentions publishing', () => {
    const p = packet({ effects: ['read'], commandPreview: 'nothing is published' });
    expect(p.effects).toEqual(['read']);
    expect(canExecutePacket(p)).toEqual({ ok: true, reason: null });
  });

  it('holds a task that publishes until it is approved', () => {
    const p = packet({ toAgent: 'marcus', actionType: 'distribution_execution', effects: ['publish_or_send'] });
    const gate = canExecutePacket(p);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/Publish or send anything outside/);
    approvePacket(p.id);
    expect(canExecutePacket(getPacketById(p.id))).toEqual({ ok: true, reason: null });
  });

  it('keeps the word check for older tasks that declare no effects', () => {
    const p = packet({ commandPreview: 'publish the post' });
    expect(canExecutePacket(p).ok).toBe(false);
  });
});
