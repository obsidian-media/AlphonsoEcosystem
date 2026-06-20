import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { normalizeInboundPayload } from '../../gateway/whatsapp-cloud/src/normalize.js';
import { verifyChallenge, verifySignature } from '../../gateway/whatsapp-cloud/src/verify.js';

describe('WhatsApp Cloud gateway helpers', () => {
  it('verifies Meta challenge only when the token matches', () => {
    expect(verifyChallenge({
      mode: 'subscribe',
      token: 'token-123',
      expectedToken: 'token-123',
      challenge: 'challenge-1'
    })).toBe(true);

    expect(verifyChallenge({
      mode: 'subscribe',
      token: 'token-123',
      expectedToken: 'token-999',
      challenge: 'challenge-1'
    })).toBe(false);
  });

  it('verifies signatures without exposing secrets', () => {
    const body = Buffer.from('{"entry":[]}', 'utf8');
    const appSecret = 'secret-value';
    const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;
    const proof = verifySignature({ rawBody: body, signatureHeader: signature, appSecret });

    expect(proof.ok).toBe(true);
    expect(proof.expected).toBe(signature);
    expect(proof.received).toBe(signature);
  });

  it('normalizes inbound messages into safe packets', () => {
    const messages = normalizeInboundPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '15551234567' },
                contacts: [{ profile: { name: 'Test Contact' } }],
                messages: [
                  {
                    id: 'wamid-1',
                    from: '15550000000',
                    timestamp: '12345',
                    type: 'text',
                    text: { body: 'Hello Alphonso' }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      provider: 'whatsapp_cloud',
      messageId: 'wamid-1',
      from: '15550000000',
      to: '15551234567',
      text: 'Hello Alphonso',
      type: 'text'
    });
  });
});
