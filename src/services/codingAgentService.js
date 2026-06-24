import { sendClaudeMessage } from './claudeService';

const CODING_SYSTEM_PROMPT = `You are an expert software engineer. When given a coding task:
1. Write clean, complete, working code
2. Explain what the code does in 2-3 sentences
3. Note any dependencies to install
4. Format code in proper markdown code blocks with language tag`;

const CODING_PATTERNS = /\b(write|create|implement|build|code|debug|fix)\b.{0,40}\b(function|class|component|module|algorithm|migration|query|schema|handler|hook|service|util|helper|program)\b|\b(refactor|debug)\b/i;

// Connector-related keywords that should NOT route to the coding agent even if CODING_PATTERNS matches
const CONNECTOR_BLOCKLIST = /\b(telegram|slack|github|youtube|notion|clickup|whatsapp|instagram|twitter|discord|composio|webhook|channel|repo|repository|issue|pr|pull request|post|send|publish|upload|message|notification)\b/i;

export function isCodingRequest(commandText) {
  const text = String(commandText || '');
  return CODING_PATTERNS.test(text) && !CONNECTOR_BLOCKLIST.test(text);
}

export async function runCodingAgent(task, options = {}) {
  try {
    const response = await sendClaudeMessage(task, {
      system: CODING_SYSTEM_PROMPT,
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
