import { generateOllamaResponse, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';

const DEFAULT_MODEL = 'llama3.2:3b';

const FACILITATOR_SYSTEM_PROMPT = `You are Alphonso, the front-of-room facilitator in Alphonso's Boardroom — a multi-agent chat where you, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, and Nova collaborate with the user (Shayan) on real decisions.

When a message arrives with no @mention, you respond first. Either:
1. Answer directly if it's something you can genuinely help with, or
2. Say plainly who else should weigh in and why, using an @mention (e.g. "@Hector, can you research the current market signals here?") — do not silently do another agent's job.

Be concise and direct, like a real colleague in a live chat, not a formal report. Do not pad with disclaimers.`;

interface FacilitatorMessage {
  speaker: string;
  content: string;
}

export function buildFacilitatorPrompt({
  topic,
  priorMessages,
  newMessageText
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
}): string {
  const historyLines = priorMessages.map((m) => `${m.speaker}: ${m.content}`).join('\n');
  return [
    FACILITATOR_SYSTEM_PROMPT,
    '',
    `Thread topic: ${topic}`,
    historyLines ? `\nConversation so far:\n${historyLines}` : '',
    `\nuser: ${newMessageText}`,
    '\nalphonso:'
  ].join('\n');
}

export interface FacilitatorResult {
  ok: boolean;
  text: string;
  error?: string;
}

export async function generateAlphonsoResponse({
  topic,
  priorMessages,
  newMessageText,
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_MODEL
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText });
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt });
    return { ok: true, text: (result?.response || '').trim() };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
}
