import { invoke, isTauri } from '@tauri-apps/api/core';
import type { OllamaModelsProof, OllamaGenerateProof } from '../types/tauri-commands';
// Type-only — zero runtime footprint, so this doesn't reintroduce the module
// cycle the dynamic value-imports in generateAgentLlmResponse avoid below.
import type { NvidiaSendResult } from '../services/connectors/nvidiaNimConnector';
import type { GeminiSendResult } from '../services/connectors/geminiConnector';
import type { HermesSendResult } from '../services/connectors/hermesAgentConnector';
import { getStorage } from './appStorage';

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
export const PREFERRED_MODEL = 'qwen2.5-coder:7b';
export const OLLAMA_TROUBLESHOOTING_COMMAND = '$env:OLLAMA_ORIGINS="*"\nollama serve';

const REQUEST_TIMEOUT_MS = 8000;

export interface OllamaModel {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  digest: string | null;
  details: unknown;
}

export interface OllamaErrorClassification {
  code: string;
  label: string;
  message: string;
}

export interface OllamaCheckResult {
  state: string;
  label: string;
  message: string;
  models: OllamaModel[];
  selectedModel: string;
  transport: string;
  error?: string;
}

export interface GenerateStreamOptions {
  endpoint: string;
  model: string;
  prompt: string;
  onToken?: (token: string, full: string) => void;
  signal?: AbortSignal;
}

export interface ChatStreamOptions {
  endpoint: string;
  model: string;
  messages: OllamaMessage[];
  onToken?: (token: string, full: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResponseOptions {
  endpoint: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PullModelOptions {
  endpoint: string;
  model: string;
  onProgress?: (progress: ModelProgress) => void;
}

export interface ModelProgress {
  status: string;
  completed: number | null;
  total: number | null;
  percent: number | null;
}

export interface ModelListItem {
  name: string;
  size: number | null;
  tier: string;
  isCodeModel: boolean;
  isLarge: boolean;
}

export function normalizeEndpoint(endpoint: string | null | undefined): string {
  const raw = (endpoint || DEFAULT_OLLAMA_ENDPOINT).trim();
  if (!raw) return DEFAULT_OLLAMA_ENDPOINT;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withProtocol.replace(/\/+$/, '');
}

// Regression fix for a real QA finding (Q&A E2E Test.md — 6+ call sites
// hardcoded http://localhost:11434, ignoring the "Ollama API Endpoint" field
// in Settings; measured directly by the QA pass repointing Settings at a
// second Ollama on :11500 and seeing chat follow it while several other
// panels/services kept polling :11434). Settings persists to localStorage
// under 'alphonso_settings' (see usePersistenceEffects.js) — this is the one
// place non-component code (services with no React settings prop/context)
// should read the user's configured endpoint from, instead of a literal
// 'http://localhost:11434' string. React components that already receive
// `settings` as a prop should keep using `settings.endpoint` directly and
// pass it through normalizeEndpoint() — this helper is for call sites that
// don't have that prop.
export function getConfiguredOllamaEndpoint(): string {
  const settings = getStorage<{ endpoint?: string } | null>('alphonso_settings', null);
  return normalizeEndpoint(settings?.endpoint);
}

// Same rationale as getConfiguredOllamaEndpoint() above, for the model field.
// A real bug this closes: boardroomFacilitatorService.ts hardcoded
// `DEFAULT_MODEL = 'llama3.2:3b'` as its fallback, which — being always a
// truthy string, never undefined — permanently shadowed generateAgentLlmResponse's
// own `options.model || PREFERRED_MODEL` fallback. Boardroom asked Ollama for
// llama3.2:3b on every turn regardless of what the user actually selected in
// Settings (or whether they even have that model installed), silently ignoring
// PREFERRED_MODEL and the user's own choice alike.
export function getConfiguredOllamaModel(): string {
  const settings = getStorage<{ selectedModel?: string } | null>('alphonso_settings', null);
  return settings?.selectedModel || PREFERRED_MODEL;
}

export function formatModelSize(size: number): string {
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

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortForExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortForExternalSignal();
  else externalSignal?.addEventListener('abort', abortForExternalSignal, { once: true });
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortForExternalSignal);
  }
}

export function classifyOllamaError(error: unknown): OllamaErrorClassification {
  const err = error as { name?: string; message?: string } | null;

  if (err?.name === 'AbortError') {
    return {
      code: 'timeout',
      label: 'Request timeout',
      message: 'Ollama did not respond before the request timed out.'
    };
  }

  const text = String(err?.message || error || '').toLowerCase();

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
    message: err?.message || 'Ollama could not be reached.'
  };
}

function mapOllamaModel(model: { name: string; size: number | null; modifiedAt?: string; modified_at?: string; digest: string | null; details: unknown }): OllamaModel {
  return {
    name: model.name,
    size: model.size,
    modifiedAt: model.modifiedAt || model.modified_at || null,
    digest: model.digest,
    details: model.details
  };
}

export async function fetchOllamaModels(endpoint: string | null | undefined): Promise<{ models: OllamaModel[]; transport: string }> {
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

    const data = await response.json() as { models?: unknown[] };
    const models = Array.isArray(data?.models)
      ? (data.models as Array<{
          name: string;
          size: number | null;
          modified_at?: string;
          digest: string | null;
          details: unknown;
        }>).map(mapOllamaModel).filter((model) => Boolean(model.name))
      : [];

    return { models, transport: 'frontend' };
  } catch (error) {
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw error;
    }
    const proof = await invoke<OllamaModelsProof>('ollama_list_models', {
      endpoint: baseUrl
    });
    const models = Array.isArray(proof?.models)
      ? proof.models.map((model) => ({
          name: model.name,
          size: model.size,
          modifiedAt: model.modifiedAt,
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

export function chooseDefaultModel(models: OllamaModel[], currentModel: string | null | undefined): string {
  const names = models.map((model) => model.name);

  if (currentModel && names.includes(currentModel)) return currentModel;
  if (names.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
  return names[0] || '';
}

const FALLBACK_CHAINS: Record<string, string[]> = {
  'qwen2.5-coder:7b': ['qwen2.5-coder:3b', 'qwen2.5:7b', 'llama3.1:8b'],
  'qwen2.5-coder:3b': ['qwen2.5:3b', 'llama3.2:3b', 'qwen2.5-coder:7b'],
  'qwen2.5:7b': ['llama3.1:8b', 'mistral:7b', 'qwen2.5:3b'],
  'llama3.1:8b': ['mistral:7b', 'qwen2.5:7b', 'qwen2.5:3b'],
  'mistral:latest': ['llama3.2:3b', 'qwen2.5:3b', 'qwen2.5:7b'],
  'gemma2:9b': ['qwen2.5:7b', 'llama3.1:8b', 'phi3:3.8b'],
  'phi3:3.8b': ['qwen2.5:3b', 'llama3.2:3b', 'qwen2.5:7b'],
};

/**
 * Selects the optimal Ollama model for a given task type.
 * Uses the MODEL_TIERS classification to match task types to the most capable model.
 */
export function selectOptimalModel(task: 'code' | 'creative' | 'analysis' | 'chat'): string {
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
 */
export function getModelFallbackChain(primaryModel: string | null | undefined): string[] {
  if (!primaryModel) return [];
  const key = Object.keys(FALLBACK_CHAINS).find((k) => primaryModel.toLowerCase().includes(k.split(':')[0]));
  if (key) return [...FALLBACK_CHAINS[key]];
  const allModels = Object.values(MODEL_TIERS).flat();
  return allModels.filter((m) => m !== primaryModel).slice(0, 3);
}

const MODEL_TIERS: Record<string, string[]> = {
  code_large: ['qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'qwen2.5-coder:32b', 'deepseek-coder:6.7b', 'codellama:7b', 'codellama:13b'],
  code_small: ['qwen2.5-coder:3b', 'qwen2.5-coder:1.5b', 'deepseek-coder:1.3b', 'starcoder:3b'],
  general_large: ['qwen2.5:7b', 'llama3.1:8b', 'mistral:7b', 'gemma2:9b', 'phi3:3.8b'],
  general_small: ['qwen2.5:3b', 'qwen2.5:1.5b', 'llama3.2:3b', 'llama3.2:1b', 'mistral:latest', 'phi2'],
  creative: ['mistral:latest', 'llama3.2:3b', 'qwen2.5:3b']
};

export function classifyModelTier(modelName: string): string {
  const name = String(modelName).toLowerCase();
  for (const [tier, models] of Object.entries(MODEL_TIERS)) {
    if (models.some((m) => name.includes(m.split(':')[0]))) return tier;
  }
  if (/coder|code|starcoder|codellama/i.test(name)) return name.includes('3b') || name.includes('1.5b') ? 'code_small' : 'code_large';
  if (/7b|8b|9b|13b|14b|32b/i.test(name)) return 'general_large';
  if (/1b|3b/i.test(name)) return 'general_small';
  return 'general_small';
}

export function chooseBestModelForTask(models: OllamaModel[], taskType: string): string {
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

export function listAvailableModels(models: OllamaModel[]): ModelListItem[] {
  return models.map((m) => ({
    name: m.name,
    size: m.size,
    tier: classifyModelTier(m.name),
    isCodeModel: /coder|code|starcoder|codellama/i.test(m.name),
    isLarge: /7b|8b|9b|13b|14b|32b/i.test(m.name)
  }));
}

export async function checkOllama(endpoint: string | null | undefined, selectedModel: string | null | undefined): Promise<OllamaCheckResult> {
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
      transport: '',
      error: error instanceof Error ? error.message : String(error),
      models: [],
      selectedModel: selectedModel || ''
    };
  }
}

export async function generateOllamaStream({ endpoint, model, prompt, onToken, signal }: GenerateStreamOptions): Promise<string> {
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
        const data = await response.json() as { error?: string };
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { response?: string; done?: boolean };
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
      throw error;
    }
    const proof = await invoke<OllamaGenerateProof>('ollama_generate', { endpoint: baseUrl, model, prompt });
    if (!proof || proof.error) throw new Error(proof?.error || 'Desktop bridge generation failed.');
    const text = proof.response || '';
    onToken?.(text, text);
    return text;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function generateOllamaChatStream({ endpoint, model, messages, onToken, signal }: ChatStreamOptions): Promise<string> {
  const baseUrl = normalizeEndpoint(endpoint);
  const controller = new AbortController();
  const mergedSignal = signal || controller.signal;
  const timeoutId = window.setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: mergedSignal
    });

    if (!response.ok) {
      let message = `Ollama /api/chat returned HTTP ${response.status}`;
      try {
        const data = await response.json() as { error?: string };
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
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
      throw error;
    }
    const promptFallback = messages
      .map((m) => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
      .join('\n\n');
    const proof = await invoke<OllamaGenerateProof>('ollama_generate', { endpoint: baseUrl, model, prompt: promptFallback });
    if (!proof || proof.error) throw new Error(proof?.error || 'Desktop bridge generation failed.');
    const text = proof.response || '';
    onToken?.(text, text);
    return text;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function generateOllamaResponse({ endpoint, model, prompt, signal }: GenerateResponseOptions): Promise<{ response: string; done: boolean }> {
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
      }),
      signal
    }, 120000);

    if (!response.ok) {
      let message = `Ollama /api/generate returned HTTP ${response.status}`;
      try {
        const data = await response.json() as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        // Keep the HTTP status message when Ollama does not return JSON.
      }
      throw new Error(message);
    }

    return response.json() as Promise<{ response: string; done: boolean }>;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    const classified = classifyOllamaError(error);
    if (!isTauri() || !['cors', 'not_running', 'disconnected', 'timeout'].includes(classified.code)) {
      throw error;
    }

    const proof = await invoke<OllamaGenerateProof>('ollama_generate', {
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

export interface AgentGenerateOptions {
  endpoint?: string;
  model?: string;
  prompt: string;
  signal?: AbortSignal;
  /**
   * A stable id for the logical unit of work this call belongs to — only
   * used when the resolved provider is 'hermes' (see
   * `sendHermesAgentMessage`'s `sessionId` option / §1b.3 in
   * docs/HERMES_AGENT_DELEGATION_PLAN.md). Ignored for every other provider.
   */
  sessionId?: string;
  /** Pass through to the Hermes policy gate once a caller has already resolved approval via the UI. Ignored for every other provider. */
  approved?: boolean;
}

export interface AgentGenerateResult {
  response: string;
  done: boolean;
  /** Which provider actually answered — lets a caller record it on an orchestration receipt (see docs/HERMES_AGENT_DELEGATION_PLAN.md §1b.1's "record backend + resolved model" item). Not yet wired into every receipt-writing call site — only exposed here so a caller can. */
  backend?: AgentModelProviderLike;
  /** The resolved model id actually used for this call. */
  model?: string;
}

// Kept as a bare string union (not imported from modelSelectionService) to
// avoid the same import-cycle risk documented below for the dynamic imports.
type AgentModelProviderLike = 'ollama' | 'nvidia_nim' | 'gemini' | 'hermes';

/**
 * The one shared per-agent LLM dispatcher — every per-agent service should
 * call this instead of `generateOllamaResponse` directly. Resolves that
 * agent's provider *fresh on every call* via `getAgentProvider` (never a
 * cached/stale flag), so a credential removed or a Hermes profile that went
 * down mid-pipeline fails that call with a clear error rather than silently
 * using a stale assumption. Defaults every agent to Ollama — this function
 * changes nothing for anyone who has never touched Settings → Agent
 * Providers. Design doc: docs/HERMES_AGENT_DELEGATION_PLAN.md §1.5
 * (gitignored, local to the machine this was authored on).
 *
 * Dynamic imports avoid a module cycle: `modelSelectionService.ts` already
 * imports from this file (fetchOllamaModels/PREFERRED_MODEL), so a static
 * top-level import of it back here would be circular.
 */
export async function generateAgentLlmResponse(agentId: string, options: AgentGenerateOptions): Promise<AgentGenerateResult> {
  const { getAgentProvider } = await import('../services/modelSelectionService');
  const config = getAgentProvider(agentId);

  if (config.provider === 'ollama') {
    const model = options.model || PREFERRED_MODEL;
    const result = await generateOllamaResponse({
      endpoint: options.endpoint,
      model,
      prompt: options.prompt,
      signal: options.signal
    });
    return { ...result, backend: 'ollama', model };
  }

  const messages = [{ role: 'user', content: options.prompt }];

  if (config.provider === 'nvidia_nim') {
    const { sendNvidiaMessage } = await import('../services/connectors/nvidiaNimConnector');
    const result: NvidiaSendResult = await sendNvidiaMessage(messages, { model: config.model });
    if (!result.ok) throw new Error(('message' in result && result.message) || 'NVIDIA NIM rate limit exceeded');
    return { response: result.content, done: true, backend: 'nvidia_nim', model: result.model };
  }

  if (config.provider === 'gemini') {
    const { sendGeminiMessage } = await import('../services/connectors/geminiConnector');
    const result: GeminiSendResult = await sendGeminiMessage(messages, { model: config.model });
    if (!result.ok) throw new Error(('message' in result && result.message) || 'Gemini rate limit exceeded');
    return { response: result.content, done: true, backend: 'gemini', model: result.model };
  }

  if (config.provider === 'hermes') {
    const { sendHermesAgentMessage } = await import('../services/connectors/hermesAgentConnector');
    const result: HermesSendResult = await sendHermesAgentMessage(agentId, messages, {
      model: config.model,
      sessionId: options.sessionId,
      approved: options.approved
    });
    if (!result.ok) throw new Error(('message' in result && result.message) || 'Hermes profile rate limit exceeded');
    return { response: result.content, done: true, backend: 'hermes', model: result.model };
  }

  throw new Error(`Unknown provider "${(config as { provider: string }).provider}" for agent "${agentId}"`);
}

export async function pullOllamaModel({ endpoint, model, onProgress }: PullModelOptions): Promise<{ ok: boolean; model: string }> {
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
        const data = await response.json() as { error?: string };
        if (data?.error) message = data.error;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let lastStatus = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { status?: string; completed?: number; total?: number };
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
    throw new Error(classified.message || String(error));
  } finally {
    window.clearTimeout(timeoutId);
  }
}
