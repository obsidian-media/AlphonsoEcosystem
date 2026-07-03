import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

const N8N_DEFAULT_BASE_URL = 'http://localhost:5678';

export interface N8nHealthResult {
  ok: boolean;
  status: string;
  statusCode?: number;
}

export interface N8nWebhookResult {
  ok: boolean;
  data?: any;
  error?: string;
}

export interface N8nWorkflowListResult {
  ok: boolean;
  workflows?: any[];
  error?: string;
}

export interface N8nActionResult {
  ok: boolean;
  error?: string;
}

function getN8nBaseUrl(): string {
  return getConnectorCredential('n8n', 'N8N_BASE_URL') || N8N_DEFAULT_BASE_URL;
}

/** Check if n8n instance is healthy. */
export async function isN8nHealthy(): Promise<N8nHealthResult> {
  const baseUrl = getN8nBaseUrl();
  // Policy gate check
  const gateHealth = evaluatePolicyGate({
    connectorId: 'n8n',
    actionType: 'health',
    commandPreview: JSON.stringify({ baseUrl }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gateHealth.ok) {
    throw new Error(gateHealth.reason || 'Policy gate blocked');
  }

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
  } catch (error: any) {
    return {
      ok: false,
      status: `connection_failed: ${String(error?.message || error).slice(0, 100)}`,
    };
  }
}

/**
 * Trigger an n8n webhook by path.
 * @param webhookPath - The webhook path (e.g., "my-workflow" or "hook/abc123")
 * @param payload - JSON payload to send to the webhook
 */
export async function triggerN8nWebhook(webhookPath: string, payload: Record<string, any> = {}): Promise<N8nWebhookResult> {
  const baseUrl = getN8nBaseUrl();
  const normalizedPath = String(webhookPath || '').replace(/^\/+/, '');

  try {
    const gateWebhook = evaluatePolicyGate({
      connectorId: 'n8n',
      actionType: 'webhook',
      commandPreview: JSON.stringify({ baseUrl, normalizedPath, payload }),
      approved: false,
      auth: { enabled: false, isAuthorized: false }
    });
    if (!gateWebhook.ok) {
      throw new Error(gateWebhook.reason || 'Policy gate blocked');
    }

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
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return { ok: false, error: 'n8n webhook timeout (15s)' };
    }
    return {
      ok: false,
      error: `n8n webhook request failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

/** List available workflows from n8n (for discovery). */
export async function listN8nWorkflows(): Promise<N8nWorkflowListResult> {
  const baseUrl = getN8nBaseUrl();
  try {
    const gateList = evaluatePolicyGate({
      connectorId: 'n8n',
      actionType: 'list_workflows',
      commandPreview: JSON.stringify({ baseUrl }),
      approved: false,
      auth: { enabled: false, isAuthorized: false }
    });
    if (!gateList.ok) {
      throw new Error(gateList.reason || 'Policy gate blocked');
    }

    const response = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { ok: false, error: `n8n API returned ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, workflows: data.data || data || [] };
  } catch (error: any) {
    return {
      ok: false,
      error: `n8n workflow list failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

/** Activate or deactivate an n8n workflow by ID. */
export async function setN8nWorkflowActive(workflowId: string, active: boolean): Promise<N8nActionResult> {
  const baseUrl = getN8nBaseUrl();
  try {
    const gateActivate = evaluatePolicyGate({
      connectorId: 'n8n',
      actionType: 'activate_workflow',
      commandPreview: JSON.stringify({ baseUrl, workflowId, active }),
      approved: false,
      auth: { enabled: false, isAuthorized: false }
    });
    if (!gateActivate.ok) {
      throw new Error(gateActivate.reason || 'Policy gate blocked');
    }

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
  } catch (error: any) {
    return {
      ok: false,
      error: `n8n activate failed: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}
