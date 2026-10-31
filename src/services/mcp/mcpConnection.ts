// Outside tools (2026-10-30): listing a server's tools, calling one, searching the MCP
// Registry and signing in, all through the backend (`mcpBackend.ts`).
import { backend, inDesktopApp, NOT_DESKTOP } from './mcpBackend';
import { getServer, mergeTools, updateServer, type ListedTool, type McpServer, type McpVersion } from './mcpServers';

export { NOT_DESKTOP };

export const TOOLS_CACHE_MS = 10 * 60 * 1000;
export const NO_SUCH_SERVER = 'That outside tools server isn’t saved any more.';

interface ToolsAnswer {
  ok: boolean;
  tools: ListedTool[];
  truncated?: boolean;
  ttlMs?: number;
  version?: McpVersion;
  reason?: string;
  needsSignIn?: boolean;
  rejected?: string[];
}

interface CallAnswer {
  ok: boolean;
  text: string;
  isError?: boolean;
  version?: McpVersion;
  reason?: string;
  needsSignIn?: boolean;
}

export interface RegistryServer {
  name: string;
  title: string;
  description: string;
  websiteUrl: string;
  remotes: Array<{ type: string; url: string; headers: Array<{ name: string; description: string; isSecret: boolean; isRequired: boolean }> }>;
}

function fresh(s: McpServer, nowMs: number): boolean {
  return Boolean(s.toolsAtMs) && nowMs - (s.toolsAtMs as number) < (s.ttlMs ?? TOOLS_CACHE_MS);
}

/** Lists a server's tools (cached for its ttl, else 10 minutes) keeping the user's marks. */
export async function refreshTools(serverId: string, options: { force?: boolean; nowMs?: number } = {}): Promise<{ ok: boolean; reason?: string }> {
  const server = getServer(serverId);
  if (!server) return { ok: false, reason: NO_SUCH_SERVER };
  const nowMs = options.nowMs ?? Date.now();
  if (!options.force && fresh(server, nowMs)) return { ok: true };
  if (!inDesktopApp()) return { ok: false, reason: NOT_DESKTOP };
  let answer: ToolsAnswer;
  try {
    answer = await backend<ToolsAnswer>('mcp_list_tools', { serverId, url: server.url, version: server.version ?? null });
  } catch {
    return { ok: false, reason: 'The server couldn’t be reached.' };
  }
  if (!answer.ok) {
    updateServer(serverId, { needsSignIn: Boolean(answer.needsSignIn), lastReason: answer.reason });
    return { ok: false, reason: answer.reason || 'The server didn’t list its tools.' };
  }
  updateServer(serverId, {
    tools: mergeTools(server.tools, answer.tools),
    version: answer.version ?? server.version,
    toolsAtMs: nowMs,
    ...(answer.ttlMs ? { ttlMs: answer.ttlMs } : {}),
    truncated: Boolean(answer.truncated),
    rejected: answer.rejected ?? [],
    needsSignIn: false,
    lastReason: undefined,
  });
  return { ok: true };
}

/** Calls one tool once. The result text is the server's (untrusted; callers fence it). */
export async function callTool(serverId: string, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string; reason?: string; needsSignIn?: boolean }> {
  const server = getServer(serverId);
  if (!server) return { ok: false, text: '', reason: NO_SUCH_SERVER };
  if (!inDesktopApp()) return { ok: false, text: '', reason: NOT_DESKTOP };
  const entry = server.tools.find((t) => t.name === tool);
  let answer: CallAnswer;
  try {
    answer = await backend<CallAnswer>('mcp_call_tool', {
      serverId, url: server.url, version: server.version ?? null, tool, arguments: args, inputSchema: entry?.inputSchema ?? null,
    });
  } catch {
    return { ok: false, text: '', reason: 'The server couldn’t be reached.' };
  }
  if (answer.needsSignIn) {
    updateServer(serverId, { needsSignIn: true, lastReason: answer.reason });
    return { ok: false, text: '', reason: answer.reason, needsSignIn: true };
  }
  if (answer.version && answer.version !== server.version) updateServer(serverId, { version: answer.version });
  if (answer.reason) return { ok: false, text: '', reason: answer.reason };
  if (answer.isError) return { ok: false, text: answer.text, reason: `${server.name} said: ${answer.text.slice(0, 300)}` };
  return { ok: true, text: answer.text };
}

export async function searchRegistry(text: string): Promise<RegistryServer[]> {
  if (!inDesktopApp()) return [];
  return backend<RegistryServer[]>('mcp_registry_search', { text });
}

/** Signs in through the browser; on success the tools are listed again. */
export async function signIn(serverId: string, pastedClientId?: string): Promise<{ ok: boolean; reason?: string; notNeeded?: boolean }> {
  const server = getServer(serverId);
  if (!server) return { ok: false, reason: NO_SUCH_SERVER };
  if (!inDesktopApp()) return { ok: false, reason: NOT_DESKTOP };
  const r = await backend<{ ok: boolean; reason?: string; notNeeded?: boolean }>('mcp_sign_in', {
    serverId, url: server.url, pastedClientId: pastedClientId?.trim() || null,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  updateServer(serverId, { signIn: r.notNeeded ? server.signIn : 'browser', needsSignIn: false, lastReason: undefined });
  await refreshTools(serverId, { force: true });
  return { ok: true, ...(r.notNeeded ? { notNeeded: true } : {}) };
}

/** Finishes the last sign-in from the address the browser ended on. */
export async function finishPastedSignIn(serverId: string, address: string): Promise<{ ok: boolean; reason?: string }> {
  if (!inDesktopApp()) return { ok: false, reason: NOT_DESKTOP };
  const r = await backend<{ ok: boolean; reason?: string }>('mcp_finish_pasted', { address });
  if (r.ok) {
    updateServer(serverId, { signIn: 'browser', needsSignIn: false, lastReason: undefined });
    await refreshTools(serverId, { force: true });
  }
  return r;
}

/** A key or header the server needs, kept in the keychain. */
export async function saveServerHeader(serverId: string, name: string, value: string): Promise<void> {
  if (!inDesktopApp()) throw new Error(NOT_DESKTOP);
  const server = getServer(serverId);
  if (!server) throw new Error(NO_SUCH_SERVER);
  // The backend binds the key to this address: it is only ever sent there.
  await backend('mcp_save_header', { serverId, url: server.url, name, value });
  updateServer(serverId, { signIn: 'key' });
}

/** Which secrets a server has saved, by name only. */
export async function savedParts(serverId: string): Promise<{ headers: string[]; signedIn: boolean }> {
  if (!inDesktopApp()) return { headers: [], signedIn: false };
  try { return await backend('mcp_saved_parts', { serverId }); } catch { return { headers: [], signedIn: false }; }
}
