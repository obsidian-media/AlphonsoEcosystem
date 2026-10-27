// Text handed to Chat's message box from elsewhere (agent roles Part C2: Hector's "Use in a
// request"). The app opens Chat on the event; Chat takes the draft once, so it isn't filled twice.
export const OPEN_CHAT_EVENT = 'alphonso:open-chat';

let draft: string | null = null;

export function fillChat(text: string): void {
  draft = String(text || '');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
}

export function takeChatDraft(): string {
  const text = draft || '';
  draft = null;
  return text;
}
