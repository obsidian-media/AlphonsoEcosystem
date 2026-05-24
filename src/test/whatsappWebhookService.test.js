import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command, args) => {
    if (command === 'verify_whatsapp_cloud_webhook_challenge') {
      return {
        ok: true,
        mode: args.mode,
        verifyTokenPresent: Boolean(args.verifyToken),
        challenge: args.challenge,
        responseChallenge: args.challenge,
        checkedAtMs: 1,
        trust: 'verified',
        error: null
      };
    }

    if (command === 'verify_whatsapp_cloud_webhook_signature') {
      return {
        ok: true,
        signatureHeaderPresent: Boolean(args.signatureHeader),
        appSecretPresent: true,
        expectedSignature: 'sha256=test',
        receivedSignature: args.signatureHeader,
        checkedAtMs: 1,
        trust: 'verified',
        error: null
      };
    }

    if (command === 'normalize_whatsapp_cloud_inbound') {
      return {
        ok: true,
        provider: 'whatsapp_cloud_api',
        count: 1,
        messages: [
          {
            chatId: '15551234567',
            fromId: '15551234567',
            text: 'ask jose: check the webhook route',
            messageId: 'wamid.test',
            phoneNumber: '15550001111',
            receivedAtMs: 1
          }
        ],
        checkedAtMs: 1,
        trust: 'verified',
        error: null
      };
    }

    return { ok: true };
  })
}));

import { processInbound, verifyWebhook } from '../services/whatsappWebhookService';

describe('whatsapp webhook service', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('alphonso_connector_auth_profiles_v1', JSON.stringify({
      whatsapp: {
        enabled: true,
        allowlist: ['15551234567'],
        mode: 'allowlist_required'
      }
    }));
  });

  it('returns the webhook challenge when verification succeeds', async () => {
    const proof = await verifyWebhook('verify-token', 'challenge-value');

    expect(proof.ok).toBe(true);
    expect(proof.responseChallenge).toBe('challenge-value');
    expect(proof.trust).toBe('verified');
  });

  it('verifies, normalizes, and routes signed inbound messages', async () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '15550001111'
                },
                messages: [
                  {
                    from: '15551234567',
                    id: 'wamid.test',
                    text: {
                      body: 'ask jose: check the webhook route'
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const result = await processInbound(body, {
      signatureHeader: 'sha256=test'
    });

    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.routedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.packets[0].status).toBe('reported_to_jose');
    expect(result.routed[0].packetId).toBe(result.packets[0].id);
  });
});
