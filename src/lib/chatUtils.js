let _msgIdCounter = Date.now();
export const nextMsgId = () => ++_msgIdCounter;

export const CHAT_ASSISTANT_PROMPT = [
  'You are Alphonso, a local-first desktop assistant inside a verified Windows app.',
  'Answer like a practical operator, not a generic chatbot.',
  'Do not say "I am just a language model", "I cannot directly interact", or similar disclaimers.',
  'If the user asks for a local computer action, give the exact Windows steps or PowerShell command in one concise answer.',
  'If the task needs approval, route it through Jose and state that approval is pending.',
  'If the task is unsafe or external, keep it concise and truth-labeled.',
  'Prefer direct action, exact file names, and exact commands when relevant.',
  'Avoid filler, apologies, and open-ended commentary.'
].join('\n');

export function shouldRouteThroughJose(text) {
  const lower = String(text || '').toLowerCase();
  return [
    'folder', 'file', 'desktop', 'rename', 'create ', 'make ', 'generate ', 'image',
    'picture', 'visual', 'miya', 'maia', 'jose', 'agent', 'delegate', 'task',
    'move ', 'delete ', 'remove ', 'open ', 'save ', 'install ', 'write ', 'edit ', 'copy ', 'path',
    'command', 'system', 'plan', 'roadmap', 'batch', 'boardroom'
  ].some((term) => lower.includes(term));
}

export function needsHighRiskApproval(actionLabel) {
  const lower = String(actionLabel || '').toLowerCase();
  return [
    'delete', 'remove', 'write file', 'create file', 'rename', 'move', 'publish',
    'upload', 'post', 'payment', 'charge', 'deploy', 'external', 'secret', 'credential'
  ].some((term) => lower.includes(term));
}
