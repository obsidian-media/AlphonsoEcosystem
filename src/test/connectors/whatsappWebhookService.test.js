import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => mockInvoke(...args),
  isTauri: vi.fn().mockReturnValue(false)
}));

const mockCreateConnectorRoutePacket = vi.fn();
const mockNormalizeWhatsAppCloudInboundPayload = vi.fn().mockReturnValue([]);
const mockAppendConnectorAudit = vi.fn();

vi.mock('../../services/connectorRegistryService', () => ({
  createConnectorRoutePacket: (...args) => mockCreateConnectorRoutePacket(...args),
  normalizeWhatsAppCloudInboundPayload: (...args) => mockNormalizeWhatsAppCloudInboundPayload(...args),
  appendConnectorAudit: (...args) => mockAppendConnectorAudit(...args)
}));

const mockAppendOrchestrationReceipt = vi.fn();

vi.mock('../../services/orchestrationReceiptService', () => ({
  appendOrchestrationReceipt: (...args) => mockAppendOrchestrationReceipt(...args)
}));

vi.mock('../../services/agentBusService', () => ({
  updatePacketStatus: vi.fn().mockImplementation((id) => ({ id, status: 'reported_to_jose' })),
  AGENTS: { JOSE: 'jose' }
}));

import { processInbound, verifyWebhook, WHATSAPP_WEBHOOK_SCOPE } from '../../services/whatsappWebhookService';

describe('whatsappWebhookService', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({ ok: true });
    mockCreateConnectorRoutePacket.mockReset();
    mockNormalizeWhatsAppCloudInboundPayload.mockReset();
    mockNormalizeWhatsAppCloudInboundPayload.mockReturnValue([]);
    mockAppendConnectorAudit.mockReset();
    mockAppendOrchestrationReceipt.mockReset();
  });

  describe('WHATSAPP_WEBHOOK_SCOPE constant', () => {
    it('exports correct scope key', () => {
      expect(WHATSAPP_WEBHOOK_SCOPE).toBe('whatsapp_webhook_events_v1');
    });
  });

  describe('verifyWebhook', () => {
    it('returns the webhook challenge when verification succeeds', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        mode: 'subscribe',
        verifyTokenPresent: true,
        challenge: 'challenge-value',
        responseChallenge: 'challenge-value',
        checkedAtMs: 1,
        trust: 'verified',
        error: null
      });

      const proof = await verifyWebhook('verify-token', 'challenge-value');

      expect(proof.ok).toBe(true);
      expect(proof.responseChallenge).toBe('challenge-value');
      expect(proof.trust).toBe('verified');
    });

    it('calls invoke with correct command', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true, trust: 'verified', responseChallenge: 'ch'
      });
      await verifyWebhook('my-token', 'my-challenge');
      expect(mockInvoke).toHaveBeenCalledWith(
        'verify_whatsapp_cloud_webhook_challenge',
        expect.objectContaining({ verifyToken: 'my-token', challenge: 'my-challenge' })
      );
    });

    it('returns ok: false on invoke error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Rust error'));
      const proof = await verifyWebhook('tok', 'ch');
      expect(proof.ok).toBe(false);
      expect(proof.trust).toBe('failed');
    });

    it('records verification event in localStorage', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, trust: 'verified', responseChallenge: 'ch' });
      await verifyWebhook('tok', 'ch');
      const raw = localStorage.getItem('alphonso_whatsapp_webhook_events_v1');
      expect(raw).toBeTruthy();
      const events = JSON.parse(raw);
      expect(events.some(e => e.eventType === 'verify_webhook')).toBe(true);
    });

    it('appends orchestration receipt on success', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, trust: 'verified', responseChallenge: 'ch' });
      await verifyWebhook('tok', 'ch');
      expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'whatsapp_webhook_verified',
          status: 'verified',
          connectorId: 'whatsapp'
        })
      );
    });

    it('appends orchestration receipt on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('fail'));
      await verifyWebhook('tok', 'ch');
      expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'whatsapp_webhook_verify_failed',
          status: 'failed'
        })
      );
    });

    it('appends connector audit on verification', async () => {
      mockInvoke.mockResolvedValueOnce({ ok: true, trust: 'verified', responseChallenge: 'ch' });
      await verifyWebhook('tok', 'ch');
      expect(mockAppendConnectorAudit).toHaveBeenCalledWith(
        'whatsapp',
        'webhook_verify_success',
        expect.any(Object)
      );
    });
  });

  describe('processInbound - signature enforcement', () => {
    it('rejects when signature header is missing and allowUnsigned is false', async () => {
      const result = await processInbound({ entry: [] }, {});

      expect(result.ok).toBe(false);
      expect(result.error).toContain('X-Hub-Signature-256');
      expect(result.trust).toBe('failed');
    });

    it('skips signature check when allowUnsigned is true', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        provider: 'whatsapp_cloud_api',
        count: 0,
        messages: [],
        trust: 'verified'
      });

      const result = await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(result.ok).toBe(true);
      const calls = mockInvoke.mock.calls.map(c => c[0]);
      expect(calls).not.toContain('verify_whatsapp_cloud_webhook_signature');
    });

    it('rejects when signature verification fails', async () => {
      mockInvoke
        .mockResolvedValueOnce({ ok: false, trust: 'failed', error: 'bad signature' });

      const result = await processInbound(
        { entry: [] },
        { signatureHeader: 'sha256=invalid' }
      );

      expect(result.ok).toBe(false);
      expect(result.trust).toBe('failed');
    });

    it('passes signature proof through on success', async () => {
      mockInvoke
        .mockResolvedValueOnce({
          ok: true,
          trust: 'verified',
          signatureHeaderPresent: true,
          appSecretPresent: true
        })
        .mockResolvedValueOnce({
          ok: true,
          messages: [],
          count: 0,
          trust: 'verified'
        });

      const result = await processInbound(
        { entry: [] },
        { signatureHeader: 'sha256=valid' }
      );

      expect(result.ok).toBe(true);
      expect(result.signatureProof).toBeTruthy();
      expect(result.signatureProof.ok).toBe(true);
    });
  });

  describe('processInbound - body coercion', () => {
    it('handles string body (JSON string)', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true, messages: [], count: 0, trust: 'verified'
      });

      const result = await processInbound(
        JSON.stringify({ entry: [] }),
        { allowUnsigned: true }
      );

      expect(result.ok).toBe(true);
    });

    it('returns error on invalid JSON string body', async () => {
      const result = await processInbound('not-valid-json{{{', { allowUnsigned: true });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid WhatsApp webhook JSON payload');
    });

    it('handles null/undefined body gracefully', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true, messages: [], count: 0, trust: 'verified'
      });

      const result = await processInbound(null, { allowUnsigned: true });

      expect(result.ok).toBe(true);
    });

    it('handles empty string body', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true, messages: [], count: 0, trust: 'verified'
      });
      const result = await processInbound('', { allowUnsigned: true });
      expect(result.ok).toBe(true);
    });
  });

  describe('processInbound - message routing', () => {
    it('routes authorized messages and creates packets', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        provider: 'whatsapp_cloud_api',
        count: 1,
        messages: [{ chatId: '15551234567', fromId: '15551234567', text: 'hello', messageId: 'wamid.1' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'pkt-abc', status: 'pending' },
        rejected: false,
        reason: null
      });

      const result = await processInbound(
        { entry: [] },
        { allowUnsigned: true }
      );

      expect(result.ok).toBe(true);
      expect(result.routedCount).toBe(1);
      expect(result.rejectedCount).toBe(0);
      expect(result.packets).toHaveLength(1);
    });

    it('rejects unauthorized senders', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        provider: 'whatsapp_cloud_api',
        count: 1,
        messages: [{ chatId: 'unauthorized', fromId: 'unauthorized', text: 'hi', messageId: 'wamid.2' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: null,
        rejected: true,
        reason: 'Sender is not authorized in connector allowlist.'
      });

      const result = await processInbound(
        { entry: [] },
        { allowUnsigned: true }
      );

      expect(result.ok).toBe(true);
      expect(result.rejectedCount).toBe(1);
      expect(result.routedCount).toBe(0);
      expect(result.rejected[0].reason).toContain('not authorized');
    });

    it('appends audit for rejected messages', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 1,
        messages: [{ chatId: 'bad', fromId: 'bad', text: 'x', messageId: 'w.3' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: null,
        rejected: true,
        reason: 'Not allowed'
      });

      await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(mockAppendConnectorAudit).toHaveBeenCalledWith(
        'whatsapp',
        'webhook_message_rejected',
        expect.objectContaining({ senderId: 'bad' })
      );
    });

    it('appends audit for routed messages', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 1,
        messages: [{ chatId: '123', fromId: '123', text: 'test', messageId: 'w.4' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'pkt-routed', status: 'pending' },
        rejected: false,
        reason: null
      });

      await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(mockAppendConnectorAudit).toHaveBeenCalledWith(
        'whatsapp',
        'webhook_message_routed',
        expect.objectContaining({ packetId: 'pkt-routed' })
      );
    });

    it('records event on process_inbound_completed', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 0,
        messages: [],
        trust: 'verified'
      });

      await processInbound({ entry: [] }, { allowUnsigned: true });

      const raw = localStorage.getItem('alphonso_whatsapp_webhook_events_v1');
      expect(raw).toBeTruthy();
      const events = JSON.parse(raw);
      expect(events.some(e => e.eventType === 'process_inbound_completed')).toBe(true);
    });
  });

  describe('processInbound - normalizeMessages with rust proof', () => {
    it('uses rust proof messages when available', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 2,
        messages: [
          { chatId: 'a', fromId: 'a', text: 'from rust', messageId: 'r1' },
          { chatId: 'b', fromId: 'b', text: 'also rust', messageId: 'r2' }
        ],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'p1' },
        rejected: false,
        reason: null
      });

      const result = await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(result.count).toBe(2);
      expect(mockCreateConnectorRoutePacket).toHaveBeenCalledTimes(2);
    });

    it('falls back to JS normalization when rust proof has no messages', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: false,
        messages: null,
        trust: 'failed'
      });

      mockNormalizeWhatsAppCloudInboundPayload.mockReturnValue([
        { chatId: 'js1', fromId: 'js1', text: 'from js', messageId: 'j1', provider: 'whatsapp_cloud_api' }
      ]);

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'p2' },
        rejected: false,
        reason: null
      });

      const result = await processInbound(
        { entry: [{ changes: [{ value: { messages: [] } }] }] },
        { allowUnsigned: true }
      );

      expect(result.count).toBe(1);
      expect(mockNormalizeWhatsAppCloudInboundPayload).toHaveBeenCalled();
    });
  });

  describe('processInbound - orchestration receipts', () => {
    it('appends receipt for each routed message', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 1,
        messages: [{ chatId: 'c', fromId: 'c', text: 'hi', messageId: 'm1' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'pkt-receipt' },
        rejected: false,
        reason: null
      });

      await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'whatsapp_webhook',
          eventType: 'whatsapp_webhook_message_routed',
          status: 'recorded',
          connectorId: 'whatsapp'
        })
      );
    });

    it('appends receipt for each rejected message', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 1,
        messages: [{ chatId: 'x', fromId: 'x', text: 'no', messageId: 'm2' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: null,
        rejected: true,
        reason: 'Not allowed'
      });

      await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'whatsapp_webhook',
          eventType: 'whatsapp_webhook_message_rejected',
          status: 'blocked',
          riskLevel: 'high'
        })
      );
    });
  });

  describe('processInbound - edge cases', () => {
    it('handles empty messages array from rust proof', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 0,
        messages: [],
        trust: 'verified'
      });

      const result = await processInbound({ entry: [] }, { allowUnsigned: true });

      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
      expect(result.routedCount).toBe(0);
      expect(result.rejectedCount).toBe(0);
    });

    it('passes commandId and packetId options through to message receipts', async () => {
      mockInvoke.mockResolvedValueOnce({
        ok: true,
        count: 1,
        messages: [{ chatId: 'c1', fromId: 'c1', text: 'hello', messageId: 'm1' }],
        trust: 'verified'
      });

      mockCreateConnectorRoutePacket.mockReturnValue({
        packet: { id: 'pkt-xyz' },
        rejected: false,
        reason: null
      });

      await processInbound(
        { entry: [] },
        { allowUnsigned: true, commandId: 'cmd-xyz', packetId: 'pkt-xyz' }
      );

      expect(mockAppendOrchestrationReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          commandId: 'cmd-xyz',
          packetId: 'pkt-xyz'
        })
      );
    });
  });
});
