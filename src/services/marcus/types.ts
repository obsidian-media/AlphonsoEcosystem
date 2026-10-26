// Marcus's sends (agent phase 5): where they go, what was prepared, what happened.

export type MarcusConnector = 'slack' | 'discord' | 'telegram' | 'whatsapp' | 'github' | 'notion' | 'clickup' | 'n8n' | 'composio';
export type SendKind = 'message' | 'release' | 'issue' | 'page' | 'task' | 'trigger' | 'composio_action';

export interface Destination {
  connector: MarcusConnector;
  /** A channel, chat (`team` / `me`), number, `owner/repo`, n8n workflow name, or Composio recipient. */
  target: string;
  kind: SendKind;
  /** A release's version, an issue's, page's or task's title. */
  title?: string;
  /** "Slack #news", filled by targetLabel(). */
  label: string;
  composio?: { toolkit: string; tool: string; args: Record<string, unknown> };
}

export interface SendPreview extends Destination {
  text: string;
  /** The step whose work is sent; null for text given to Marcus or quoted in the request. */
  sourceStepId: string | null;
  preparedAtMs: number;
  /** Sentinel's exact checks on the final text (it may be a revision he didn't review). */
  exactFacts?: string[];
}

export type PrepareResult =
  | { ok: true; preview: SendPreview }
  | { ok: false; outcome: 'fix' | 'setup' | 'failed'; reason: string; sourceStepId?: string | null };

export interface SendResult {
  ok: boolean;
  sentence: string;
  link?: string | null;
  platformId?: string | null;
}
