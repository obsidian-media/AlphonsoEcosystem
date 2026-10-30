// Outside tools (2026-10-30, owner): the MCP servers the user added and each tool's mark.
// Nothing secret is stored here (keys and sign-ins are in the keychain). A server not marked
// Free counts as Paid; every tool asks first until the user marks it "Reading only"; the
// server's own hints are kept beside it as suggestions only.
import { durableGet, durableSet } from '../../lib/durableStore';
import { forgetServerSecrets } from './mcpBackend';

export const MCP_SERVERS_KEY = 'alphonso_mcp_servers_v1';

export type ToolMark = 'ask' | 'reading_only' | 'deletes';
export type McpVersion = '2026-07-28' | '2025-11-25';

export interface McpToolEntry {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  hintReadOnly?: boolean;
  hintDestructive?: boolean;
  mark: ToolMark;
  off?: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  version?: McpVersion;
  signIn: 'browser' | 'key' | 'none';
  cost: 'free' | 'paid';
  pricePerCallUsd?: number;
  enabled: boolean;
  tools: McpToolEntry[];
  toolsAtMs?: number;
  ttlMs?: number;
  truncated?: boolean;
  rejected?: string[];
  needsSignIn?: boolean;
  lastReason?: string;
}

/** A tool as the backend lists it. */
export interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

const listeners = new Set<() => void>();

export function onServersChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listServers(): McpServer[] {
  try {
    const parsed = JSON.parse(durableGet(MCP_SERVERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(servers: McpServer[]): void {
  try { durableSet(MCP_SERVERS_KEY, JSON.stringify(servers)); } catch { /* storage full or unavailable */ }
  for (const l of listeners) {
    try { l(); } catch { /* a screen's listener */ }
  }
}

export function getServer(id: string): McpServer | undefined {
  return listServers().find((s) => s.id === id);
}

function slug(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'server';
}

export function addServer(input: { name: string; url: string; cost?: 'free' | 'paid'; pricePerCallUsd?: number; signIn?: McpServer['signIn'] }): McpServer {
  const servers = listServers();
  const base = slug(input.name);
  let id = base;
  for (let n = 2; servers.some((s) => s.id === id); n += 1) id = `${base}-${n}`;
  const price = typeof input.pricePerCallUsd === 'number' && Number.isFinite(input.pricePerCallUsd) && input.pricePerCallUsd >= 0 ? input.pricePerCallUsd : undefined;
  const server: McpServer = {
    id,
    name: input.name.trim() || id,
    url: input.url.trim(),
    signIn: input.signIn ?? 'none',
    cost: input.cost === 'free' ? 'free' : 'paid',
    ...(price !== undefined ? { pricePerCallUsd: price } : {}),
    enabled: true,
    tools: [],
  };
  save([...servers, server]);
  return server;
}

export function updateServer(id: string, patch: Partial<Omit<McpServer, 'id'>>): McpServer | undefined {
  let updated: McpServer | undefined;
  const servers = listServers().map((s) => {
    if (s.id !== id) return s;
    updated = { ...s, ...patch, id: s.id };
    return updated;
  });
  if (updated) save(servers);
  return updated;
}

export async function removeServer(id: string): Promise<void> {
  save(listServers().filter((s) => s.id !== id));
  await forgetServerSecrets(id);
}

function updateTool(serverId: string, tool: string, patch: Partial<McpToolEntry>): void {
  const s = getServer(serverId);
  if (!s) return;
  updateServer(serverId, { tools: s.tools.map((t) => (t.name === tool ? { ...t, ...patch } : t)) });
}

export function setToolMark(serverId: string, tool: string, mark: ToolMark): void {
  updateTool(serverId, tool, { mark });
}

export function setToolOff(serverId: string, tool: string, off: boolean): void {
  updateTool(serverId, tool, { off });
}

/** The listed tools with the user's marks kept for tools still there; new tools ask first. */
export function mergeTools(existing: McpToolEntry[], listed: ListedTool[]): McpToolEntry[] {
  const before = new Map(existing.map((t) => [t.name, t]));
  return listed.map((t) => {
    const old = before.get(t.name);
    return {
      name: t.name,
      ...(t.title ? { title: t.title } : {}),
      ...(t.description ? { description: t.description } : {}),
      inputSchema: t.inputSchema ?? {},
      ...(typeof t.readOnlyHint === 'boolean' ? { hintReadOnly: t.readOnlyHint } : {}),
      ...(typeof t.destructiveHint === 'boolean' ? { hintDestructive: t.destructiveHint } : {}),
      mark: old?.mark ?? 'ask',
      ...(old?.off ? { off: true } : {}),
    };
  });
}
