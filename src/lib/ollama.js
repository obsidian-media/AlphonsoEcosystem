import { invoke, isTauri } from '@tauri-apps/api/core';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const PREFERRED_MODEL = 'llama3.2:3b';
export const OLLAMA_TROUBLESHOOTING_COMMAND = '$env:OLLAMA_ORIGINS="*"\nollama serve';

const REQUEST_TIMEOUT_MS = 8000;

export function normalizeEndpoint(endpoint) {
  const raw = (endpoint || DEFAULT_OLLAMA_ENDPOINT).trim();
  if (!raw) return DEFAULT_OLLAMA_ENDPOINT;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

export function formatModelSize(size) {
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function classifyOllamaError(error) {
  if (error?.name === 'AbortError') {
    return {
      code: 'timeout',
      label: 'Request timeout',
      message: 'Ollama did not respond before the request timed out.'
    };
  }

  const text = String(error?.message || error || '').toLowerCase();

  if (text.includes('cors') || text.includes('origin')) {
    return {
      code: 'cors',
      label: 'CORS/origin issue',
      message: 'The app reached a browser security boundary. Start Ollama with the allowed origin command below.'
    };
  }

  if (text.includes('failed to fetch') || text.includes('networkerror') || text.includes('load failed')) {
    return {
      code: 'not_running',
      label: 'Ollama not running',
      message: 'Ollama is not reachable at the configured endpoint.'
    };
  }

  return {
    code: 'disconnected',
    label: 'Disconnected',
    message: error?.message || 'Ollama could not be reached.'
  };
}

export async function fetchOllamaModels(endpoint) {
  const baseUrl = normalizeEndpoint(endpoint);
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Ollama /api/tags returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((model) => ({
          name: model.name,
          size: model.size,
          modifiedAt: model.modified_at,
          digest: model.digest,
          details: model.details
        })).filter((model) => Boolean(model.name))
      : [];

    return { models, transport: 'frontend' };
  } catch (error) {
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw error;
    }
    const proof = await invoke('ollama_list_models', {
      endpoint: baseUrl
    });
    const models = Array.isArray(proof?.models)
      ? proof.models.map((model) => ({
          name: model.name,
          size: model.size,
          modifiedAt: model.modifiedAt || model.modified_at,
          digest: model.digest,
          details: model.details
        })).filter((model) => Boolean(model.name))
      : [];
    if (!models.length && proof?.reason) {
      throw new Error(String(proof.reason));
    }
    return { models, transport: 'desktop_bridge' };
  }
}

export function chooseDefaultModel(models, currentModel) {
  const names = models.map((model) => model.name);

  if (currentModel && names.includes(currentModel)) return currentModel;
  if (names.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
  return names[0] || '';
}

export async function checkOllama(endpoint, selectedModel) {
  try {
    const { models, transport } = await fetchOllamaModels(endpoint);
    const names = models.map((model) => model.name);
    const nextSelectedModel = chooseDefaultModel(models, selectedModel);

    if (selectedModel && names.length > 0 && !names.includes(selectedModel)) {
      return {
        state: 'model_missing',
        label: 'Model missing',
        message: `${selectedModel} is not installed in Ollama.${transport === 'desktop_bridge' ? ' Connected through desktop bridge.' : ''}`,
        models,
        selectedModel: nextSelectedModel,
        transport
      };
    }

    if (names.length === 0) {
      return {
        state: 'no_models',
        label: 'No model available',
        message: `Ollama is running, but no local models were returned by /api/tags.${transport === 'desktop_bridge' ? ' Desktop bridge path is active.' : ''}`,
        models,
        selectedModel: '',
        transport
      };
    }

    return {
      state: 'connected',
      label: transport === 'desktop_bridge' ? 'Connected (Desktop Bridge)' : 'Connected',
      message: transport === 'desktop_bridge'
        ? 'Ollama is reachable through the desktop bridge and local models were detected.'
        : 'Ollama is reachable and local models were detected.',
      models,
      selectedModel: nextSelectedModel,
      transport
    };
  } catch (error) {
    const classified = classifyOllamaError(error);
    return {
      state: classified.code,
      label: classified.label,
      message: classified.message,
      error: error?.message || String(error),
      models: [],
      selectedModel: selectedModel || ''
    };
  }
}

export async function generateOllamaResponse({ endpoint, model, prompt }) {
  const baseUrl = normalizeEndpoint(endpoint);
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/generate`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false
      })
    }, 30000);

    if (!response.ok) {
      let message = `Ollama /api/generate returned HTTP ${response.status}`;

      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch {
        // Keep the HTTP status message when Ollama does not return JSON.
      }

      throw new Error(message);
    }

    return response.json();
  } catch (error) {
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw error;
    }

    const proof = await invoke('ollama_generate', {
      endpoint: baseUrl,
      model,
      prompt
    });
    if (!proof || proof.error) {
      throw new Error(proof?.error || 'Desktop bridge generation failed.');
    }
    return {
      response: proof.response || '',
      done: proof.done !== false
    };
  }
}
