import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRateLimiter, readBodyWithLimit, redactGatewayDetails } from '../../gateway/whatsapp-cloud/src/security.js';

function createMockRequest() {
  const request = new EventEmitter();
  request.destroy = (error) => {
    request.emit('error', error || new Error('destroyed'));
  };
  return request;
}

describe('WhatsApp gateway security helpers', () => {
  it('limits requests per client within the configured window', () => {
    const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 2 });
    expect(limiter.allow('127.0.0.1', 100)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.allow('127.0.0.1', 200)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.allow('127.0.0.1', 300)).toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.allow('127.0.0.1', 1_200)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('rejects webhook bodies that exceed the configured byte limit', async () => {
    const request = createMockRequest();
    const bodyPromise = readBodyWithLimit(request, { maxBytes: 4 });

    request.emit('data', Buffer.from('1234'));
    request.emit('data', Buffer.from('5'));

    await expect(bodyPromise).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('redacts secret-like gateway details before logging', () => {
    const redacted = redactGatewayDetails({
      verifyToken: 'token-123',
      appSecret: 'secret-456',
      authorization: 'Bearer abc',
      nested: { chatId: '123456789' },
      longText: 'x'.repeat(200)
    });

    expect(redacted).toMatchObject({
      verifyToken: '[redacted]',
      appSecret: '[redacted]',
      authorization: '[redacted]',
      nested: { chatId: '[redacted]' }
    });
    expect(redacted.longText).toHaveLength(163);
    expect(redacted.longText.endsWith('...')).toBe(true);
  });
});
