import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock in-memory bucket state between tests
vi.stubGlobal('Date', {
  now: () => 1000000
});

describe('connectorRateLimiterService', () => {
  let checkLimit, consume, getStatus, configure, resetAll;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../../services/connectorRateLimiterService');
    checkLimit = module.checkLimit;
    consume = module.consume;
    getStatus = module.getStatus;
    configure = module.configure;
    resetAll = module.resetAll;
    resetAll();
  });

  describe('checkLimit', () => {
    it('allows first request by default', () => {
      const result = checkLimit('test-connector');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(60);
    });

    it('returns remaining tokens count', () => {
      for (let i = 0; i < 10; i++) consume('test-connector');
      const result = getStatus('test-connector');
      expect(result.tokens).toBe(50);
    });
  });

  describe('consume', () => {
    it('decrements token count', () => {
      consume('test-connector');
      const status = getStatus('test-connector');
      expect(status.tokens).toBe(59);
    });

    it('reduces remaining count', () => {
      checkLimit('test-connector');
      consume('test-connector');
      const result = checkLimit('test-connector');
      expect(result.remaining).toBe(59);
    });
  });

  describe('configure', () => {
    it('sets custom maxTokens', () => {
      configure('test-connector', { maxTokens: 100 });
      const status = getStatus('test-connector');
      expect(status.maxTokens).toBe(100);
    });

    it('sets custom refillRate', () => {
      configure('test-connector', { refillRate: 120 });
      const status = getStatus('test-connector');
      expect(status.refillRate).toBe(120);
    });
  });

  describe('getStatus', () => {
    it('returns connector status object', () => {
      const status = getStatus('test-connector');
      expect(status.connectorId).toBe('test-connector');
      expect(status).toHaveProperty('tokens');
      expect(status).toHaveProperty('maxTokens');
      expect(status).toHaveProperty('refillRate');
    });
  });

  describe('resetAll', () => {
    it('clears all buckets and configs', () => {
      consume('test-connector');
      configure('test-connector', { maxTokens: 120 });
      resetAll();
      const status = getStatus('test-connector');
      expect(status.maxTokens).toBe(60);
    });
  });
});