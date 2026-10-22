// Separates a thinking model's reasoning from its answer (owner, 2026-10-22:
// the reasoning is shown folded, or hidden by a setting). Current Ollama
// returns it apart (`message.thinking`); older versions put it inside the
// answer between <think> and </think>, which this handles while streaming
// too (an unclosed <think> is still reasoning).

export interface SplitReply {
  thinking: string;
  answer: string;
}

export function splitThinking(text: string): SplitReply {
  const raw = String(text || '');
  const thinkingParts: string[] = [];
  let answer = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner: string) => {
    thinkingParts.push(inner.trim());
    return '';
  });
  const open = answer.search(/<think>/i);
  if (open !== -1) {
    thinkingParts.push(answer.slice(open + '<think>'.length).trim());
    answer = answer.slice(0, open);
  }
  return {
    thinking: thinkingParts.filter(Boolean).join('\n\n'),
    answer: answer.replace(/^\s+/, ''),
  };
}

/** Joins reasoning that arrived separately with reasoning found in tags. */
export function joinThinking(...parts: Array<string | undefined | null>): string {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join('\n\n');
}
