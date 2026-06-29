import { isDeepSeekConfigured, sendDeepSeekMessage } from '../connectors/deepseekConnector.js';
import { sendChatGPTMessage } from '../chatgptService.js';
import { sendClaudeMessage } from '../claudeService.js';
import { isConnectorAuthenticated } from './connectorRegistryService.js';
import { generateOllamaChatStream } from '../../lib/ollama.js';

const _adapterUsageLog = [];

export function listSupportedExternalProviders() {
  return [
    { id: 'openai', enabled: false, status: isConnectorAuthenticated('chatgpt').ok ? 'live' : 'no_credentials' },
    { id: 'claude', enabled: false, status: isConnectorAuthenticated('claude').ok ? 'live' : 'no_credentials' },
    { id: 'gemini', enabled: false, status: 'planned_v2.6' },
    { id: 'ollama', enabled: true, status: 'live' },
    { id: 'deepseek', enabled: isDeepSeekConfigured(), status: isDeepSeekConfigured() ? 'live' : 'no_credentials' },
    { id: 'acc', enabled: false, status: 'not_wired' }
  ];
}

export async function runExternalAgentTask(provider, task, options = {}) {
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

  if (provider === 'openai') {
    const auth = isConnectorAuthenticated('chatgpt');
    if (!auth.ok) {
      return { enabled: false, status: 'no_credentials', message: 'OpenAI/ChatGPT API key not configured.', tracked: true };
    }
    try {
      const result = await sendChatGPTMessage(task, { ...options, stream: false });
      return { enabled: true, status: 'ok', content: result.text, provider: 'openai', tracked: true };
    } catch (err) {
      return { enabled: true, status: 'error', message: String(err.message || err), tracked: true };
    }
  }

  if (provider === 'claude') {
    const auth = isConnectorAuthenticated('claude');
    if (!auth.ok) {
      return { enabled: false, status: 'no_credentials', message: 'Claude API key not configured.', tracked: true };
    }
    try {
      const result = await sendClaudeMessage(task, { ...options, stream: false });
      return { enabled: true, status: 'ok', content: result.text, provider: 'claude', tracked: true };
    } catch (err) {
      return { enabled: true, status: 'error', message: String(err.message || err), tracked: true };
    }
  }

  if (provider === 'ollama') {
    try {
      const model = options.model || 'llama3.1';
      const endpoint = options.endpoint || 'http://localhost:11434';
      let content = '';
      await generateOllamaChatStream({ endpoint, model, messages: [{ role: 'user', content: task }], onToken: (t) => { content = t; } });
      return { enabled: true, status: 'ok', content, provider: 'ollama', tracked: true };
    } catch (err) {
      return { enabled: true, status: 'error', message: String(err.message || err), tracked: true };
    }
  }

  return {
    enabled: false,
    status: 'not_wired',
    message: 'Not yet available. Live integration is planned but not yet wired.',
    tracked: true
  };
}

export function getExternalAdapterUsageLog() {
  return [..._adapterUsageLog];
}