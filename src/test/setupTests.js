import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  isTauri: vi.fn().mockReturnValue(false)
}));

const memoryStore = {};

if (
  typeof globalThis.localStorage !== 'object' ||
  typeof globalThis.localStorage?.getItem !== 'function' ||
  typeof globalThis.localStorage?.setItem !== 'function' ||
  typeof globalThis.localStorage?.removeItem !== 'function'
) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
      },
      setItem(key, value) {
        memoryStore[key] = String(value);
      },
      removeItem(key) {
        delete memoryStore[key];
      },
      clear() {
        Object.keys(memoryStore).forEach((key) => delete memoryStore[key]);
      },
      get length() {
        return Object.keys(memoryStore).length;
      },
      key(i) {
        return Object.keys(memoryStore)[i] ?? null;
      }
    },
    configurable: true
  });
}

// Vitest's jsdom environment keeps Node's own `URL` global but replaces
// `Blob` with jsdom's implementation. From jsdom 30 on, Node's
// `URL.createObjectURL()` rejects that foreign Blob ("Cannot read properties
// of undefined (reading '_buffer')"). No real browser has this mismatch, so
// give tests a stable stand-in; a test that cares about the URL can still
// replace these with its own `vi.fn()`.
let objectUrlCounter = 0;
URL.createObjectURL = () => `blob:mock-object-url-${++objectUrlCounter}`;
URL.revokeObjectURL = () => {};
