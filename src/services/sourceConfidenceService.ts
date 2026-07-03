import { TRUST_STATES, timestampMs } from './trustModel';

interface Source {
  url?: string;
  official?: boolean;
  [key: string]: unknown;
}

interface ConfidenceResult {
  confidence: string;
  reason: string;
}

const EXPIRY_DAYS_BY_TYPE: Record<string, number> = {
  vendor_pricing: 7,
  news_current: 3,
  official_docs: 30,
  public_repo: 30,
  market_comparison: 30,
  evergreen_reference: 180
};

export function sourceExpiryForType(sourceType: string): number {
  const days = EXPIRY_DAYS_BY_TYPE[sourceType] || 30;
  return timestampMs() + days * 24 * 60 * 60 * 1000;
}

export function scoreSourceConfidence(source: Source): ConfidenceResult {
  if (!source?.url) {
    return {
      confidence: TRUST_STATES.UNVERIFIED,
      reason: 'No source URL supplied.'
    };
  }

  try {
    const parsed = new URL(source.url);
    const isOfficial = Boolean(source.official) || /docs|developer|github|tauri|ollama/i.test(parsed.hostname);
    return {
      confidence: isOfficial ? TRUST_STATES.INFERRED : TRUST_STATES.TEMPORARY,
      reason: isOfficial ? 'Source appears official or developer-oriented.' : 'Source URL is present but not independently verified.'
    };
  } catch {
    return {
      confidence: TRUST_STATES.FAILED,
      reason: 'Source URL is invalid.'
    };
  }
}