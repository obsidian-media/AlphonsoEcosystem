// Token-bucket rate limiter — in-memory only, not persisted.
// Default: 60 tokens/min per connector.

const DEFAULT_MAX_TOKENS = 60;
const DEFAULT_REFILL_RATE = 60; // tokens per minute

// buckets: Map<connectorId, { tokens, maxTokens, refillRate, lastRefillMs }>
const buckets = new Map();

// configs: Map<connectorId, { maxTokens, refillRate }>
const configs = new Map();

function getConfig(connectorId) {
  return configs.get(connectorId) ?? { maxTokens: DEFAULT_MAX_TOKENS, refillRate: DEFAULT_REFILL_RATE };
}

function refill(bucket, config) {
  const now = Date.now();
  const elapsedMs = now - bucket.lastRefillMs;
  const tokensToAdd = (elapsedMs / 60_000) * config.refillRate;
  bucket.tokens = Math.min(config.maxTokens, bucket.tokens + tokensToAdd);
  bucket.lastRefillMs = now;
  return bucket;
}

function getBucket(connectorId) {
  const config = getConfig(connectorId);
  if (!buckets.has(connectorId)) {
    buckets.set(connectorId, {
      tokens: config.maxTokens,
      maxTokens: config.maxTokens,
      refillRate: config.refillRate,
      lastRefillMs: Date.now()
    });
  }
  const bucket = buckets.get(connectorId);
  // Sync config changes
  bucket.maxTokens = config.maxTokens;
  bucket.refillRate = config.refillRate;
  return refill(bucket, config);
}

function resetAtMs(bucket, config) {
  if (bucket.tokens >= 1) return Date.now();
  const tokensNeeded = 1 - bucket.tokens;
  const msNeeded = (tokensNeeded / config.refillRate) * 60_000;
  return Math.ceil(Date.now() + msNeeded);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function checkLimit(connectorId) {
  const config = getConfig(connectorId);
  const bucket = getBucket(connectorId);
  const allowed = bucket.tokens >= 1;
  return {
    allowed,
    remaining: Math.floor(bucket.tokens),
    resetAt: resetAtMs(bucket, config)
  };
}

export function consume(connectorId) {
  const bucket = getBucket(connectorId);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
  }
  return Math.floor(bucket.tokens);
}

export function getStatus(connectorId) {
  const config = getConfig(connectorId);
  const bucket = getBucket(connectorId);
  return {
    connectorId,
    tokens: bucket.tokens,
    maxTokens: bucket.maxTokens,
    refillRate: bucket.refillRate,
    resetAt: resetAtMs(bucket, config)
  };
}

export function configure(connectorId, { maxTokens, refillRate } = {}) {
  const current = getConfig(connectorId);
  configs.set(connectorId, {
    maxTokens: maxTokens ?? current.maxTokens,
    refillRate: refillRate ?? current.refillRate
  });
  // Reset bucket so new config takes effect immediately
  buckets.delete(connectorId);
}

export function resetAll() {
  buckets.clear();
  configs.clear();
}
