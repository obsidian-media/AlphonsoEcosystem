// Which phone setting changes make Alphonso ask less or allow more spending (phone phase 3 part B,
// owner 2026-11-02). The phone asks for Face ID or the fingerprint before one; the computer refuses
// one the phone didn't confirm. One rule, used by both sides.
export function asksLess(setting: string, from: unknown, to: unknown): boolean {
  if (setting === 'approvalMode' || setting === 'zeroCostMode' || setting.startsWith('effect:')) return from === true && to === false;
  if (setting === 'paidModels.allowed') return from !== true && to === true;
  // No cap (null) is the most spending; any raise allows more.
  if (setting === 'paidModels.monthlyCapUsd') return to === null ? from !== null : from !== null && typeof to === 'number' && typeof from === 'number' && to > from;
  return false;
}
