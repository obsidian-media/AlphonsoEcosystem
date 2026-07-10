import { invoke, isTauri } from '@tauri-apps/api/core';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const PREFERRED_MODEL = 'qwen2.5-coder:7b';
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

  if (
    text.includes('failed to allocate') ||
    text.includes('alloc_tensor_range') ||
    text.includes('unable to allocate') ||
    text.includes('out of memory') ||
    text.includes('cuda_host buffer')
  ) {
    return {
      code: 'out_of_memory',
      label: 'Model too large for available memory',
      message: 'This model needs more RAM/VRAM than your system has free. Try a smaller model, quit other GPU/RAM-heavy apps, or check GPU memory usage before retrying.'
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

const MODEL_TIERS = {
  code_large: ['qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'qwen2.5-coder:32b', 'deepseek-coder:6.7b', 'codellama:7b', 'codellama:13b'],
  code_small: ['qwen2.5-coder:3b', 'qwen2.5-coder:1.5b', 'deepseek-coder:1.3b', 'starcoder:3b'],
  general_large: ['qwen2.5:7b', 'llama3.1:8b', 'mistral:7b', 'gemma2:9b', 'phi3:3.8b'],
  general_small: ['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:3b', 'llama3.2:1b', 'mistral:latest', 'phi2'],
  creative: ['mistral:latest', 'llama3.2:3b', 'qwen2.5:3b']
};

const FALLBACK_CHAINS = {
  'qwen2.5-coder:7b': ['qwen2.5-coder:3b', 'qwen2.5:7b', 'llama3.1:8b'],
  'qwen2.5-coder:3b': ['qwen2.5:3b', 'llama3.2:3b', 'qwen2.5-coder:7b'],
  'qwen2.5:7b': ['llama3.1:8b', 'mistral:7b', 'qwen2.5:3b'],
  'llama3.1:8b': ['mistral:7b', 'qwen2.5:7b', 'qwen2.5:3b'],
  'mistral:latest': ['llama3.2:3b', 'qwen2.5:3b', 'qwen2.5:7b'],
  'gemma2:9b': ['qwen2.5:7b', 'llama3.1:8b', 'phi3:3.8b'],
  'phi3:3.8b': ['qwen2.5:3b', 'llama3.2:3b', 'qwen2.5:7b']
};

/**
 * Selects the optimal Ollama model for a given task type.
 * Uses the MODEL_TIERS classification to match task types to the most capable model.
 *
 * Task-to-model mapping:
 *   code     -> qwen2.5-coder:7b (specialized code model)
 *   creative -> mistral:latest   (creative writing / storytelling)
 *   analysis -> qwen2.5:7b       (reasoning / structured analysis)
 *   chat     -> qwen2.5:7b       (general-purpose conversation)
 *
 * @param {'code'|'creative'|'analysis'|'chat'} task - The type of task
 * @returns {string} Recommended model name for the task type
 */
export function selectOptimalModel(task) {
  switch (task) {
    case 'code':
      return MODEL_TIERS.code_large[0] || 'qwen2.5-coder:7b';
    case 'creative':
      return MODEL_TIERS.creative[0] || 'mistral:latest';
    case 'analysis':
      return MODEL_TIERS.general_large[0] || 'qwen2.5:7b';
    case 'chat':
    default:
      return MODEL_TIERS.general_large[0] || 'qwen2.5:7b';
  }
}

/**
 * Returns an ordered fallback model chain for a given primary model.
 * When the primary model fails (model errors, OOM, etc.), each entry
 * in the returned array is tried in order before giving up.
 *
 * @param {string} primaryModel - The model that was attempted first
 * @returns {string[]} Ordered list of alternative models to try
 */
export function getModelFallbackChain(primaryModel) {
  if (!primaryModel) return [];
  const key = Object.keys(FALLBACK_CHAINS).find(
    (k) => primaryModel.toLowerCase().includes(k.split(':')[0])
  );
  if (key) return [...FALLBACK_CHAINS[key]];
  const allModels = Object.values(MODEL_TIERS).flat();
  return allModels.filter((m) => m !== primaryModel).slice(0, 3);
}

export function classifyModelTier(modelName) {
  const name = String(modelName).toLowerCase();
  for (const [tier, models] of Object.entries(MODEL_TIERS)) {
    if (models.some((m) => name.includes(m.split(':')[0]))) return tier;
  }
  if (/coder|code|starcoder|codellama/i.test(name)) return name.includes('3b') || name.includes('1.5b') ? 'code_small' : 'code_large';
  if (/7b|8b|9b|13b|14b|32b/i.test(name)) return 'general_large';
  if (/1b|3b/i.test(name)) return 'general_small';
  return 'general_small';
}

export function chooseBestModelForTask(models, taskType) {
  const available = models.map((m) => m.name);
  if (taskType === 'code' || taskType === 'generate' || taskType === 'build') {
    const codeModels = [...(MODEL_TIERS.code_large || []), ...(MODEL_TIERS.code_small || [])];
    const match = codeModels.find((m) => available.includes(m));
    if (match) return match;
  }
  if (taskType === 'reason' || taskType === 'plan' || taskType === 'analyze') {
    const largeModels = MODEL_TIERS.general_large || [];
    const match = largeModels.find((m) => available.includes(m));
    if (match) return match;
  }
  if (taskType === 'creative' || taskType === 'write' || taskType === 'draft') {
    const creativeModels = MODEL_TIERS.creative || [];
    const match = creativeModels.find((m) => available.includes(m));
    if (match) return match;
  }
  return chooseDefaultModel(models, '');
}

export function listAvailableModels(models) {
  return models.map((m) => ({
    name: m.name,
    size: m.size,
    tier: classifyModelTier(m.name),
    isCodeModel: /coder|code|starcoder|codellama/i.test(m.name),
    isLarge: /7b|8b|9b|13b|14b|32b/i.test(m.name)
  }));
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

export async function generateOllamaStream({ endpoint, model, prompt, onToken, signal }) {
  const baseUrl = normalizeEndpoint(endpoint);
  const controller = new AbortController();
  const mergedSignal = signal || controller.signal;
  const timeoutId = window.setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true }),
      signal: mergedSignal
    });

    if (!response.ok) {
      let message = `Ollama /api/generate returned HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (typeof obj.response === 'string') {
            full += obj.response;
            onToken?.(obj.response, full);
          }
          if (obj.done) break;
        } catch { /* skip malformed line */ }
      }
    }

    return full;
  } catch (error) {
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw new Error(`Ollama stream generation failed for model ${model}: ${error?.message || error}`);
    }
    const proof = await invoke('ollama_generate', { endpoint: baseUrl, model, prompt });
    if (!proof || proof.error) {
      throw new Error(`Desktop bridge generation failed for model ${model}: ${proof?.error || 'Unknown error'}`);
    }
    const text = proof.response || '';
    onToken?.(text, text);
    return text;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function executeChatStream({ endpoint, model, messages, onToken, signal }) {
  const controller = new AbortController();
  const mergedSignal = signal || controller.signal;
  const timeoutId = window.setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: mergedSignal
    });

    if (!response.ok) {
      let message = `Ollama /api/chat returned HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (typeof obj.message?.content === 'string') {
            full += obj.message.content;
            onToken?.(obj.message.content, full);
          }
          if (obj.done) break;
        } catch { /* skip malformed line */ }
      }
    }

    return full;
  } catch (error) {
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw new Error(`Ollama chat stream failed for model ${model}: ${error?.message || error}`);
    }
    const promptFallback = messages
      .map((m) => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
      .join('\n\n');
    const proof = await invoke('ollama_generate', { endpoint, model, prompt: promptFallback });
    if (!proof || proof.error) {
      throw new Error(`Desktop bridge generation failed for model ${model}: ${proof?.error || 'Unknown error'}`);
    }
    const text = proof.response || '';
    onToken?.(text, text);
    return text;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function generateOllamaChatStream({ endpoint, model, messages, onToken, signal, fallbackModels }) {
  const baseUrl = normalizeEndpoint(endpoint);
  const modelsToTry = [model, ...(fallbackModels || [])];
  let lastError = null;

  for (const tryModel of modelsToTry) {
    try {
      return await executeChatStream({ endpoint: baseUrl, model: tryModel, messages, onToken, signal });
    } catch (error) {
      const classified = classifyOllamaError(error);
      if (['cors', 'not_running', 'disconnected'].includes(classified.code)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error('All models in fallback chain failed.');
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
      // 120s, not 30s: verified live against a real multi-model Ollama
      // instance that a cold model swap (unloading one model, loading
      // another into memory) alone can take 45-50s before generation even
      // starts — total_duration was 73s for a trivial prompt with
      // load_duration accounting for 47s of that. A 30s cap made this
      // reliably fail whenever the requested model wasn't already resident.
    }, 120000);

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
      throw new Error(`Ollama response generation failed for model ${model}: ${error?.message || error}`);
    }

    const proof = await invoke('ollama_generate', {
      endpoint: baseUrl,
      model,
      prompt
    });
    if (!proof || proof.error) {
      throw new Error(`Desktop bridge generation failed for model ${model}: ${proof?.error || 'Unknown error'}`);
    }
    return {
      response: proof.response || '',
      done: proof.done !== false
    };
  }
}

export async function pullOllamaModel({ endpoint, model, onProgress }) {
  const baseUrl = normalizeEndpoint(endpoint);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 600000);

  try {
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: controller.signal
    });

    if (!response.ok) {
      let message = `Ollama /api/pull returned HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lastStatus = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (typeof obj.status === 'string') {
            lastStatus = obj.status;
          }
          if (typeof obj.completed === 'number' && typeof obj.total === 'number') {
            onProgress?.({ status: lastStatus, completed: obj.completed, total: obj.total, percent: Math.round((obj.completed / obj.total) * 100) });
          } else {
            onProgress?.({ status: lastStatus, completed: null, total: null, percent: null });
          }
        } catch { /* skip malformed line */ }
      }
    }

    return { ok: true, model };
  } catch (error) {
    const classified = classifyOllamaError(error);
    throw new Error(`Ollama model pull failed for ${model}: ${classified.message || String(error)}`);
  } finally {
    window.clearTimeout(timeoutId);
  }
}
