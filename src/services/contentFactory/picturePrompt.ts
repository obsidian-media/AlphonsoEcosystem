// Miya writes what a picture shows before ComfyUI draws it (owner, 2026-11-02). Until then ComfyUI
// was given the request word for word ("now be creative and generate an image of your thought"),
// and "the same dog" meant nothing to it. For a change to a picture just shown, she is given that
// picture's description and decides whether the new one starts from it.
import { generateAgentLlmResponse } from '../../lib/ollama';
import { parseJsonResponse } from '../../lib/jsonUtils';
import { agentName } from '../jose/agentNames';
import type { EarlierPicture } from './pictureFollowUp';

/** About what an SD-class picture model reads of a prompt (its text encoder stops at 77 tokens). */
export const PICTURE_PROMPT_MAX = 600;
export const MIYA_PROMPT_UNREAD = `${agentName('miya')}'s model didn't answer, so ComfyUI got your words as written.`;

export interface PicturePrompt {
  description: string;
  /** Start from the earlier picture (only when there is one). */
  useEarlier: boolean;
  /** Said in the step's summary when something didn't go as planned. */
  note: string | null;
}

function promptFor(request: string, earlier: EarlierPicture | null): string {
  return [
    `You are ${agentName('miya')}, the creative director. Write the description a picture model draws from.`,
    'Describe only what the picture shows: the subject, what it looks like, the setting, the light and the style, in one line of comma-separated phrases.',
    'Leave out the request\'s own wording ("generate an image of", "now", "please"). Never ask a question.',
    earlier
      ? `The picture just shown in the chat was drawn from: "${earlier.prompt}". If the request changes that picture (the same subject, "it", "him"), keep what it doesn't change and set useEarlier to true; if it asks for something new, set useEarlier to false.`
      : 'There is no earlier picture: set useEarlier to false.',
    `Request: ${request}`,
    'Answer with JSON only: {"description": "...", "useEarlier": true or false}',
  ].join('\n');
}

function read(raw: unknown): { description: string; useEarlier: boolean } | null {
  try {
    const parsed = parseJsonResponse(String(raw || ''));
    const description = typeof parsed?.description === 'string' ? parsed.description.replace(/\s+/g, ' ').trim() : '';
    if (!description) return null;
    return { description: description.slice(0, PICTURE_PROMPT_MAX).trim(), useEarlier: parsed.useEarlier === true };
  } catch {
    return null;
  }
}

/** Miya's description, asked once more when unreadable; the request's own words (with a note) when her model can't answer. */
export async function writePicturePrompt(request: string, earlier: EarlierPicture | null): Promise<PicturePrompt> {
  const prompt = promptFor(request, earlier);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let answer: { response?: unknown } | null = null;
    try {
      answer = await generateAgentLlmResponse('miya', { prompt, format: 'json' });
    } catch {
      break;
    }
    const parsed = read(answer?.response);
    if (parsed) return { ...parsed, useEarlier: Boolean(earlier) && parsed.useEarlier, note: null };
  }
  return { description: request.trim().slice(0, PICTURE_PROMPT_MAX), useEarlier: false, note: MIYA_PROMPT_UNREAD };
}
