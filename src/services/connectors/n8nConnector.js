import { getConnectorCredential } from './connectorAuth';

const N8N_DEFAULT_BASE_URL = 'http://localhost:5678';

function getN8nBaseUrl() {
  return getConnectorCredential('n8n', 'N8N_BASE_URL') || N8N_DEFAULT_BASE_URL;
}

/**
 * Check if n8n instance is healthy.
 * @returns {Promise<{ ok: boolean, status: string, statusCode?: number }>}
 */
export async function isN8nHealthy() {
  const baseUrl = getN8nBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return {
      ok: response.ok,
      status: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: `connection_failed: ${String(error?.message || error).slice(0, 100)}`,
    };
  }
}

/**
 * Trigger an n8n webhook by path.
 * @param {string} webhookPath - The webhook path (e.g., "my-workflow" or "hook/abc123")
 * @param {object} payload - JSON payload to send to the webhook
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function triggerN8nWebhook(webhookPath, payload = {}) {
  const baseUrl = getN8nBaseUrl();
  const normalizedPath = String(webhookPath || '').replace(/^\/+/, '');

  try {
    const response = await fetch(`${baseUrl}/webhook/${normalizedPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { raw: await response.text() };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `n8n webhook returned ${response.status}: ${JSON.stringify(data).slice(0, 200)}`,
      };
    }

    return { ok: true, data };
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return { ok: false, error: 'n8n webhook timeout (15s)' };
    }
    return {
      ok: false,
      error: `n8n webhook request failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

/**
 * List available workflows from n8n (for discovery).
 * @returns {Promise<{ ok: boolean, workflows?: object[], error?: string }>}
 */
export async function listN8nWorkflows() {
  const baseUrl = getN8nBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { ok: false, error: `n8n API returned ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, workflows: data.data || data || [] };
  } catch (error) {
    return {
      ok: false,
      error: `n8n workflow list failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

/**
 * Activate or deactivate an n8n workflow by ID.
 * @param {string} workflowId
 * @param {boolean} active
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function setN8nWorkflowActive(workflowId, active) {
  const baseUrl = getN8nBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { ok: false, error: `n8n activate returned ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: `n8n activate failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}
