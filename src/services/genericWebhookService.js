import { getConnectorCredential } from './connectors/connectorAuth';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { TRUST_STATES } from './trustModel';

const POLL_INTERVAL_MS = 30_000;

/**
 * Drain queued events from a deployed gateway/generic-webhook instance (see
 * gateway/generic-webhook/README.md). Any external service that was given a
 * sourceId + shared secret can push events there without Alphonso needing a
 * bespoke connector for that service — this just pulls whatever is queued.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ ok: boolean, events: Array<{ sourceId: string, payload: any, queuedAtMs: number }> }>}
 */
export async function pollGenericWebhookGateway({ limit = 50 } = {}) {
  const drainUrl = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_DRAIN_URL');
  const token = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_TOKEN');

  if (!drainUrl) {
    throw new Error('GENERIC_WEBHOOK_DRAIN_URL not set in connector credentials');
  }

  const url = new URL(drainUrl);
  url.searchParams.set('limit', String(limit));

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url.toString(), { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Gateway drain failed: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const events = Array.isArray(data?.events) ? data.events : [];

  for (const event of events) {
    appendOrchestrationReceipt({
      workflowId: 'generic_webhook_gateway',
      commandId: null,
      packetId: null,
      eventType: 'inbound_webhook_received',
      status: 'received',
      agent: 'jose',
      actionType: 'inbound_webhook',
      riskLevel: 'low',
      approved: true,
      blocked: false,
      setupRequired: false,
      details: { sourceId: event?.sourceId || 'unknown', queuedAtMs: event?.queuedAtMs || null },
      confidence: TRUST_STATES.VERIFIED,
      verificationState: TRUST_STATES.VERIFIED
    });
  }

  return { ok: true, events };
}

let _pollInterval = null;

/**
 * Start polling the configured gateway on an interval. No-ops (and stays
 * stopped) until GENERIC_WEBHOOK_DRAIN_URL is configured — mirrors
 * echoFileWatcherService's "configured but not wired" safety pattern.
 * @param {(result: { events: Array<any> }) => void} callback
 * @returns {() => void} stop function
 */
export function startGenericWebhookPolling(callback) {
  stopGenericWebhookPolling();

  _pollInterval = setInterval(async () => {
    const drainUrl = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_DRAIN_URL');
    if (!drainUrl) return;

    try {
      const result = await pollGenericWebhookGateway({ limit: 50 });
      if (result.events.length > 0) {
        callback({ events: result.events });
      }
    } catch { /* non-critical — retried on next interval */ }
  }, POLL_INTERVAL_MS);

  return stopGenericWebhookPolling;
}

/**
 * Stop the gateway poller.
 */
export function stopGenericWebhookPolling() {
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}
