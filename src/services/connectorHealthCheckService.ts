import { isConnectorAuthenticated } from './connectorRegistryService';
import { timestampMs } from './trustModel';

interface HealthCheckResult {
  ok: boolean;
  message: string;
  latency: number;
  details: Record<string, unknown>;
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

function getConnectorApiKey(connectorId: string): string {
  try {
    const raw = localStorage.getItem('alphonso_connector_auth_profiles_v1');
    const profiles = raw ? JSON.parse(raw) : {};
    return profiles?.[connectorId]?.apiKey || '';
  } catch {
    return '';
  }
}

function measureLatency(startTime: number): number {
  return timestampMs() - startTime;
}

export async function checkTelegramConnection(options: { botToken?: string } = {}): Promise<HealthCheckResult> {
  const startTime = timestampMs();
  const botToken = options.botToken || getConnectorApiKey('telegram');

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

export async function checkConnectorHealth(connectorId: string, options: { botToken?: string; gatewayUrl?: string } = {}): Promise<HealthCheckResult> {
  switch (connectorId) {
    case 'telegram':
      return checkTelegramConnection(options);
    case 'whatsapp':
      return checkWhatsAppConnection(options);
    default:
      return {
        ok: false,
        message: `Health check not implemented for connector: ${connectorId}`,
        latency: 0,
        details: { reason: 'not_implemented' }
      };
  }
}
