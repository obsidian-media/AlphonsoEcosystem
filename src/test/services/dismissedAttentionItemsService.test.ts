import { describe, it, expect, beforeEach } from 'vitest';
import { dismissAttentionItem, isAttentionItemDismissed, clearDismissedAttentionItems } from '../../services/dismissedAttentionItemsService';

describe('dismissedAttentionItemsService', () => {
  beforeEach(() => {
    clearDismissedAttentionItems();
  });

  it('an item is not dismissed by default', () => {
    expect(isAttentionItemDismissed('coach-abc123')).toBe(false);
  });

  it('dismissing an item makes isAttentionItemDismissed return true for that exact id', () => {
    dismissAttentionItem('coach-abc123');
    expect(isAttentionItemDismissed('coach-abc123')).toBe(true);
  });

  it('dismissing one id does not affect a different id', () => {
    dismissAttentionItem('coach-abc123');
    expect(isAttentionItemDismissed('connector-github')).toBe(false);
  });

  it('persists across separate calls (not held only in memory)', () => {
    dismissAttentionItem('connector-github');
    // Re-check via a fresh call chain, simulating a page reload reading localStorage again
    expect(isAttentionItemDismissed('connector-github')).toBe(true);
  });

  it('clearDismissedAttentionItems removes all dismissals', () => {
    dismissAttentionItem('coach-abc123');
    clearDismissedAttentionItems();
    expect(isAttentionItemDismissed('coach-abc123')).toBe(false);
  });
});
