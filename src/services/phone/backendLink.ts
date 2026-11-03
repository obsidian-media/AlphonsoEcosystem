// The desktop app's phone link through the backend (2026-11-03). The window's security
// policy blocks libsodium's WebAssembly and the relay, so the computer's encryption
// (src-tauri/src/phone_box.rs, its private key never leaves the keychain) and its relay socket
// (src-tauri/src/phone_relay.rs) live in Rust. phoneLink.ts keeps every rule; this file only
// carries text across.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { LinkBox, RelaySocket, SocketFactory } from './phoneLink';

export const RELAY_EVENT = 'phone://relay';

/** Inside the desktop app (Tauri), not a browser or a test. */
export function inDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const orNull = async (call: Promise<unknown>): Promise<string | null> => {
  try {
    const value = await call;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
};

/** Sealing and opening by the backend; the window only ever sees the public key. */
export const backendLinkBox: LinkBox = {
  publicKey: () => invoke<string>('phone_link_public_key'),
  seal: (message, theirPublic) => invoke<string>('phone_seal', { message, theirPublic }),
  open: (sealed, theirPublic) => orNull(invoke('phone_open', { sealed, theirPublic })),
  openAnonymous: (sealed) => orNull(invoke('phone_open_anonymous', { sealed })),
};

interface RelayEvent { id: number; kind: 'open' | 'message' | 'close'; text?: string }

/** The relay connection, held by the backend. Events for an older connection are ignored. */
export const backendSocketFactory: SocketFactory = (url): RelaySocket => {
  let id: number | null = null;
  let closing = false;
  let ended = false;
  const waiting: RelayEvent[] = [];
  const on = { open: () => {}, message: (_t: string) => {}, close: () => {} };
  let unlisten: (() => void) | null = null;

  const end = () => {
    if (ended) return;
    ended = true;
    unlisten?.();
    unlisten = null;
    on.close();
  };
  const handle = (e: RelayEvent) => {
    if (e.id !== id || ended) return;
    if (e.kind === 'open') on.open();
    else if (e.kind === 'message' && typeof e.text === 'string') on.message(e.text);
    else if (e.kind === 'close') end();
  };

  void (async () => {
    try {
      unlisten = await listen<RelayEvent>(RELAY_EVENT, (e) => {
        if (id === null) waiting.push(e.payload);
        else handle(e.payload);
      });
      id = await invoke<number>('phone_relay_open', { windowRelayUrl: url });
      if (closing) {
        await invoke('phone_relay_close', { id });
        return;
      }
      for (const e of waiting.splice(0)) handle(e);
    } catch {
      end();
    }
  })();

  return {
    send: (text) => {
      if (id !== null && !ended) void invoke('phone_relay_send', { id, text }).catch(() => undefined);
    },
    close: () => {
      closing = true;
      if (id !== null) void invoke('phone_relay_close', { id }).catch(() => undefined);
    },
    onMessage: (fn) => { on.message = fn; },
    onClose: (fn) => { on.close = fn; },
    onOpen: (fn) => { on.open = fn; },
  };
};

/** Tells the relay a phone was removed, through the backend. */
export async function backendUnpair(deviceId: string, idToken: string, relayUrl: string): Promise<void> {
  await invoke('phone_relay_unpair', { deviceId, idToken, windowRelayUrl: relayUrl });
}
