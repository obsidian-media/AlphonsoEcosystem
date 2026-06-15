const _adapterUsageLog = [];

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

export function runExternalAgentTask(provider, task) {
  const entry = {
    provider: String(provider || 'unknown'),
    task: String(task || '').slice(0, 200),
    requestedAt: Date.now()
  };
  _adapterUsageLog.push(entry);
  if (_adapterUsageLog.length > 50) _adapterUsageLog.shift();
  return {
    enabled: false,
    status: 'not_wired',
    message: 'External agent adapter is local-only. Live provider calls are disabled.',
    tracked: true
  };
}

export function getExternalAdapterUsageLog() {
  return [..._adapterUsageLog];
}
