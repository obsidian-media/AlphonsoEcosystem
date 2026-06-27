import { isDeepSeekConfigured, sendDeepSeekMessage } from '../connectors/deepseekConnector.js';

const _adapterUsageLog = [];

export function listSupportedExternalProviders() {
  return [
    { id: 'openai', enabled: false, status: 'not_wired' },
    { id: 'claude', enabled: false, status: 'not_wired' },
    { id: 'gemini', enabled: false, status: 'not_wired' },
    { id: 'ollama', enabled: false, status: 'not_wired' },
    { id: 'deepseek', enabled: isDeepSeekConfigured(), status: isDeepSeekConfigured() ? 'live' : 'no_credentials' },
    { id: 'acc', enabled: false, status: 'not_wired' }
  ];
}

export async function runExternalAgentTask(provider, task) {
  const entry = {
    provider: String(provider || 'unknown'),
    task: String(task || '').slice(0, 200),
    requestedAt: Date.now()
  };
  _adapterUsageLog.push(entry);
  if (_adapterUsageLog.length > 50) _adapterUsageLog.shift();

  if (provider === 'deepseek') {
    if (!isDeepSeekConfigured()) {
      return { enabled: false, status: 'no_credentials', message: 'DeepSeek API key not configured.', tracked: true };
    }
    try {
      const result = await sendDeepSeekMessage([{ role: 'user', content: task }]);
      return { enabled: true, status: 'ok', content: result.content, provider: 'deepseek', tracked: true };
    } catch (err) {
      return { enabled: true, status: 'error', message: String(err.message || err), tracked: true };
    }
  }

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
