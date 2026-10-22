import { isConnectorAuthenticated } from './connectorRegistryService';
import { timestampMs } from './trustModel';
import { getConnectorCredential } from './connectors/connectorAuth';

interface HealthCheckResult {
  ok: boolean;
  message: string;
  latency: number;
  details: Record<string, unknown>;
  /** 'live': the service itself answered. 'key_only': only checked that a
   *  key is saved; nothing was sent. The UI must not call a key_only pass
   *  "verified" (QA Bug 33, 2026-10-21). */
  checked?: 'live' | 'key_only';
}

interface TelegramApiData {
  ok?: boolean;
  description?: string;
  result?: { username?: string; id?: number };
}

interface GatewayHealthData {
  status?: string;
  forwardConfigured?: boolean;
  verifyTokenConfigured?: boolean;
  appSecretConfigured?: boolean;
  allowlistCount?: number;
}

function measureLatency(startTime: number): number {
  return timestampMs() - startTime;
}

export async function checkTelegramConnection(options: { botToken?: string } = {}): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const botToken = options.botToken || getConnectorCredential('telegram', 'TELEGRAM_BOT_TOKEN');

  if (!botToken) {
    return {
      ok: false,
      message: 'No Telegram bot token configured.',
      latency: 0,
      details: { reason: 'missing_token' }
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data: TelegramApiData = await response.json().catch(() => ({}));
    const latency = measureLatency(startTime);

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.description || `Telegram API returned HTTP ${response.status}`,
        latency,
        details: { httpStatus: response.status, botUsername: null }
      };
    }

    return {
      ok: true,
      message: `Connected as @${data?.result?.username || 'unknown'}`,
      latency,
      details: { botUsername: data?.result?.username || null, botId: data?.result?.id || null }
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach Telegram API: ${String((error as Error)?.message || error)}`,
      latency: measureLatency(startTime),
      details: { reason: 'network_error' }
    };
  }
}

export async function checkWhatsAppConnection(options: { gatewayUrl?: string } = {}): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const gatewayUrl = options.gatewayUrl || 'http://localhost:8080';

  const auth = isConnectorAuthenticated('whatsapp');
  if (!auth.ok) {
    return {
      ok: false,
      message: 'WhatsApp connector is not enabled.',
      latency: 0,
      details: { reason: 'not_authenticated' }
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${gatewayUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    window.clearTimeout(timeoutId);

    const data: GatewayHealthData = await response.json().catch(() => ({}));
    const latency = measureLatency(startTime);

    if (!response.ok) {
      return {
        ok: false,
        message: `Gateway returned HTTP ${response.status}`,
        latency,
        details: { httpStatus: response.status, gatewayStatus: data?.status || null }
      };
    }

    const status = data?.status || 'unknown';
    const ready = status === 'ready';

    return {
      ok: ready,
      message: ready
        ? 'WhatsApp gateway is ready.'
        : `Gateway status: ${status}. Verify token${data?.verifyTokenConfigured ? '' : ' and'} app secret${data?.appSecretConfigured ? '' : ''} need configuration.`,
      latency,
      details: {
        gatewayStatus: status,
        forwardConfigured: Boolean(data?.forwardConfigured),
        verifyTokenConfigured: Boolean(data?.verifyTokenConfigured),
        appSecretConfigured: Boolean(data?.appSecretConfigured),
        allowlistCount: data?.allowlistCount || 0
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: `Could not reach gateway at ${gatewayUrl}: ${String((error as Error)?.message || error)}`,
      latency: measureLatency(startTime),
      details: { reason: 'network_error', gatewayUrl }
    };
  }
}

interface CompanionStatus {
  running?: boolean;
  port?: number;
  connected_clients?: number;
}

export async function checkMobileBridgeConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const status = await invoke<CompanionStatus>('companion_get_status');
    const latency = measureLatency(startTime);
    const connected = status?.connected_clients || 0;

    return {
      ok: Boolean(status?.running) && connected > 0,
      message: !status?.running
        ? 'Companion pairing server is not running.'
        : connected > 0
          ? `Companion server running on port ${status.port}, ${connected} device(s) paired.`
          : `Companion server running on port ${status.port}, no devices paired yet.`,
      latency,
      details: {
        running: Boolean(status?.running),
        port: status?.port ?? null,
        connectedClients: connected
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: `Companion pairing server unreachable: ${String((error as Error)?.message || error)}`,
      latency: measureLatency(startTime),
      details: { reason: 'tauri_invoke_error' }
    };
  }
}

export async function checkGitHubConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const token = getConnectorCredential('github', 'GITHUB_TOKEN');

  if (!token) {
    return { ok: false, message: 'No GitHub token configured.', latency: 0, details: { reason: 'missing_token' } };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    const latency = measureLatency(startTime);
    if (!response.ok) {
      return { ok: false, message: `GitHub API returned HTTP ${response.status}`, latency, details: { httpStatus: response.status } };
    }
    const data = await response.json().catch(() => ({} as { login?: string }));
    return { ok: true, message: `Connected as @${data?.login || 'unknown'}`, latency, details: { login: data?.login || null } };
  } catch (error) {
    return { ok: false, message: `Could not reach GitHub API: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'network_error' } };
  }
}

export async function checkSlackConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const token = getConnectorCredential('slack', 'SLACK_BOT_TOKEN');

  if (!token) {
    return { ok: false, message: 'No Slack bot token configured.', latency: 0, details: { reason: 'missing_token' } };
  }

  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({} as { ok?: boolean; error?: string; team?: string; user?: string }));
    const latency = measureLatency(startTime);
    if (!response.ok || !data?.ok) {
      return { ok: false, message: data?.error || `Slack API returned HTTP ${response.status}`, latency, details: { httpStatus: response.status } };
    }
    return { ok: true, message: `Connected to ${data?.team || 'workspace'} as ${data?.user || 'unknown'}`, latency, details: { team: data?.team || null, user: data?.user || null } };
  } catch (error) {
    return { ok: false, message: `Could not reach Slack API: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'network_error' } };
  }
}

export async function checkDiscordConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const token = getConnectorCredential('discord', 'DISCORD_BOT_TOKEN');

  if (!token) {
    return { ok: false, message: 'No Discord bot token configured.', latency: 0, details: { reason: 'missing_token' } };
  }

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` }
    });
    const latency = measureLatency(startTime);
    if (!response.ok) {
      return { ok: false, message: `Discord API returned HTTP ${response.status}`, latency, details: { httpStatus: response.status } };
    }
    const data = await response.json().catch(() => ({} as { username?: string }));
    return { ok: true, message: `Connected as ${data?.username || 'unknown'}`, latency, details: { username: data?.username || null } };
  } catch (error) {
    return { ok: false, message: `Could not reach Discord API: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'network_error' } };
  }
}

export async function checkGenericWebhookConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const drainUrl = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_DRAIN_URL');

  if (!drainUrl) {
    return { ok: false, message: 'Generic webhook gateway drain URL is not configured.', latency: 0, details: { reason: 'missing_config' } };
  }

  return {
    ok: true,
    message: 'Drain URL configured. Live reachability is verified by the boot-time poller, not this check (draining here would consume the queue).',
    latency: measureLatency(startTime),
    details: { drainUrlConfigured: true }
  };
}

/**
 * Hermes is per-agent (up to 9 independent profiles, each its own endpoint),
 * unlike every other connector this panel checks — so this aggregates across
 * all configured agents rather than probing a single fixed endpoint. Agent
 * ids come from `agentRegistry.js`, never a hardcoded list, per the design
 * doc's "no hardcoding, enforced at every layer" rule.
 */
export async function checkHermesAgentsConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const { listAgentProfiles } = await import('../agents/agentRegistry');
  const { isHermesAgentConfigured, getHermesAgentHealth } = await import('./connectors/hermesAgentConnector');

  const agents = listAgentProfiles();
  const configuredIds = agents.map((a: { id: string }) => a.id).filter((id: string) => isHermesAgentConfigured(id));

  if (configuredIds.length === 0) {
    return {
      ok: false,
      message: 'No Hermes agent profiles configured.',
      latency: measureLatency(startTime),
      details: { reason: 'missing_config', configured: [] }
    };
  }

  const perAgent = await Promise.all(
    configuredIds.map(async (id: string) => ({ id, health: await getHermesAgentHealth(id) }))
  );
  const reachable = perAgent.filter((a) => a.health.ok);

  return {
    ok: reachable.length > 0,
    message: `${reachable.length}/${configuredIds.length} configured Hermes agent profile(s) reachable.`,
    latency: measureLatency(startTime),
    details: {
      configured: configuredIds,
      reachable: reachable.map((a) => a.id),
      unreachable: perAgent.filter((a) => !a.health.ok).map((a) => ({ id: a.id, error: a.health.error }))
    }
  };
}

export async function checkN8nConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const { isN8nHealthy } = await import('./connectors/n8nConnector');
  try {
    const result = await isN8nHealthy();
    return {
      ok: result.ok,
      message: result.ok ? 'n8n instance is healthy.' : `n8n instance ${result.status}`,
      latency: measureLatency(startTime),
      details: { status: result.status, httpStatus: result.statusCode ?? null }
    };
  } catch (error) {
    return { ok: false, message: `n8n health check failed: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'error' } };
  }
}

async function checkApiKeyConfigured(connectorId: string, envKey: string, label: string): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const key = getConnectorCredential(connectorId, envKey);
  return {
    ok: Boolean(key),
    checked: 'key_only',
    message: key
      ? `${label} key is saved. Not tested: ${label} has no free check that sends nothing.`
      : `No ${label} key saved. Add it in Settings → Connectors.`,
    latency: measureLatency(startTime),
    details: { reason: key ? 'key_present' : 'missing_key' }
  };
}

/** Live check: NVIDIA's model list is free and changes nothing. */
export async function checkNvidiaConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  if (!getConnectorCredential('nvidia_nim', 'NVIDIA_API_KEY')) {
    return { ok: false, checked: 'live', message: 'No NVIDIA NIM key saved. Add it in Settings → Connectors.', latency: 0, details: { reason: 'missing_key' } };
  }
  try {
    const { listNvidiaModels } = await import('./connectors/nvidiaNimConnector');
    const models = await listNvidiaModels();
    return { ok: true, checked: 'live', message: `NVIDIA NIM answered: ${models.length} models available.`, latency: measureLatency(startTime), details: { modelCount: models.length } };
  } catch (error) {
    return { ok: false, checked: 'live', message: `NVIDIA NIM check failed: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'error' } };
  }
}

/** Live check: Gemini's model list is free and changes nothing. */
export async function checkGeminiConnection(): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const key = getConnectorCredential('gemini', 'GEMINI_API_KEY');
  if (!key) {
    return { ok: false, checked: 'live', message: 'No Gemini key saved. Add it in Settings → Connectors.', latency: 0, details: { reason: 'missing_key' } };
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      return { ok: false, checked: 'live', message: `Gemini answered HTTP ${response.status}; check the key.`, latency: measureLatency(startTime), details: { httpStatus: response.status } };
    }
    const data = await response.json() as { models?: unknown[] };
    const count = Array.isArray(data.models) ? data.models.length : 0;
    return { ok: true, checked: 'live', message: `Gemini answered: ${count} models available.`, latency: measureLatency(startTime), details: { modelCount: count } };
  } catch (error) {
    return { ok: false, checked: 'live', message: `Gemini check failed: ${String((error as Error)?.message || error)}`, latency: measureLatency(startTime), details: { reason: 'error' } };
  }
}

export async function checkConnectorHealth(connectorId: string, options: { botToken?: string; gatewayUrl?: string } = {}): Promise<HealthCheckResult> {
  const result = await runConnectorHealthCheck(connectorId, options);
  // The checks below that call the service are live; checkApiKeyConfigured
  // marks itself key_only.
  return { checked: 'live', ...result };
}

async function runConnectorHealthCheck(connectorId: string, options: { botToken?: string; gatewayUrl?: string }): Promise<HealthCheckResult> {
  switch (connectorId) {
    case 'telegram':
      return checkTelegramConnection(options);
    case 'whatsapp':
      return checkWhatsAppConnection(options);
    case 'mobile_bridge':
      return checkMobileBridgeConnection();
    case 'github':
      return checkGitHubConnection();
    case 'slack':
      return checkSlackConnection();
    case 'discord':
      return checkDiscordConnection();
    case 'generic_webhook':
      return checkGenericWebhookConnection();
    case 'n8n':
      return checkN8nConnection();
    case 'hermes_agents':
      return checkHermesAgentsConnection();
    case 'brave_search':
      return checkApiKeyConfigured('brave_search', 'BRAVE_SEARCH_API_KEY', 'Brave Search');
    case 'perplexity':
      return checkApiKeyConfigured('perplexity', 'PERPLEXITY_API_KEY', 'Perplexity');
    case 'tavily':
      return checkApiKeyConfigured('tavily', 'TAVILY_API_KEY', 'Tavily');
    case 'deepseek':
      return checkApiKeyConfigured('deepseek', 'DEEPSEEK_API_KEY', 'DeepSeek');
    case 'nvidia_nim':
      return checkNvidiaConnection();
    case 'gemini':
      return checkGeminiConnection();
    case 'chatgpt':
      return checkApiKeyConfigured('chatgpt', 'OPENAI_API_KEY', 'ChatGPT');
    case 'claude':
      return checkApiKeyConfigured('claude', 'ANTHROPIC_API_KEY', 'Claude');
    case 'qwen':
      return checkApiKeyConfigured('qwen', 'DASHSCOPE_API_KEY', 'Qwen');
    case 'notion':
      return checkApiKeyConfigured('notion', 'NOTION_API_KEY', 'Notion');
    case 'clickup':
      return checkApiKeyConfigured('clickup', 'CLICKUP_API_KEY', 'ClickUp');
    case 'youtube':
      return checkApiKeyConfigured('youtube', 'YOUTUBE_REFRESH_TOKEN', 'YouTube');
    case 'runway':
      return checkApiKeyConfigured('runway', 'RUNWAYML_API_SECRET', 'Runway');
    case 'calle':
      return checkApiKeyConfigured('calle', 'CALLE_API_KEY', 'CALL-E');
    default:
      return {
        ok: false,
        message: `Health check not implemented for connector: ${connectorId}`,
        latency: 0,
        details: { reason: 'not_implemented' }
      };
  }
}
