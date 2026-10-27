// Agent roles Part C2: Hector's report fills Chat's message box and opens Chat.
import { describe, it, expect, vi } from 'vitest';
import { fillChat, takeChatDraft, OPEN_CHAT_EVENT } from '../../lib/chatDraft';

describe('chatDraft', () => {
  it('keeps the text once and asks the app to open Chat', () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_CHAT_EVENT, opened);
    fillChat('Using Hector\'s report: …');
    expect(opened).toHaveBeenCalledTimes(1);
    expect(takeChatDraft()).toBe('Using Hector\'s report: …');
    expect(takeChatDraft()).toBe('');
    window.removeEventListener(OPEN_CHAT_EVENT, opened);
  });
});
