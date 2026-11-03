// The desktop app's phone link through the backend (2026-11-03): the window's CSP blocks
// libsodium's WebAssembly and the relay, so encryption and the relay socket live in Rust.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const tauri = vi.hoisted(() => {
  const listeners: Array<(e: { payload: unknown }) => void> = [];
  return {
    listeners,
    invoke: vi.fn(async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => undefined),
    listen: vi.fn(async (_name: string, fn: (e: { payload: unknown }) => void) => {
      listeners.push(fn);
      return () => { listeners.splice(listeners.indexOf(fn), 1); };
    }),
  };
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauri.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: tauri.listen }));

import { backendLinkBox, backendSocketFactory, RELAY_EVENT } from '../../../services/phone/backendLink';

const flush = () => new Promise((r) => setTimeout(r, 0));
const fire = (payload: unknown) => { for (const fn of [...tauri.listeners]) fn({ payload }); };

describe('backendLinkBox', () => {
  beforeEach(() => { tauri.invoke.mockReset(); });

  it('asks the backend for the public key, sealing and opening; never for a private key', async () => {
    tauri.invoke.mockImplementation(async (cmd: string) => ({
      phone_link_public_key: 'PUB', phone_seal: 'SEALED', phone_open: 'TEXT', phone_open_anonymous: 'PAIR',
    } as Record<string, string>)[cmd]);
    expect(await backendLinkBox.publicKey()).toBe('PUB');
    expect(await backendLinkBox.seal('hi', 'THEIRS')).toBe('SEALED');
    expect(await backendLinkBox.open('F', 'THEIRS')).toBe('TEXT');
    expect(await backendLinkBox.openAnonymous('F')).toBe('PAIR');
    expect(tauri.invoke.mock.calls).toEqual([
      ['phone_link_public_key'],
      ['phone_seal', { message: 'hi', theirPublic: 'THEIRS' }],
      ['phone_open', { sealed: 'F', theirPublic: 'THEIRS' }],
      ['phone_open_anonymous', { sealed: 'F' }],
    ]);
    expect(Object.keys(backendLinkBox)).not.toContain('privateKey');
  });

  it("a frame that won't open is null, never an error", async () => {
    tauri.invoke.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(null);
    expect(await backendLinkBox.open('F', 'K')).toBeNull();
    expect(await backendLinkBox.openAnonymous('F')).toBeNull();
  });
});

describe('backendSocketFactory', () => {
  beforeEach(() => { tauri.invoke.mockReset(); tauri.listeners.length = 0; });

  it('opens through the backend and passes on its open, messages and close for its own id only', async () => {
    tauri.invoke.mockImplementation(async (cmd: string) => (cmd === 'phone_relay_open' ? 7 : undefined));
    const socket = backendSocketFactory('wss://relay.test/link');
    const seen: string[] = [];
    socket.onOpen(() => seen.push('open'));
    socket.onMessage((t) => seen.push(`msg:${t}`));
    socket.onClose(() => seen.push('close'));
    await flush();
    expect(tauri.listen).toHaveBeenCalledWith(RELAY_EVENT, expect.any(Function));
    expect(tauri.invoke).toHaveBeenCalledWith('phone_relay_open', { windowRelayUrl: 'wss://relay.test/link' });
    fire({ id: 6, kind: 'message', text: 'old' });
    fire({ id: 7, kind: 'open' });
    fire({ id: 7, kind: 'message', text: 'hello' });
    socket.send('out');
    await flush();
    expect(tauri.invoke).toHaveBeenCalledWith('phone_relay_send', { id: 7, text: 'out' });
    fire({ id: 7, kind: 'close' });
    expect(seen).toEqual(['open', 'msg:hello', 'close']);
    expect(tauri.listeners).toHaveLength(0);
  });

  it('closing before the backend answered still closes that connection', async () => {
    let answer: (n: number) => void = () => {};
    tauri.invoke.mockImplementation((cmd: string) => (cmd === 'phone_relay_open' ? new Promise((r) => { answer = r as (n: number) => void; }) : Promise.resolve()));
    const socket = backendSocketFactory('wss://relay.test/link');
    await flush();
    socket.close();
    answer(9);
    await flush();
    expect(tauri.invoke).toHaveBeenCalledWith('phone_relay_close', { id: 9 });
  });

  it('a backend that refuses to open (no relay in this build) ends as a close', async () => {
    tauri.invoke.mockRejectedValue("Phone access isn't available in this version of Alphonso.");
    const socket = backendSocketFactory('wss://relay.test/link');
    const closed = vi.fn();
    socket.onClose(closed);
    await flush(); await flush();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
