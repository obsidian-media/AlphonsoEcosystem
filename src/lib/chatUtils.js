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
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;

  // Explicit Jose invocation — always route
  if (/^(\/jose\b|ask\s+jose\b|jose[:\s])/i.test(lower)) return true;

  // Image/creative generation requests always go through Jose even when phrased as questions
  const isImageRequest = /(?:generate|create|make|draw|show me|give me|can you make|can you create|can you generate)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:photo|image|picture|illustration|artwork?|render|graphic|visual)/i.test(lower);
  if (isImageRequest) return true;

  // Pure questions → direct to Ollama regardless of topic
  if (lower.endsWith('?')) return false;

  // Conversational openers that are information-seeking → Ollama
  if (/^(what\s+is\b|what\s+are\b|what's\b|how\s+does\b|how\s+do\s+i\b|how\s+do\s+you\b|why\s+does\b|why\s+is\b|why\s+do\b|explain\b|describe\b|tell\s+me\s+about\b|tell\s+me\s+what\b|who\s+is\b|where\s+is\b|when\s+did\b|when\s+does\b|can\s+you\s+explain\b|could\s+you\s+explain\b|help\s+me\s+understand\b|what\s+do\s+you\s+think\b|summarize\b|compare\b|difference\s+between\b|give\s+me\s+an\s+overview\b|overview\s+of\b|thoughts\s+on\b|opinion\s+on\b)/i.test(lower)) return false;

  // Explicit task/action phrases — things the user wants DONE (not just discussed)
  return [
    'create a', 'create an', 'create the', 'create me',
    'build a', 'build an', 'build the', 'build me',
    'make a', 'make an', 'make the', 'make me a', 'make me an',
    'generate a', 'generate an', 'generate the', 'generate me',
    'write a', 'write an', 'write the', 'write code', 'write me',
    'design a', 'design an', 'design the', 'design me',
    'develop a', 'develop an', 'develop the',
    'set up a', 'set up an', 'set up the',
    'show me a photo', 'show me an image', 'show me a picture',
    'a photo of', 'an image of', 'a picture of',
    'photo of', 'image of', 'picture of',
    'scaffold', 'implement a', 'implement an', 'implement the',
    'deploy', 'publish to', 'upload to', 'post to', 'send to',
    'install ', 'npm run', 'npm install', 'yarn run', 'yarn add',
    'git commit', 'git push', 'git pull', 'git clone',
    'docker', 'rename the', 'rename this', 'delete the', 'delete this',
    'remove the', 'remove this', 'move the', 'move this',
    'folder', 'file path', 'desktop file', 'rename file',
    'open the file', 'save the file', 'edit the file', 'edit the config', 'edit the settings',
    'run a command', 'run the command', 'execute a', 'execute the',
    'miya', 'hector ', 'alphonso agent',
    'ask miya', 'ask hector', 'ask alphonso', 'ask agent',
    'tell miya', 'tell hector', 'delegate to', 'delegate this',
    'agent task', 'run a task', 'batch', 'boardroom',
    'roadmap plan', 'workflow plan', 'task plan'
  ].some((term) => lower.includes(term));
}

export function needsHighRiskApproval(actionLabel) {
  const lower = String(actionLabel || '').toLowerCase();
  return [
    'delete', 'remove', 'write file', 'create file', 'rename', 'move', 'publish',
    'upload', 'post', 'payment', 'charge', 'deploy', 'external', 'secret', 'credential'
  ].some((term) => lower.includes(term));
}
