export function listSupportedExternalProviders() {
  return [
    { id: 'openai', enabled: false, status: 'not_wired' },
    { id: 'claude', enabled: false, status: 'not_wired' },
    { id: 'gemini', enabled: false, status: 'not_wired' },
    { id: 'ollama', enabled: false, status: 'not_wired' },
    { id: 'deepseek', enabled: false, status: 'not_wired' },
    { id: 'acc', enabled: false, status: 'not_wired' }
  ];
}

export function runExternalAgentTask() {
  return {
    enabled: false,
    status: 'not_wired',
    message: 'External agent adapter is local-only. Live provider calls are disabled.'
  };
}
