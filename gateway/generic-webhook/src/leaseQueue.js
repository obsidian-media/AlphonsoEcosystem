import { randomUUID } from 'node:crypto';

// Bounded in-memory queue with optional at-least-once delivery.
//
// Plain drain (`drain(limit)`) removes items immediately -- the original
// behaviour, kept so older Alphonso clients keep working. Lease drain
// (`drain(limit, { lease: true })`) hands items out with a `deliveryId` and
// hides them for `leaseMs`; the client acks them once processed. Anything not
// acked before the lease expires is delivered again, so a network failure
// between drain and processing no longer loses messages (2026-09-30
// pre-launch audit, M-3). The queue is still process memory: a gateway
// restart drops whatever was queued.
export function createLeaseQueue({ maxSize = 500, leaseMs = 60_000 } = {}) {
  const items = [];

  function enqueue(item) {
    if (items.length >= maxSize) items.shift();
    items.push({ deliveryId: randomUUID(), queuedAtMs: Date.now(), leasedUntilMs: 0, ...item });
  }

  function drain(limit = 100, { lease = false, now = Date.now() } = {}) {
    const max = Math.max(0, Math.min(Number(limit) || 0, items.length));
    if (!lease) {
      return items.splice(0, max).map(({ leasedUntilMs: _lease, ...rest }) => rest);
    }
    const out = [];
    for (const item of items) {
      if (out.length >= max) break;
      if (item.leasedUntilMs > now) continue;
      item.leasedUntilMs = now + leaseMs;
      const { leasedUntilMs: _lease, ...rest } = item;
      out.push(rest);
    }
    return out;
  }

  function ack(deliveryIds) {
    const ids = new Set((Array.isArray(deliveryIds) ? deliveryIds : []).map(String));
    let removed = 0;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (ids.has(items[i].deliveryId)) {
        items.splice(i, 1);
        removed += 1;
      }
    }
    return removed;
  }

  return { enqueue, drain, ack, size: () => items.length };
}

// Rate-limit key: behind Railway's proxy, the LAST X-Forwarded-For entry is
// the one the proxy appended; the leftmost entries are client-controlled and
// trivially spoofable to dodge the limiter.
export function clientKeyFromRequest(request) {
  const hops = String(request.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return hops[hops.length - 1] || request.socket?.remoteAddress || 'unknown';
}
