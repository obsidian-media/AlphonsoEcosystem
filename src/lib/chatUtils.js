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
    'command', 'system', 'plan', 'roadmap', 'batch', 'boardroom',
    'build', 'app', 'code', 'deploy', 'test', 'run ', 'start', 'scaffold', 'stack',
    'frontend', 'backend', 'api', 'database', 'server', 'cli', 'tool', 'project',
    'setup', 'configure', 'compile', 'bundle', 'package', 'npm', 'yarn', 'git ',
    'docker', 'compose', 'react', 'next', 'vue', 'angular', 'node', 'python',
    'flask', 'django', 'express', 'fastapi', 'typescript', 'javascript', 'html', 'css',
    'tailwind', 'prisma', 'postgres', 'mysql', 'mongo', 'redis', 'graphql', 'rest',
    'auth', 'login', 'dashboard', 'admin', 'panel', 'settings', 'config',
    'migration', 'schema', 'model', 'controller', 'route', 'component', 'page',
    'layout', 'theme', 'prototype', 'architecture', 'ci', 'cd', 'pipeline',
    'workflow', 'automation', 'script', 'lib', 'library', 'module', 'dependency',
    'plugin', 'extension', 'integration', 'connector', 'gateway', 'proxy',
    'cache', 'queue', 'worker', 'job', 'debug', 'log', 'monitor', 'metric',
    'analytics', 'chart', 'form', 'input', 'validation', 'encrypt', 'hash',
    'permission', 'access', 'security', 'backup', 'restore', 'upgrade',
    'release', 'version', 'documentation', 'tutorial', 'guide', 'reference',
    'sdk', 'web', 'mobile', 'desktop', 'cloud', 'machine learning', 'ai ',
    'deep learning', 'neural', 'data', 'insight', 'predict', 'recommend',
    'automate', 'orchestrat', 'integrat', 'optimi', 'perform', 'scalab',
    'reliab', 'resili', 'fault', 'disaster', 'monitor', 'observ'
  ].some((term) => lower.includes(term));
}

export function needsHighRiskApproval(actionLabel) {
  const lower = String(actionLabel || '').toLowerCase();
  return [
    'delete', 'remove', 'write file', 'create file', 'rename', 'move', 'publish',
    'upload', 'post', 'payment', 'charge', 'deploy', 'external', 'secret', 'credential'
  ].some((term) => lower.includes(term));
}
