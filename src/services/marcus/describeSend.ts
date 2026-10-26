// The approval line for a prepared Marcus send (agent phase 5). Kept apart from the preparation so
// pure modules (Telegram's notifications) can use it.
import type { SendPreview } from './types';

function quote(text: string): string {
  const t = String(text || '').trim();
  return `“${t.length > 200 ? `${t.slice(0, 199)}…` : t}”`;
}

function toolWords(tool: string, toolkit: string): string {
  const words = String(tool || '').toLowerCase().split('_').filter(Boolean);
  if (words[0] === String(toolkit || '').toLowerCase()) words.shift();
  return words.join(' ');
}

/** The approval line: "Send to Slack #news: “…”", with Sentinel's exact facts when there are any. */
export function describeSend(preview: SendPreview): string {
  let line: string;
  switch (preview.kind) {
    case 'release': line = `Make a draft release ${preview.title || ''} on ${preview.label}: ${quote(preview.text)}`.replace('release  on', 'release on'); break;
    case 'issue': line = `Open an issue on ${preview.label}: ${quote(preview.text)}`; break;
    case 'page': line = `Make a Notion page: ${quote(preview.text)}`; break;
    case 'task': line = `Make a ClickUp task: ${quote(preview.text)}`; break;
    case 'trigger': line = `Start your ${preview.label} with: ${quote(preview.text)}`; break;
    case 'composio_action':
      line = `${preview.label}: ${toolWords(preview.composio?.tool || '', preview.composio?.toolkit || '')}${preview.target ? ` to ${preview.target}` : ''}: ${quote(preview.text)}`;
      break;
    default: line = `Send to ${preview.label}: ${quote(preview.text)}`;
  }
  if (preview.exactFacts?.length) {
    line += ` Sentinel's checks found: ${preview.exactFacts.map((f) => `${f.split(':')[0]}.`).join(' ')}`;
  }
  return line;
}
