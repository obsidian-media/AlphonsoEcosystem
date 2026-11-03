// "Try a demo" (phone phase 3 part C, owner 2026-11-02): a stand-in for the link to a computer. It
// answers the real screens with sample data, refuses every action, and reaches nothing outside the app.
import type { PhoneLink } from '../phoneSession';
import type { PhonePreviewParts } from '../../services/phone/remoteData';
import type { PreviewStore } from '../previewFetch';
import type { MirroredStore } from '../../services/phone/phoneProtocol';
import { demoMirror, DEMO_PICTURES } from './demoData';

export const DEMO_BANNER = 'Demo · sample data, nothing is sent';
export const DEMO_REFUSED = 'This is a demo: nothing is sent.';
export const DEMO_CHAT_REPLY = "This is a demo, so I can't do that here. Pair your computer and I'll answer for real.";

function toBase64(bytes: Uint8Array): string {
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createDemoLink(nowMs: number = Date.now()): PhoneLink {
  const state = demoMirror(nowMs) as Record<string, any>;
  const mirrorFns = new Set<Parameters<PhoneLink['onMirror']>[0]>();
  let version = 1;
  const emit = (store: MirroredStore, kind: 'snapshot' | 'change') => {
    version += 1;
    for (const fn of mirrorFns) fn({ kind, store, data: state[store], version });
  };

  return {
    online: () => true,
    offlineSince: () => null,
    onStatus: () => () => undefined,
    onNotice: () => () => undefined,
    onMirror(fn) {
      mirrorFns.add(fn);
      for (const store of Object.keys(state) as MirroredStore[]) fn({ kind: 'snapshot', store, data: state[store], version });
      return () => mirrorFns.delete(fn);
    },
    async call(name, args) {
      if (name === 'mirror.snapshot') return { ok: true, value: JSON.parse(JSON.stringify(state)) };
      if (name === 'chat.send') {
        const { messageId, text } = (args || {}) as { messageId: string; text: string };
        const atMs = Date.now();
        state.chat = [...state.chat, { id: messageId, role: 'user', text, atMs }, { id: `${messageId}-reply`, role: 'assistant', text: DEMO_CHAT_REPLY, atMs: atMs + 1 }];
        emit('chat', 'change');
        return { ok: true };
      }
      if (name === 'media.preview') {
        const { ref, piece } = (args || {}) as { ref?: { path?: string }; piece?: number };
        const svg = ref?.path ? DEMO_PICTURES[ref.path] : undefined;
        if (!svg) return { ok: false, error: DEMO_REFUSED };
        const bytes = new TextEncoder().encode(svg);
        const info = { mime: 'image/svg+xml', bytes: bytes.length, sha256: await sha256Hex(bytes), pieces: 1 };
        if (piece === undefined) return { ok: true, value: info };
        const data = toBase64(bytes);
        return { ok: true, value: { ...info, piece: 0, data, pieceSha256: await sha256Hex(data) } };
      }
      return { ok: false, error: DEMO_REFUSED };
    },
    stop() { mirrorFns.clear(); },
  };
}

/** Previews held in memory as data addresses: nothing written on the phone. */
function memoryPreviewStore(): PreviewStore {
  const kept = new Map<string, string>();
  return {
    get: async (key) => kept.get(key) ?? null,
    put: async (key, bytes, mime) => { const url = `data:${mime};base64,${toBase64(bytes)}`; kept.set(key, url); return url; },
    remove: async (key) => { kept.delete(key); },
    keys: async () => [...kept.keys()],
  };
}

/** What the phone's data layer needs for the demo: memory-only previews and storage. */
export function demoDataOptions(): { parts: PhonePreviewParts; options: { memoryOnly: true } } {
  return { parts: { previewStore: memoryPreviewStore(), network: async () => 'wifi' }, options: { memoryOnly: true } };
}
