import { scoreSourceConfidence, sourceExpiryForType } from '../services/sourceConfidenceService';

describe('sourceConfidenceService', () => {
  describe('sourceExpiryForType', () => {
    it('returns a future timestamp for known types', () => {
      const now = Date.now();
      const expiry = sourceExpiryForType('news_current');
      expect(expiry).toBeGreaterThan(now);
    });

    it('uses 30-day default for unknown types', () => {
      const now = Date.now();
      const expiry = sourceExpiryForType('unknown_type');
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(now + thirtyDays - 1000);
      expect(expiry).toBeLessThanOrEqual(now + thirtyDays + 1000);
    });

    it('vendor_pricing expires in ~7 days', () => {
      const now = Date.now();
      const expiry = sourceExpiryForType('vendor_pricing');
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(expiry).toBeGreaterThanOrEqual(now + sevenDays - 1000);
    });
  });

  describe('scoreSourceConfidence', () => {
    it('returns UNVERIFIED when source has no URL', () => {
      const result = scoreSourceConfidence({});
      expect(result.confidence).toBe('unverified');
      expect(result.reason).toContain('No source URL');
    });

    it('returns UNVERIFIED when source is null', () => {
      const result = scoreSourceConfidence(null);
      expect(result.confidence).toBe('unverified');
    });

    it('returns FAILED for an invalid URL', () => {
      const result = scoreSourceConfidence({ url: 'not-a-valid-url' });
      expect(result.confidence).toBe('failed');
      expect(result.reason).toContain('invalid');
    });

    it('returns INFERRED for official/developer domains', () => {
      const result = scoreSourceConfidence({ url: 'https://docs.tauri.app/getting-started' });
      expect(result.confidence).toBe('inferred');
    });

    it('returns INFERRED for github.com', () => {
      const result = scoreSourceConfidence({ url: 'https://github.com/tauri-apps/tauri' });
      expect(result.confidence).toBe('inferred');
    });

    it('returns INFERRED when source.official is true', () => {
      const result = scoreSourceConfidence({ url: 'https://example.com', official: true });
      expect(result.confidence).toBe('inferred');
    });

    it('returns TEMPORARY for non-official URLs', () => {
      const result = scoreSourceConfidence({ url: 'https://random-blog.com/article' });
      expect(result.confidence).toBe('temporary');
    });
  });
});
