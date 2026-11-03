// A command from the phone companion (phase 6a). A spoken conversation is a
// direct reply from the chosen agent, as before; anything else goes through
// Jose's one entry (answerOrPlan), with progress sent back as it runs.
import { answerOrPlan, outcomeLine } from './jose/joseInbound';
import { generateOllamaResponse, PREFERRED_MODEL } from '../lib/ollama';
import { getAgentProfile } from '../agents/agentRegistry';

export interface CompanionCommand {
  commandId: string;
  text: string;
  agentId: string;
  language: string;
  voiceConversation: boolean;
}

export interface CompanionDeps {
  broadcast: (event: string, payload: Record<string, unknown>) => Promise<unknown>;
  endpoint?: string;
  model?: string;
  zeroCostMode?: boolean;
  signal: AbortSignal;
}

function progressDetail(progress: any): string {
  if (progress.stage === 'wave_start') return `Wave ${progress.wave + 1}: ${(progress.agents || []).join(', ')}`;
  if (progress.stage === 'executed') return `${progress.assignment?.agent || 'Agent'} completed`;
  return 'Processing...';
}

async function spokenReply(command: CompanionCommand, deps: CompanionDeps): Promise<string> {
  const profile: any = getAgentProfile(command.agentId) || getAgentProfile('alphonso');
  const reply: any = await generateOllamaResponse({
    endpoint: deps.endpoint,
    model: deps.model || PREFERRED_MODEL,
    prompt: [
      `You are ${profile.name}, the Alphonso ${profile.title}.`,
      profile.defaultPrompt,
      `Your permitted focus: ${profile.allowedSummary || profile.purpose}.`,
      `Hard boundary: ${profile.blockedSummary || 'Do not claim external or destructive work was completed.'}`,
      `Reply naturally and concisely in ${command.language}. Never say you are just a language model.`,
      'This is a spoken conversation. Do not claim an action was executed; explain any required approval or handoff instead.',
      `User: ${command.text}`,
    ].filter(Boolean).join('\n\n'),
  } as any);
  return reply?.response || 'I could not prepare a reply.';
}

function requestSummary(result: any): string {
  if (result?.waitingForPlan || Number(result?.pendingApprovalCount) > 0 || result?.ok === false) return outcomeLine(result);
  return result?.command?.userReport?.summary || outcomeLine(result);
}

export async function handleCompanionCommand(command: CompanionCommand, deps: CompanionDeps): Promise<void> {
  const { commandId } = command;
  const live = () => !deps.signal.aborted;
  try {
    let summary: string;
    if (command.voiceConversation) {
      summary = await spokenReply(command, deps);
    } else {
      const result = await answerOrPlan(command.text, {
        source: 'ios_companion',
        endpoint: deps.endpoint,
        zeroCostMode: deps.zeroCostMode,
        onProgress: (progress: any) => {
          if (!live()) return;
          deps.broadcast('agent_status', {
            commandId,
            agent: progress.assignment?.agent || 'jose',
            status: progress.stage,
            detail: progressDetail(progress),
          }).catch(() => {});
        },
      });
      summary = result.kind === 'answer' ? result.text : requestSummary(result.kind === 'request' ? result.result : null);
    }
    if (live()) await deps.broadcast('done', { commandId, summary });
  } catch (err) {
    if (live()) await deps.broadcast('done', { commandId, error: String(err) }).catch(() => {});
  }
}
