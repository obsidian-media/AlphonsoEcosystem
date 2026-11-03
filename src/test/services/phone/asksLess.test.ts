import { describe, it, expect } from 'vitest';
import { asksLess } from '../../../services/phone/asksLess';

describe('asksLess', () => {
  it('switching a guard off asks less; switching it on does not', () => {
    for (const s of ['approvalMode', 'zeroCostMode', 'effect:run']) {
      expect(asksLess(s, true, false)).toBe(true);
      expect(asksLess(s, false, true)).toBe(false);
    }
  });
  it('paid models on, a higher cap or no cap allow more spending', () => {
    expect(asksLess('paidModels.allowed', false, true)).toBe(true);
    expect(asksLess('paidModels.allowed', true, false)).toBe(false);
    expect(asksLess('paidModels.monthlyCapUsd', 10, 20)).toBe(true);
    expect(asksLess('paidModels.monthlyCapUsd', 10, null)).toBe(true);
    expect(asksLess('paidModels.monthlyCapUsd', null, 20)).toBe(false);
    expect(asksLess('paidModels.monthlyCapUsd', 10, 5)).toBe(false);
  });
  it('notifications and days never need confirming', () => {
    expect(asksLess('notify:finished', true, false)).toBe(false);
    expect(asksLess('waitingExpiryDays', 7, 0)).toBe(false);
  });
});
