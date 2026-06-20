import { TRUST_STATES, timestampMs, trustColor } from '../services/trustModel';

describe('trustModel', () => {
  describe('TRUST_STATES', () => {
    it('exports all expected trust state keys', () => {
      const expected = ['VERIFIED', 'INFERRED', 'PENDING', 'TEMPORARY', 'UNVERIFIED', 'USER_CONFIRMED', 'FAILED', 'STALE', 'EXPIRED', 'PLACEHOLDER'];
      expected.forEach((key) => {
        expect(TRUST_STATES[key]).toBeDefined();
        expect(typeof TRUST_STATES[key]).toBe('string');
      });
    });

    it('has unique string values', () => {
      const values = Object.values(TRUST_STATES);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  describe('timestampMs', () => {
    it('returns a number close to Date.now()', () => {
      const before = Date.now();
      const result = timestampMs();
      const after = Date.now();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });

  describe('trustColor', () => {
    it('returns green for VERIFIED', () => {
      expect(trustColor(TRUST_STATES.VERIFIED)).toBe('green');
    });

    it('returns green for USER_CONFIRMED', () => {
      expect(trustColor(TRUST_STATES.USER_CONFIRMED)).toBe('green');
    });

    it('returns blue for INFERRED', () => {
      expect(trustColor(TRUST_STATES.INFERRED)).toBe('blue');
    });

    it('returns amber for PENDING', () => {
      expect(trustColor(TRUST_STATES.PENDING)).toBe('amber');
    });

    it('returns amber for TEMPORARY', () => {
      expect(trustColor(TRUST_STATES.TEMPORARY)).toBe('amber');
    });

    it('returns amber for STALE', () => {
      expect(trustColor(TRUST_STATES.STALE)).toBe('amber');
    });

    it('returns red for FAILED', () => {
      expect(trustColor(TRUST_STATES.FAILED)).toBe('red');
    });

    it('returns zinc for EXPIRED', () => {
      expect(trustColor(TRUST_STATES.EXPIRED)).toBe('zinc');
    });

    it('returns indigo for PLACEHOLDER', () => {
      expect(trustColor(TRUST_STATES.PLACEHOLDER)).toBe('indigo');
    });

    it('returns zinc for UNVERIFIED', () => {
      expect(trustColor(TRUST_STATES.UNVERIFIED)).toBe('zinc');
    });

    it('returns zinc for unknown state', () => {
      expect(trustColor('not_a_real_state')).toBe('zinc');
      expect(trustColor(undefined)).toBe('zinc');
    });
  });
});
