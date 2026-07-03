import { timingSafeEqual } from 'node:crypto';

const rateWindowMs = Number(process.env.WHATSAPP_RATE_WINDOW_MS || 60_000);
const rateMaxRequests = Number(process.env.WHATSAPP_RATE_MAX_REQUESTS || 60);

// Constant-time token comparison — plain `===` on secrets leaks timing
// information proportional to the matching-prefix length, letting a remote
// attacker recover a shared secret byte-by-byte over many requests.
export function constantTimeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createRateLimiter({ windowMs = rateWindowMs, maxRequests = rateMaxRequests } = {}) {
  const buckets = new Map();

  function prune(nowMs) {
    for (const [key, bucket] of buckets.entries()) {
      if (nowMs - bucket.startedAtMs >= windowMs) {
        buckets.delete(key);
      }
    }
  }

  return {
    allow(key, nowMs = Date.now()) {
      const cleanKey = String(key || 'unknown');
      prune(nowMs);
      const current = buckets.get(cleanKey);
      if (!current || nowMs - current.startedAtMs >= windowMs) {
        buckets.set(cleanKey, { startedAtMs: nowMs, count: 1 });
        return { allowed: true, remaining: Math.max(0, maxRequests - 1), retryAfterMs: 0 };
      }
      if (current.count >= maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, windowMs - (nowMs - current.startedAtMs))
        };
      }
      current.count += 1;
      buckets.set(cleanKey, current);
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - current.count),
        retryAfterMs: 0
      };
    },
    snapshot() {
      return [...buckets.entries()].map(([key, bucket]) => ({
        key,
        startedAtMs: bucket.startedAtMs,
        count: bucket.count
      }));
    }
  };
}

export async function readBodyWithLimit(request, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;

    request.on('data', (chunk) => {
      if (rejected) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        rejected = true;
        request.destroy(new Error('request_body_too_large'));
        reject(Object.assign(new Error('Request body exceeds the configured limit.'), { code: 'PAYLOAD_TOO_LARGE' }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      resolve(Buffer.concat(chunks));
    });
    request.on('error', (error) => {
      if (rejected && error?.message === 'request_body_too_large') return;
      reject(error);
    });
  });
}

export function redactGatewayDetails(details = {}) {
  return JSON.parse(JSON.stringify(details, (key, value) => {
    if (typeof key === 'string' && /token|secret|signature|authorization|bearer|phone|chat|verify/i.test(key)) {
      return '[redacted]';
    }
    if (typeof value === 'string' && /token|secret|signature|authorization|bearer/i.test(value)) {
      return '[redacted]';
    }
    if (typeof value === 'string' && value.length > 160) {
      return `${value.slice(0, 160)}...`;
    }
    return value;
  }));
}
