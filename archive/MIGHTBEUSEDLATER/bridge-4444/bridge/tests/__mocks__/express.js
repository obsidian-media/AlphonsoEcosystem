import { vi } from 'vitest';

export const mockApp = {
  use: vi.fn(() => mockApp),
  post: vi.fn(() => mockApp),
  get: vi.fn(() => mockApp),
  listen: vi.fn((port, host, cb) => { if (cb) cb(); return mockApp; }),
};

export default Object.assign(
  function express() { return mockApp; },
  { json: vi.fn(() => mockApp), urlencoded: vi.fn(() => mockApp) }
);
