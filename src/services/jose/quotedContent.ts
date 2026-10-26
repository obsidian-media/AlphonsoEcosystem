// What a request quotes is content, not instructions (agent phase 4), shared by Jose's
// rule plan and Marcus's destinations (agent phase 5).

/** "Check this post …: <the post>": what follows the colon is the content. */
export const CONTENT_AFTER = /\b(?:this|the|my|our)\s+(?:post|email|message|text|tweet|caption|ad|copy|reply|page|notes|release notes)\b[^:\n]{0,80}:/i;
export const QUOTED = /"[^"]*"|“[^”]*”/g;
/** "before I publish it" says when, it doesn't ask for a send. */
export const NOT_A_SEND = /\bbefore (?:i |we |you )?(?:publish|post|send|share)(?:ing)?(?: it| this| them)?\b/gi;

/** The request without the content it quotes: words inside a post aren't instructions. */
export function withoutQuotedContent(text: string): string {
  let out = String(text || '').replace(QUOTED, ' ');
  const m = out.match(CONTENT_AFTER);
  if (m && m.index !== undefined) out = out.slice(0, m.index + m[0].length);
  return out.replace(NOT_A_SEND, ' ');
}

/** The quoted pieces of a request, in order. */
export function quotedPieces(text: string): string[] {
  return (String(text || '').match(QUOTED) || []).map((q) => q.slice(1, -1).trim()).filter(Boolean);
}
