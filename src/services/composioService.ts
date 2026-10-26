import { TRUST_STATES, timestampMs } from './trustModel';
import { evaluatePolicyGate } from './policyEnforcementService';
import { secureGet, secureSet } from './secureStorageService';

const COMPOSIO_CONFIG_KEY = 'alphonso_composio_config_v1';
const COMPOSIO_CREDENTIAL_STORAGE_KEY = 'alphonso_composio_api_key_v1';
const COMPOSIO_TOOLS_CACHE_KEY = 'alphonso_composio_tools_v1';
const COMPOSIO_CACHE_TTL_MS = 300_000;

// In-memory cache for the API key only — enabled/userId aren't secrets and
// stay in the plain config blob below. Starts unset (`null`); `getComposioConfig`
// falls back to reading a legacy `apiKey` field out of the config blob when
// unset, so a key saved before this migration (or a test that plants one
// directly into that blob, as the existing suite does) is still found
// without requiring `hydrateComposioApiKeyFromKeychain` to run first.
let _apiKeyCache: string | null = null;

/** Test-only seam: module-level cache must not leak state across test files/cases. */
export function __resetComposioApiKeyCacheForTests(): void {
  _apiKeyCache = null;
}

interface RawComposioBlob {
  enabled?: boolean;
  apiKey?: string;
  userId?: string;
}

function readConfigBlob(): RawComposioBlob {
  try {
    const raw = localStorage.getItem(COMPOSIO_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Populates the in-memory API-key cache from the OS keychain at boot.
 * If the keychain has no entry yet (a key saved before this migration, or a
 * fresh Composio setup this session hasn't hydrated), falls back to the
 * legacy blob field, migrates it into the keychain, and strips it from the
 * blob so it stops sitting there in plaintext.
 */
export async function hydrateComposioApiKeyFromKeychain(): Promise<void> {
  const fromKeychain = await secureGet(COMPOSIO_CREDENTIAL_STORAGE_KEY);
  if (fromKeychain) {
    _apiKeyCache = fromKeychain;
    return;
  }
  const blob = readConfigBlob();
  if (blob.apiKey) {
    _apiKeyCache = blob.apiKey;
    const migrated = await secureSet(COMPOSIO_CREDENTIAL_STORAGE_KEY, blob.apiKey);
    // Only strip the plaintext blob field once the keychain actually has the
    // value — stripping unconditionally would lose the key outright if the
    // keychain write failed (browser dev mode, OS keychain access denied).
    if (migrated) {
      localStorage.setItem(COMPOSIO_CONFIG_KEY, JSON.stringify({ ...blob, apiKey: '' }));
    }
  }
}

/** Composio's current API (agent phase 5); the old `/v1/actions` paths are gone. */
const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1';

export interface ComposioConfig {
  enabled: boolean;
  apiKey: string;
  userId: string;
}

export interface ComposioToolkit {
  key: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  enabled: boolean;
}

export interface ComposioTool {
  name: string;
  description: string;
  toolkit: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
  tags?: string[];
}

export interface ComposioActionResult {
  success: boolean;
  data: unknown;
  error: string | null;
}

export interface ComposioHealthResult {
  status: string;
  enabled: boolean;
  message: string;
}

export interface ComposioStatusResult {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPrefix: string;
  userId: string;
  cachedToolkits: number;
  cachedAtMs: number | null;
}

// ── Configuration ───────────────────────────────────────────────────────────

export function getComposioConfig(): ComposioConfig {
  const blob = readConfigBlob();
  return {
    enabled: blob.enabled ?? false,
    apiKey: _apiKeyCache ?? blob.apiKey ?? '',
    userId: blob.userId ?? 'alphonso-user'
  };
}

export function setComposioConfig(config: Partial<ComposioConfig>): ComposioConfig {
  const merged = { ...getComposioConfig(), ...config };
  // Whenever this writes, make sure the resolved apiKey (whether just set, or
  // carried over unchanged from the cache/legacy blob) is what the cache holds
  // and is persisted to the keychain. Without this, a config-only update (e.g.
  // toggling `enabled`) would silently drop a legacy apiKey that was never
  // migrated yet — the blob write below no longer carries apiKey at all.
  if (merged.apiKey && merged.apiKey !== _apiKeyCache) {
    _apiKeyCache = merged.apiKey;
    secureSet(COMPOSIO_CREDENTIAL_STORAGE_KEY, merged.apiKey).catch(() => { /* best-effort */ });
  }
  localStorage.setItem(COMPOSIO_CONFIG_KEY, JSON.stringify({ enabled: merged.enabled, userId: merged.userId }));
  return merged;
}

export function isComposioEnabled(): boolean {
  const config = getComposioConfig();
  return config.enabled && config.apiKey && config.apiKey.length > 8;
}

// ── Tool Discovery ──────────────────────────────────────────────────────────

export async function fetchComposioToolkits(): Promise<{ toolkits: ComposioToolkit[]; error: string | null }> {
  const config = getComposioConfig();
  if (!config.apiKey) return { toolkits: [], error: 'No API key configured' };

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/toolkits`, {
      method: 'GET',
      headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Composio API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const toolkits: ComposioToolkit[] = Array.isArray(data?.items)
      ? data.items.map((item: Record<string, unknown>) => {
          const meta = (item.meta as Record<string, unknown>) || {};
          const categories = Array.isArray(meta.categories)
            ? (meta.categories as Array<{ name?: string } | string>).map((c) => (typeof c === 'string' ? c : String(c?.name || ''))).filter(Boolean)
            : (item.categories as string[]) || [];
          return {
            key: String(item.slug || item.key || (item.name as string)?.toLowerCase() || ''),
            name: item.name as string,
            description: String(meta.description || item.description || ''),
            logo: String(meta.logo || item.logo || ''),
            categories,
            enabled: item.enabled !== false
          };
        })
      : [];

    localStorage.setItem(COMPOSIO_TOOLS_CACHE_KEY, JSON.stringify({
      toolkits,
      cachedAtMs: timestampMs()
    }));

    return { toolkits, error: null };
  } catch (error) {
    return { toolkits: [], error: String((error as Error)?.message || error) };
  }
}

export function getCachedToolkits(): ComposioToolkit[] | null {
  try {
    const raw = localStorage.getItem(COMPOSIO_TOOLS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (timestampMs() - parsed.cachedAtMs > COMPOSIO_CACHE_TTL_MS) return null;
    return parsed.toolkits || [];
  } catch {
    return null;
  }
}

// ── Toolkits you switched on (Settings → Composio) ─────────────────────────

const COMPOSIO_ENABLED_TOOLKITS_KEY = 'alphonso_composio_toolkits_enabled_v1';

export function enabledComposioToolkits(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(COMPOSIO_ENABLED_TOOLKITS_KEY) || '[]');
    return Array.isArray(list) ? list.map((t) => String(t).toLowerCase()) : [];
  } catch {
    return [];
  }
}

// ── Tools (agent phase 5: Composio's v3.1 API) ──────────────────────────────

/** A toolkit's tools: `GET /tools?toolkit_slug=`. */
export async function listToolkitTools(toolkit: string): Promise<{ tools: ComposioTool[]; error: string | null }> {
  const config = getComposioConfig();
  if (!config.apiKey) return { tools: [], error: 'No API key configured' };
  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/tools?toolkit_slug=${encodeURIComponent(toolkit)}&limit=100`, {
      method: 'GET',
      headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Composio API returned HTTP ${response.status}`);
    const data = await response.json();
    const tools: ComposioTool[] = Array.isArray(data?.items)
      ? data.items.map((item: Record<string, unknown>) => ({
          name: String(item.slug || item.name || ''),
          description: String(item.description || item.human_description || ''),
          toolkit: String((item.toolkit as { slug?: string })?.slug || toolkit).toLowerCase(),
          parameters: (item.input_parameters as Record<string, unknown>) || {},
          enabled: item.is_deprecated !== true,
          tags: Array.isArray(item.tags) ? (item.tags as unknown[]).map(String) : [],
        }))
      : [];
    return { tools, error: null };
  } catch (error) {
    return { tools: [], error: String((error as Error)?.message || error) };
  }
}

const READ_VERBS = new Set(['GET', 'LIST', 'FETCH', 'SEARCH', 'FIND', 'READ']);

/**
 * True only when Composio's tags say the tool only reads, or (without such a tag) its action
 * word is a read verb. Anything else counts as sending or changing something; an unknown tool too.
 */
export function isReadOnlyTool(tool: { name: string; toolkit?: string; tags?: string[] }): boolean {
  const tags = (tool.tags || []).map((t) => String(t).toLowerCase());
  if (tags.includes('destructivehint')) return false;
  if (tags.includes('readonlyhint')) return true;
  const words = String(tool.name || '').toUpperCase().split('_').filter(Boolean);
  const prefix = String(tool.toolkit || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // The action word follows the toolkit's own prefix (GMAIL_FETCH_EMAILS, GOOGLECALENDAR_LIST_EVENTS).
  const action = prefix && words[0] === prefix ? words[1] : words.length > 1 ? words[1] : undefined;
  return Boolean(action && READ_VERBS.has(action));
}

/**
 * Runs one Composio tool: `POST /tools/execute/{tool}` with its arguments. Only toolkits you
 * switched on. Every call goes through the policy gate; a send runs only from Marcus's
 * approved step (`approved: true`).
 */
export async function executeComposioTool(
  tool: string,
  args: Record<string, unknown>,
  opts: { toolkit?: string; approved?: boolean } = {},
): Promise<ComposioActionResult> {
  const config = getComposioConfig();
  if (!config.apiKey) return { error: 'No API key configured', success: false, data: null };
  const toolkit = String(opts.toolkit || String(tool).split('_')[0] || '').toLowerCase();
  if (!enabledComposioToolkits().includes(toolkit)) {
    return { success: false, data: null, error: `The ${toolkit} toolkit is not switched on in Settings → Composio.` };
  }
  const gate = evaluatePolicyGate({ connectorId: 'composio', actionType: String(tool).toLowerCase(), commandPreview: JSON.stringify({ tool, args }).slice(0, 500), approved: Boolean(opts.approved) });
  if (!gate.ok) return { success: false, data: null, error: gate.reason || 'The policy gate blocked it.' };
  try {
    const response = await fetch(`${COMPOSIO_API_BASE}/tools/execute/${encodeURIComponent(tool)}`, {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args || {}, user_id: config.userId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, data: null, error: String(body?.message || body?.error || `Composio returned HTTP ${response.status}`) };
    }
    if (body?.successful === false) return { success: false, data: body?.data ?? null, error: String(body?.error || 'Composio refused it.') };
    return { success: true, data: body?.data ?? body, error: null };
  } catch (error) {
    return { success: false, data: null, error: String((error as Error)?.message || error) };
  }
}

// ── Status & Health ─────────────────────────────────────────────────────────

export async function checkComposioHealth(): Promise<ComposioHealthResult> {
  const config = getComposioConfig();
  if (!config.apiKey) {
    return { status: 'not_configured', enabled: false, message: 'API key not set' };
  }

  try {
    // A real authenticated call (v3.1 has no /health).
    const response = await fetch(`${COMPOSIO_API_BASE}/toolkits?limit=1`, {
      method: 'GET',
      headers: { 'x-api-key': config.apiKey }
    });

    if (response.ok) {
      return { status: 'healthy', enabled: true, message: 'Composio API is reachable' };
    }

    return { status: 'error', enabled: false, message: `API returned HTTP ${response.status}` };
  } catch (error) {
    return { status: 'error', enabled: false, message: String((error as Error)?.message || error) };
  }
}

export function getComposioStatus(): ComposioStatusResult {
  const config = getComposioConfig();
  const cached = getCachedToolkits();
  return {
    enabled: config.enabled,
    hasApiKey: !!config.apiKey,
    apiKeyPrefix: config.apiKey ? config.apiKey.slice(0, 8) + '...' : '',
    userId: config.userId,
    cachedToolkits: cached?.length || 0,
    cachedAtMs: cached ? timestampMs() : null
  };
}
