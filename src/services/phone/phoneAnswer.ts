// Answering on the phone while the computer is off (phone phase 4, owner 2026-11-02): Jose decides
// with the phone's model (phoneRoute), then Alphonso answers with his own prompt and Echo's mirrored
// decisions. The model is passed in: Apple's on-device model or OpenRouter's free models.
import { ALPHONSO_ANSWER_PROMPT } from '../alphonso/answerPrompt';
import { decisionsBlockFrom } from '../echo/recall';
import type { Decision } from '../echo/decisions';
import { NEEDS_COMPUTER, phoneRoute } from './phoneRoute';

export type PhoneEngine = 'phone' | 'openrouter';
export const ENGINE_LABEL: Record<PhoneEngine, string> = {
  phone: 'Answered on this phone',
  openrouter: 'Answered with OpenRouter (free)',
};
export const PHONE_ENGINES = Object.keys(ENGINE_LABEL) as PhoneEngine[];

export type Ask = (system: string, prompt: string) => Promise<string>;
export type PhoneAnswerResult = { kind: 'answer'; text: string } | { kind: 'computer'; reason: string } | { kind: 'failed'; reason: string };

const HISTORY = 6;

export async function answerOnPhone(input: {
  text: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  decisions: Decision[];
  ask: Ask;
}): Promise<PhoneAnswerResult> {
  const text = String(input.text || '').trim();
  const route = await phoneRoute(text, input.ask);
  if (route.route === 'computer') return { kind: 'computer', reason: NEEDS_COMPUTER };
  const prompt = [
    decisionsBlockFrom(input.decisions, text),
    input.history.slice(-HISTORY).map((m) => `${m.role}: ${m.text}`).join('\n'),
    `User: ${text}`,
  ].filter(Boolean).join('\n\n');
  try {
    const answer = String(await input.ask(ALPHONSO_ANSWER_PROMPT, prompt) || '').trim();
    return answer ? { kind: 'answer', text: answer } : { kind: 'failed', reason: 'No answer came back.' };
  } catch (e) {
    return { kind: 'failed', reason: e instanceof Error && e.message ? e.message : 'No answer came back.' };
  }
}
