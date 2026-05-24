import '@testing-library/jest-dom/vitest';

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
      }
    },
    configurable: true
  });
}
