import { TRUST_STATES, timestampMs } from './trustModel';
import { pushMemory } from './unifiedMemoryService';

const COMPOSIO_CONFIG_KEY = 'alphonso_composio_config_v1';
const COMPOSIO_TOOLS_CACHE_KEY = 'alphonso_composio_tools_v1';
const COMPOSIO_CACHE_TTL_MS = 300_000; // 5 minutes

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3';

// ── Configuration ───────────────────────────────────────────────────────────

export function getComposioConfig() {
  try {
    const raw = localStorage.getItem(COMPOSIO_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, apiKey: '', userId: 'alphonso-user' };
  } catch {
    return { enabled: false, apiKey: '', userId: 'alphonso-user' };
  }
}

export function setComposioConfig(config) {
  const merged = { ...getComposioConfig(), ...config };
  localStorage.setItem(COMPOSIO_CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

export function isComposioEnabled() {
  const config = getComposioConfig();
  return config.enabled && config.apiKey && config.apiKey.length > 8;
}

// ── Tool Discovery ──────────────────────────────────────────────────────────

export async function fetchComposioToolkits() {
  const config = getComposioConfig();
  if (!config.apiKey) return { toolkits: [], error: 'No API key configured' };

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/v1/apps`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Composio API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const toolkits = Array.isArray(data?.items)
      ? data.items.map((item) => ({
          key: item.key || item.name?.toLowerCase(),
          name: item.name,
          description: item.description || '',
          logo: item.logo || '',
          categories: item.categories || [],
          enabled: item.enabled !== false
        }))
      : [];

    // Cache the toolkits
    localStorage.setItem(COMPOSIO_TOOLS_CACHE_KEY, JSON.stringify({
      toolkits,
      cachedAtMs: timestampMs()
    }));

    return { toolkits, error: null };
  } catch (error) {
    return { toolkits: [], error: String(error?.message || error) };
  }
}

export function getCachedToolkits() {
  try {
    const raw = localStorage.getItem(COMPOSIO_TOOLS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (timestampMs() - parsed.cachedAtMs > COMPOSIO_CACHE_TTL_MS) return null;
    return parsed.toolkits || [];
  } catch {
    return null;
  }
}

// ── Tool Execution ──────────────────────────────────────────────────────────

export async function executeComposioAction({ toolkit, actionName, params }) {
  const config = getComposioConfig();
  if (!config.apiKey) return { error: 'No API key configured', success: false };

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/v1/actions/${actionName}/execute`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: config.userId,
        app_name: toolkit,
        input: params || {}
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || `Composio action returned HTTP ${response.status}`);
    }

    const result = await response.json();
    return { success: true, data: result, error: null };
  } catch (error) {
    return { success: false, data: null, error: String(error?.message || error) };
  }
}

// ── Agent Integration ───────────────────────────────────────────────────────

export async function getComposioToolsForAgent(agentName, toolkitFilter = []) {
  const config = getComposioConfig();
  if (!config.apiKey) return { tools: [], error: 'No API key configured' };

  try {
    const toolkitsParam = toolkitFilter.length > 0 ? `&toolkits=${toolkitFilter.join(',')}` : '';
    const response = await fetch(`${COMPOSIO_API_BASE}/v1/actions?entity_id=${config.userId}${toolkitsParam}`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Composio API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const tools = Array.isArray(data?.items)
      ? data.items.map((item) => ({
          name: item.name,
          description: item.description || '',
          toolkit: item.app_name || item.toolkit || '',
          parameters: item.parameters || {},
          enabled: item.enabled !== false
        }))
      : [];

    return { tools, error: null };
  } catch (error) {
    return { tools: [], error: String(error?.message || error) };
  }
}

// ── Execution via Agent Brain ───────────────────────────────────────────────

export async function executeViaComposio(commandText, agentName, options = {}) {
  if (!isComposioEnabled()) {
    return {
      success: false,
      error: 'Composio not enabled',
      fallback: true,
      note: 'Configure API key in Settings to enable external tool access'
    };
  }

  const config = getComposioConfig();
  const toolkits = options.toolkits || [];

  // Get available tools
  const { tools, error: toolsError } = await getComposioToolsForAgent(agentName, toolkits);
  if (toolsError) {
    return { success: false, error: toolsError };
  }

  if (tools.length === 0) {
    return { success: false, error: 'No tools available for this agent' };
  }

  // Build tool descriptions for LLM prompt
  const toolDescriptions = tools
    .slice(0, 20)
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');

  // Ask LLM which tool to use
  const { generateOllamaResponse } = await import('../lib/ollama');
  const { parseJsonResponse } = await import('../lib/jsonUtils');
  const { getModelForTask } = await import('./modelSelectionService');

  const prompt = [
    'You are Alphonso. The user wants to execute a command using external tools.',
    'Choose the best tool from the available list.',
    '',
    'COMMAND: ' + commandText,
    '',
    'AVAILABLE TOOLS:',
    toolDescriptions,
    '',
    'Return ONLY a JSON object with:',
    '{ "tool": "tool_name", "toolkit": "toolkit_name", "params": {}, "reasoning": "why this tool" }',
    '',
    'If no tool is appropriate, return: { "tool": null, "reasoning": "why no tool fits" }',
    '',
    'Return ONLY the JSON object.'
  ].join('\n');

  try {
    const response = await generateOllamaResponse({
      endpoint: options.endpoint,
      prompt,
      model: getModelForTask('reason')
    });

    const parsed = parseJsonResponse(response?.response);
    if (!parsed || !parsed.tool) {
      return {
        success: false,
        error: 'No suitable tool found',
        reasoning: parsed?.reasoning || 'LLM did not select a tool'
      };
    }

    // Execute the selected tool
    const result = await executeComposioAction({
      toolkit: parsed.toolkit,
      actionName: parsed.tool,
      params: parsed.params || {}
    });

    // Log to memory
    pushMemory({
      namespace: 'shared',
      title: `Composio action: ${parsed.tool}`,
      category: 'orchestration_memory',
      content: {
        command: commandText.slice(0, 200),
        tool: parsed.tool,
        toolkit: parsed.toolkit,
        success: result.success,
        error: result.error
      },
      source: 'composio-connector',
      sourceAgent: agentName,
      confidence: result.success ? TRUST_STATES.VERIFIED : TRUST_STATES.FAILED
    });

    return {
      success: result.success,
      data: result.data,
      tool: parsed.tool,
      toolkit: parsed.toolkit,
      reasoning: parsed.reasoning,
      error: result.error
    };
  } catch (error) {
    return { success: false, error: String(error?.message || error) };
  }
}

// ── Status & Health ─────────────────────────────────────────────────────────

export async function checkComposioHealth() {
  const config = getComposioConfig();
  if (!config.apiKey) {
    return { status: 'not_configured', enabled: false, message: 'API key not set' };
  }

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/health`, {
      method: 'GET',
      headers: { 'X-API-Key': config.apiKey }
    });

    if (response.ok) {
      return { status: 'healthy', enabled: true, message: 'Composio API is reachable' };
    }

    return { status: 'error', enabled: false, message: `API returned HTTP ${response.status}` };
  } catch (error) {
    return { status: 'error', enabled: false, message: String(error?.message || error) };
  }
}

export function getComposioStatus() {
  const config = getComposioConfig();
  const cached = getCachedToolkits();
  return {
    enabled: config.enabled,
    hasApiKey: !!config.apiKey,
    apiKeyPrefix: config.apiKey ? config.apiKey.slice(0, 8) + '...' : '',
    userId: config.userId,
    cachedToolkits: cached?.length || 0,
    cachedAtMs: cached ? timestampMs() : null
  };
}
