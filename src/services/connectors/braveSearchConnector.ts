import { invoke } from '@tauri-apps/api/core';
import { getConnectorCredential } from './connectorAuth';
import { evaluatePolicyGate } from '../policyEnforcementService';

// Extracted from hectorResearchService.js during the 2026-09-20/21 G-T12
// connector-DSL fail-closed audit: searchBrave() previously bypassed the
// policy gate entirely, unlike its sibling search connectors
// (tavilyConnector.ts/perplexityConnector.ts/deepseekConnector.ts), each its
// own file with the same evaluatePolicyGate check. This matches that exact
// pattern for consistency — see docs/governance/DEFERRED_WORK.md's
// 2026-09-20/21 entry for the full finding.

const BRAVE_SEARCH_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

// No vite-env.d.ts declares ImportMetaEnv in this repo (checked -- no other
// .ts file references import.meta.env directly, only untyped .js files did
// before this extraction), so read it through an explicit cast rather than
// adding a global ambient type that could affect unrelated files.
function getViteBraveSearchApiKey(): string {
  return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BRAVE_SEARCH_API_KEY || '';
}

export interface BraveSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface BraveSearchResult {
  success: boolean;
  error?: string;
  httpStatus?: number;
  results: BraveSearchResultItem[];
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

export async function isBraveSearchConfigured(): Promise<boolean> {
  // Check UI credential store first (set via Settings -> Connectors)
  if (getConnectorCredential('brave_search', 'BRAVE_SEARCH_API_KEY')) return true;
  if (getViteBraveSearchApiKey()) return true;
  try {
    const presence = await invoke<Record<string, boolean>>('check_env_vars_presence', { names: ['BRAVE_SEARCH_API_KEY'] });
    return Boolean(presence?.['BRAVE_SEARCH_API_KEY']);
  } catch {
    return false;
  }
}

/**
 * Frontend-only Brave Search -- uses VITE_BRAVE_SEARCH_API_KEY from the Vite env
 * or a UI-saved credential. Returns a structured result the UI can display
 * directly, or an error object. Use this when the Rust backend path
 * (search_brave_sources) is unavailable or for direct UI calls.
 */
export async function searchBrave(query: string, count = 10): Promise<BraveSearchResult> {
  const apiKey = getConnectorCredential('brave_search', 'BRAVE_SEARCH_API_KEY')
    || getViteBraveSearchApiKey()
    || '';
  if (!apiKey) {
    return { success: false, error: 'BRAVE_SEARCH_API_KEY not configured -- add it in Settings -> Connectors', results: [] };
  }

  const gate = evaluatePolicyGate({
    connectorId: 'brave_search',
    actionType: 'search',
    commandPreview: JSON.stringify({ query, count }),
    approved: false,
    auth: { enabled: false, isAuthorized: false }
  });
  if (!gate.ok) {
    return { success: false, error: gate.reason || 'Policy gate blocked', results: [] };
  }

  try {
    const resp = await retryWithBackoff(() => fetch(
      `${BRAVE_SEARCH_API_BASE}?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey
        }
      }
    ));
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        success: false,
        error: `Brave Search HTTP ${resp.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`,
        httpStatus: resp.status,
        results: []
      };
    }
    const data = await resp.json();
    const results: BraveSearchResultItem[] = (data.web?.results || []).map((r: { title?: string; url?: string; description?: string }) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.description || '',
      source: 'brave'
    }));
    return { success: true, results };
  } catch (error) {
    return { success: false, error: `Brave Search fetch failed: ${String(error)}`, results: [] };
  }
}
