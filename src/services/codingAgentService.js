import { sendClaudeMessage } from './claudeService';

const CODING_SYSTEM_PROMPT = `You are an expert software engineer. When given a coding task:
1. Write clean, complete, working code
2. Explain what the code does in 2-3 sentences
3. Note any dependencies to install
4. Format code in proper markdown code blocks with language tag`;

const CODING_PATTERNS = /\b(write|create|implement|build|code|debug|fix)\b.{0,40}\b(function|script|class|component|module|app|api|endpoint|algorithm|test|migration|query|schema|handler|hook|service|util|helper|program|code)\b|\b(code|program|script|implement|refactor|debug|fix (this|the) code)\b/i;

export function isCodingRequest(commandText) {
  return CODING_PATTERNS.test(String(commandText || ''));
}

export async function runCodingAgent(task, options = {}) {
  try {
    const response = await sendClaudeMessage(task, {
      systemPrompt: CODING_SYSTEM_PROMPT,
      ...options,
    });
    if (response?.ok && response.content) {
      return { ok: true, content: response.content };
    }
    return { ok: false, error: response?.error || 'No response from coding agent' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
