import { secureSet, secureGet, secureDelete } from './secureStorageService';

const BROKER_BASE_URL = 'https://seleven-mcp-sg.airudder.com';
const MCP_SERVER_URL = 'https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth';
const TOKEN_STORAGE_KEY = 'CALLE_MCP_TOKEN';
const SESSION_SECRET_HEADER = 'X-OpenAgent-Session-Secret'; // @call-e/core/lib/constants.js

interface CalleMcpTokenDocument {
  accessToken: string;
  expiresAt: string | null;
}

export interface CallePendingLogin {
  sessionId: string;
  sessionSecret: string;
  loginUrl: string;
  status: 'PENDING' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED' | 'EXCHANGED';
  pollAfterMs: number | null;
}

export async function startBrokerLogin(): Promise<CallePendingLogin> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_url: MCP_SERVER_URL,
      channel: 'openagent_oauth',
      scope: 'openid email profile',
      client_name: 'Alphonso'
    })
  });
  if (!response.ok) throw new Error(`CALL-E login session create failed: HTTP ${response.status}`);
  const payload = await response.json();
  return {
    sessionId: String(payload.session_id),
    sessionSecret: String(payload.session_secret),
    loginUrl: String(payload.login_url),
    status: 'PENDING',
    pollAfterMs: Number(payload.poll_after_ms || 2000) || 2000
  };
}

async function getBrokerSessionStatus(pending: CallePendingLogin): Promise<{ status: string }> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions/${pending.sessionId}`, {
    headers: { [SESSION_SECRET_HEADER]: pending.sessionSecret }
  });
  if (!response.ok) throw new Error(`CALL-E login status check failed: HTTP ${response.status}`);
  return response.json();
}

async function exchangeBrokerSession(pending: CallePendingLogin): Promise<{ access_token: string; expires_at?: string }> {
  const response = await fetch(`${BROKER_BASE_URL}/api/v1/openagent-auth/sessions/${pending.sessionId}/exchange`, {
    method: 'POST',
    headers: { [SESSION_SECRET_HEADER]: pending.sessionSecret }
  });
  if (!response.ok) throw new Error(`CALL-E login exchange failed: HTTP ${response.status}`);
  const body = await response.json();
  return { access_token: String(body.access_token), expires_at: body.expires_at ? String(body.expires_at) : undefined };
}

export async function pollBrokerLogin(pending: CallePendingLogin): Promise<'pending' | 'authorized' | 'failed'> {
  const status = await getBrokerSessionStatus(pending);
  const normalized = String(status.status || '').toUpperCase();
  if (normalized === 'AUTHORIZED') {
    const exchanged = await exchangeBrokerSession(pending);
    const doc: CalleMcpTokenDocument = { accessToken: exchanged.access_token, expiresAt: exchanged.expires_at ?? null };
    const stored = await secureSet(TOKEN_STORAGE_KEY, JSON.stringify(doc));
    if (!stored) {
      throw new Error('CALL-E login succeeded but the token could not be saved to secure storage.');
    }
    return 'authorized';
  }
  if (normalized === 'FAILED' || normalized === 'EXPIRED' || normalized === 'EXCHANGED') return 'failed';
  return 'pending';
}

export async function getCalleMcpToken(): Promise<string | null> {
  const raw = await secureGet(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const doc: CalleMcpTokenDocument = JSON.parse(raw);
    if (!doc.accessToken) return null;
    if (doc.expiresAt) {
      const expiresAt = new Date(doc.expiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt - Date.now() <= 300_000) return null;
    }
    return doc.accessToken;
  } catch {
    return null;
  }
}

export async function isCalleMcpConfigured(): Promise<boolean> {
  return (await getCalleMcpToken()) !== null;
}

export async function disconnectCalleMcp(): Promise<void> {
  await secureDelete(TOKEN_STORAGE_KEY);
}
