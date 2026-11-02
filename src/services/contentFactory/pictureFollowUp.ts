// A follow-up to a picture just shown in Chat (owner, 2026-11-02): after a picture of a dog,
// "now make the same dog wear a different costume" has no picture word, so it went to Alphonso,
// who answered in words. A message that refers back to a picture shown in the last few messages
// is Miya's next picture, and she gets the earlier one to start from.
import { isPlainQuestion } from '../../lib/chatUtils';
import { parseJoseCommand } from '../joseCommandRouterService';
import { listChatMedia } from './chatMediaStore';

/** How far back in the chat a picture still counts as "the one just shown": the last two turns. */
export const RECENT_MESSAGES = 4;

/** Words that point back at something already in the chat. */
const REFERS_BACK = /\b(same|it|its|this|that|these|those|him|her|them|they|instead|again|another|different)\b/i;

export interface EarlierPicture { path: string; prompt: string }

/** The picture a message asks to change, or null when it asks for something else. */
export function earlierPictureFor(text: string, history: { role: string; content: string }[] | undefined): EarlierPicture | null {
  const value = String(text || '').trim();
  if (!value || !REFERS_BACK.test(value) || isPlainQuestion(value)) return null;
  // Research, writing, a check, a send or code that mentions "it" is still that work.
  const { intents } = parseJoseCommand(value);
  if (intents.research || intents.writing || intents.check || intents.publishing || intents.localExecution) return null;
  const recent = (history || []).slice(-RECENT_MESSAGES).reverse();
  const pictures = listChatMedia().filter((r) => r.kind === 'picture' && r.status === 'done' && r.path);
  for (const message of recent) {
    const content = String(message?.content || '');
    const found = pictures.find((p) => content.includes(p.path));
    if (found) return { path: found.path, prompt: found.prompt };
  }
  return null;
}
