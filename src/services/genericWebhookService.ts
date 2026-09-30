import { getConnectorCredential } from './connectors/connectorAuth';
import { appendOrchestrationReceipt } from './orchestrationReceiptService';
import { TRUST_STATES } from './trustModel';

const POLL_INTERVAL_MS = 30_000;

interface WebhookEvent {
  sourceId: string;
  payload: unknown;
  queuedAtMs: number;
}

interface PollResult {
  ok: boolean;
  events: WebhookEvent[];
}

let _pollInterval: ReturnType<typeof setInterval> | null = null;


// Lease + ack delivery (pre-launch audit M-3): drain with `lease=1` so the
// gateway only forgets a message after we confirm receipt; if the response is
// lost in transit, the lease expires and the gateway redelivers. Recently seen
// deliveryIds are skipped so a failed ack can't produce duplicates. Older
// gateways ignore `lease` and return no deliveryIds -- nothing to ack then.
const RECENT_DELIVERY_LIMIT = 500;
const recentDeliveryIdsGw: string[] = [];

function isDuplicateDeliveryGw(deliveryId: unknown): boolean {
  if (typeof deliveryId !== 'string' || !deliveryId) return false;
  if (recentDeliveryIdsGw.includes(deliveryId)) return true;
  recentDeliveryIdsGw.push(deliveryId);
  if (recentDeliveryIdsGw.length > RECENT_DELIVERY_LIMIT) recentDeliveryIdsGw.shift();
  return false;
}

async function ackGatewayDeliveriesGw(drainUrl: string, headers: Record<string, string>, deliveryIds: string[]): Promise<void> {
  if (deliveryIds.length === 0) return;
  try {
    const ackUrl = new URL(drainUrl);
    ackUrl.pathname = ackUrl.pathname.replace(/\/queue\/drain\/?$/, '/queue/ack');
    ackUrl.search = '';
    await fetch(ackUrl.toString(), { method: 'POST', headers, body: JSON.stringify({ deliveryIds }) });
  } catch {
    // Unacked deliveries are redelivered after the lease and de-duplicated above.
  }
}

export async function pollGenericWebhookGateway({ limit = 50 } = {}): Promise<PollResult> {
  const drainUrl = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_DRAIN_URL');
  const token = getConnectorCredential('generic_webhook', 'GENERIC_WEBHOOK_TOKEN');

  if (!drainUrl) {
    throw new Error('GENERIC_WEBHOOK_DRAIN_URL not set in connector credentials');
  }

  const url = new URL(drainUrl);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lease', '1');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url.toString(), { method: 'GET', headers });
  if (!response.ok) {
    throw new Error(`Gateway drain failed: HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const drained: WebhookEvent[] = Array.isArray(data?.events) ? data.events : [];
  const deliveryIds = drained
    .map((event) => (event as { deliveryId?: unknown })?.deliveryId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const events = drained.filter((event) => !isDuplicateDeliveryGw((event as { deliveryId?: unknown })?.deliveryId));
  await ackGatewayDeliveriesGw(drainUrl, headers, deliveryIds);

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

export function startGenericWebhookPolling(callback: (result: { events: WebhookEvent[] }) => void): () => void {
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

export function stopGenericWebhookPolling() {
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}
