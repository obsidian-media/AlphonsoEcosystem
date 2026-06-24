import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkLimit,
  consume,
  getStatus,
  configure,
  resetAll,
} from '../services/connectorRateLimiterService';

describe('connectorRateLimiterService', () => {
  beforeEach(() => {
    resetAll();
  });

  it('allows requests when tokens available', () => {
    const result = checkLimit('telegram');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(60);
  });

  it('consume reduces token count', () => {
    consume('slack');
    const status = getStatus('slack');
    expect(status.tokens).toBeLessThan(60);
  });

  it('blocks when all tokens consumed', () => {
    configure('x', { maxTokens: 2, refillRate: 60 });
    consume('x');
    consume('x');
    const { allowed } = checkLimit('x');
    expect(allowed).toBe(false);
  });

  it('configure changes max tokens', () => {
    configure('github', { maxTokens: 10, refillRate: 10 });
    const status = getStatus('github');
    expect(status.maxTokens).toBe(10);
    expect(status.refillRate).toBe(10);
  });

  it('resetAll clears all buckets', () => {
    consume('notion');
    resetAll();
    const status = getStatus('notion');
    expect(status.tokens).toBe(60);
  });

  it('getStatus returns connectorId', () => {
    const status = getStatus('clickup');
    expect(status.connectorId).toBe('clickup');
  });

  it('resetAt is in the future when rate limited', () => {
    configure('limited', { maxTokens: 1, refillRate: 60 });
    consume('limited');
    const { resetAt } = checkLimit('limited');
    expect(resetAt).toBeGreaterThan(Date.now());
  });
});
