import { generateOllamaResponse, DEFAULT_OLLAMA_ENDPOINT } from '../lib/ollama';
import { listAgentProfiles } from '../agents/agentRegistry';
import type { CrossThreadContextResult } from './boardroomThreadService';

const DEFAULT_MODEL = 'llama3.2:3b';

const LOW_CONFIDENCE_PHRASES = [
  "i'm not sure",
  'i am not sure',
  'not certain',
  'unclear',
  "i don't have enough information",
  'i do not have enough information',
  'hard to say',
  "can't be certain",
  'cannot be certain',
  'would need more context',
  'difficult to determine',
  'no way to know',
  "i don't know enough",
  'i do not know enough'
];

export function detectLowConfidence(text: string): boolean {
  const lower = text.toLowerCase();
  return LOW_CONFIDENCE_PHRASES.some((phrase) => lower.includes(phrase));
}

interface FacilitatorMessage {
  speaker: string;
  content: string;
}

export interface FacilitatorResult {
  ok: boolean;
  text: string;
  error?: string;
  model?: string;
  latencyMs?: number;
}

interface AgentProfileLike {
  id: string;
  name: string;
  title?: string;
  role?: string;
}

function findAgentProfile(agentId: string): AgentProfileLike {
  const profiles = listAgentProfiles() as AgentProfileLike[];
  const found = profiles.find((p) => p.id === agentId);
  if (found) return found;
  return { id: agentId, name: agentId, title: 'Agent', role: 'A general-purpose Boardroom participant.' };
}

function buildAgentSystemPrompt(agentId: string): string {
  const profile = findAgentProfile(agentId);
  const isFacilitator = agentId === 'alphonso';
  const roleLine = isFacilitator
    ? 'Your role: the front-of-room facilitator, plus local operator — execution, verification, packaging, backend/infra, deployments, CI/CD.'
    : `Your role: ${profile.title || profile.role || 'Boardroom participant'}.${profile.role && profile.role !== profile.title ? ` ${profile.role}` : ''}`;
  const facilitatorClause = isFacilitator
    ? `\n\nWhen a message arrives with no @mention, you respond first. Either answer directly if it's something you can genuinely help with, or say plainly who else should weigh in and why, using an @mention (e.g. "@Hector, can you research the current market signals here?") — do not silently do another agent's job.`
    : '';
  return `You are ${profile.name}, a participant in Alphonso's Boardroom — a multi-agent chat where you, Jose, Hector, Miya, Maria, Marcus, Echo, Sentinel, and Nova collaborate with the user (Shayan) on real decisions.

${roleLine}${facilitatorClause}

Be concise and direct, like a real colleague in a live chat, not a formal report. Do not pad with disclaimers. Only speak from your own area of expertise — if something is outside your role, say who should handle it instead of guessing.`;
}

export function buildFacilitatorPrompt({
  topic,
  priorMessages,
  newMessageText,
  agentId = 'alphonso',
  crossThreadContext = []
}: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  agentId?: string;
  crossThreadContext?: CrossThreadContextResult[];
}): string {
  const historyLines = priorMessages.map((m) => `${m.speaker}: ${m.content}`).join('\n');
  const crossThreadLines = crossThreadContext
    .map((c) => `[${c.threadTopic}] ${c.speaker}: ${c.content}`)
    .join('\n');
  return [
    buildAgentSystemPrompt(agentId),
    '',
    `Thread topic: ${topic}`,
    historyLines ? `\nConversation so far:\n${historyLines}` : '',
    crossThreadLines ? `\nRelevant context from other threads (may or may not apply — use judgment):\n${crossThreadLines}` : '',
    `\nuser: ${newMessageText}`,
    `\n${agentId}:`
  ].join('\n');
}

export async function generateAgentResponse({
  agentId,
  topic,
  priorMessages,
  newMessageText,
  crossThreadContext = [],
  endpoint = DEFAULT_OLLAMA_ENDPOINT,
  model = DEFAULT_MODEL,
  signal
}: {
  agentId: string;
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  crossThreadContext?: CrossThreadContextResult[];
  endpoint?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<FacilitatorResult> {
  const prompt = buildFacilitatorPrompt({ topic, priorMessages, newMessageText, agentId, crossThreadContext });
  const startedAt = Date.now();
  try {
    const result = await generateOllamaResponse({ endpoint, model, prompt, signal });
    return { ok: true, text: (result?.response || '').trim(), model, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, text: '', error: (error as Error)?.message || String(error) };
  }
}

export async function generateAlphonsoResponse(params: {
  topic: string;
  priorMessages: FacilitatorMessage[];
  newMessageText: string;
  endpoint?: string;
  model?: string;
}): Promise<FacilitatorResult> {
  return generateAgentResponse({ ...params, agentId: 'alphonso' });
}
