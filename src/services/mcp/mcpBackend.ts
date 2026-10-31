// Outside tools (2026-10-30): the app's one way to the backend MCP client (`mcp_client.rs`,
// `mcp_auth.rs`). Keys and sign-in tokens never pass through here: the backend reads them
// from the keychain by server id.
import { invoke } from '@tauri-apps/api/core';

export const NOT_DESKTOP = 'Outside tools work in the desktop app.';

export const inDesktopApp = (): boolean =>
  typeof window !== 'undefined' && Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__);

export function backend<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

export async function forgetServerSecrets(serverId: string): Promise<void> {
  if (!inDesktopApp()) return;
  try { await backend('mcp_forget_server', { serverId }); } catch { /* nothing saved, or the keychain is unavailable */ }
}
