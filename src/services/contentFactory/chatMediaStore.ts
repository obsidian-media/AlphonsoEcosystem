// What Miya made from Chat, Telegram or the board (pictures, videos, music), kept so Chat can show
// it and a follow-up can find the picture it refers to. Split from chatMedia.ts (2026-11-02) so
// Jose's routing can read it without loading the media tools.
import { agentName } from '../jose/agentNames';

const STORE_KEY = 'alphonso_chat_media_v1';
const KEEP = 100;

export type ChatMediaKind = 'video' | 'music' | 'picture';

export interface ChatMediaResult {
  id: string;
  kind: ChatMediaKind;
  /** What was made: Miya's description for a picture, else the words asked for. */
  prompt: string;
  /** Relative to the output folder. */
  path: string;
  status: 'done' | 'pending';
  atMs: number;
  /** A clip still in ComfyUI. */
  jobId?: string;
  commandId?: string;
  shownInChat?: boolean;
}

export function listChatMedia(): ChatMediaResult[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveChatMediaResult(result: ChatMediaResult): void {
  const rest = listChatMedia().filter((r) => r.id !== result.id);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([result, ...rest].slice(0, KEEP)));
  } catch {
    // The file is still in the folder.
  }
}

const KIND_WORDS: Record<ChatMediaKind, string> = { picture: 'a picture', video: 'a video', music: 'music' };

/** Chat's line for something Miya made: what, of what, and where it is. A follow-up finds the
 *  picture it refers to by this path (pictureFollowUp.ts). */
export function chatMediaLine(result: Pick<ChatMediaResult, 'kind' | 'prompt' | 'path'>): string {
  return `${agentName('miya')} made ${KIND_WORDS[result.kind] || 'something'}: ${result.prompt} (${result.path})`;
}
