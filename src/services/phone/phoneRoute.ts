// What the phone may answer on its own while the computer is off (phone phase 4, owner
// 2026-11-02): Jose's own rules and model decide, with the phone's model passed in. Anything he
// would plan waits for the computer whole, and so does anything that sends, posts, publishes or
// changes a project: in the test round the phone's model answered two sends directly.
import { joseDecisionPrompt, readJoseDecision, ruleRoute } from '../jose/joseDecision';
import { parseJoseCommand } from '../joseCommandRouterService';
import { isCodeRequest } from '../jose/taskTypeMeanings';

export type PhoneRoute = { route: 'answer' | 'computer'; reason: string };
export const NEEDS_COMPUTER = 'This needs your computer. It will start when your computer is back.';

const SEND_WORDS = /\b(send|post|publish|upload|tweet)\b/i;
// The phone doesn't know the computer's saved project names, so "my shop project" counts too.
const MY_PROJECT = /\b(?:my|our)\s+(?:[\w-]+\s+)?(?:project|app|repo|repository|codebase|website)\b/i;
const UNDECIDED = "Jose couldn't decide on this phone.";

export async function phoneRoute(text: string, ask: (system: string, prompt: string) => Promise<string>): Promise<PhoneRoute> {
  const value = String(text || '').trim();
  const byRule = ruleRoute(value);
  if (byRule) return { route: byRule.route === 'plan' ? 'computer' : 'answer', reason: byRule.reason };
  const { intents } = parseJoseCommand(value);
  if (SEND_WORDS.test(value) || MY_PROJECT.test(value) || isCodeRequest(value) || intents.publishing || intents.localExecution) {
    return { route: 'computer', reason: 'It sends something or changes a project: your computer does that.' };
  }
  try {
    const decision = readJoseDecision(await ask('', joseDecisionPrompt(value)));
    if (!decision) return { route: 'computer', reason: UNDECIDED };
    return { route: decision.route === 'plan' ? 'computer' : 'answer', reason: decision.reason };
  } catch {
    return { route: 'computer', reason: UNDECIDED };
  }
}
