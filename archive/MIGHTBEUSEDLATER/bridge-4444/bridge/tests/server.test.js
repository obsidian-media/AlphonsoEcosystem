/* global process */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockApp } from './__mocks__/express.js';

vi.mock('node:child_process', () => ({ exec: vi.fn() }));

vi.mock('node:fs', () => ({ readFileSync: vi.fn(), existsSync: vi.fn() }));

describe('MCP Bridge Server', () => {

  beforeEach(async () => {
    process.env.OLLAMA_BASE = 'http://localhost:11434';
    process.env.OLLAMA_MODEL = 'llama3.2';
    process.env.ALPHONSO_BRIDGE_PORT = '4444';
    await import('../server.js');
  });

  afterEach(() => {
    delete process.env.OLLAMA_BASE;
    delete process.env.OLLAMA_MODEL;
    delete process.env.ALPHONSO_BRIDGE_PORT;
  });

  it('registers alphonso_run_pipeline endpoint', () => {
    expect(mockApp.post).toHaveBeenCalledWith('/tool/alphonso_run_pipeline', expect.any(Function));
  });

  it('registers alphonso_search_memory endpoint', () => {
    expect(mockApp.post).toHaveBeenCalledWith('/tool/alphonso_search_memory', expect.any(Function));
  });

  it('registers alphonso_research endpoint', () => {
    expect(mockApp.post).toHaveBeenCalledWith('/tool/alphonso_research', expect.any(Function));
  });

  it('registers alphonso_get_status endpoint', () => {
    expect(mockApp.post).toHaveBeenCalledWith('/tool/alphonso_get_status', expect.any(Function));
  });

  it('registers alphonso_get_receipts endpoint', () => {
    expect(mockApp.post).toHaveBeenCalledWith('/tool/alphonso_get_receipts', expect.any(Function));
  });

  it('registers /modules GET endpoint', () => {
    expect(mockApp.get).toHaveBeenCalledWith('/modules', expect.any(Function));
  });

  it('registers /health GET endpoint', () => {
    expect(mockApp.get).toHaveBeenCalledWith('/health', expect.any(Function));
  });

  it('binds to 127.0.0.1:4444', () => {
    expect(mockApp.listen).toHaveBeenCalledWith(4444, '127.0.0.1', expect.any(Function));
  });

  // The two tests below replace ones that only asserted on environment
  // variables the test itself had just set, so they could never fail. They now
  // load server.js fresh and check what it actually does with the environment.
  async function loadFreshServer(env) {
    vi.resetModules();
    for (const key of ['ALPHONSO_BRIDGE_PORT', 'BRIDGE_PORT', 'OLLAMA_MODEL', 'OLLAMA_BASE']) delete process.env[key];
    Object.assign(process.env, env);
    // server.js and this import share one freshly reset express mock instance.
    const { mockApp: freshApp } = await import('./__mocks__/express.js');
    await import('../server.js');
    return freshApp;
  }

  function handlerFor(app, route) {
    const call = app.post.mock.calls.find(([path]) => path === route);
    expect(call, `${route} not registered`).toBeDefined();
    return call[1];
  }

  function fakeResponse() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
  }

  it('listens on the port from ALPHONSO_BRIDGE_PORT', async () => {
    const app = await loadFreshServer({ ALPHONSO_BRIDGE_PORT: '4555' });
    expect(app.listen).toHaveBeenCalledWith(4555, '127.0.0.1', expect.any(Function));
  });

  it('falls back to port 4444 when no port is configured', async () => {
    const app = await loadFreshServer({});
    expect(app.listen).toHaveBeenCalledWith(4444, '127.0.0.1', expect.any(Function));
  });

  it('asks Ollama for the default model when OLLAMA_MODEL is unset', async () => {
    const app = await loadFreshServer({});
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: 'summary' } }) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = fakeResponse();
      await handlerFor(app, '/tool/alphonso_research')({ body: { topic: 'tauri' } }, res);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:11434/api/chat');
      expect(JSON.parse(init.body).model).toBe('llama3.2');
      expect(res.body).toMatchObject({ ok: true, model: 'llama3.2' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses OLLAMA_MODEL and OLLAMA_BASE when they are set', async () => {
    const app = await loadFreshServer({ OLLAMA_MODEL: 'qwen2.5', OLLAMA_BASE: 'http://ollama.test:9999' });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ message: { content: 'x' } }) }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const res = fakeResponse();
      await handlerFor(app, '/tool/alphonso_research')({ body: { topic: 'tauri' } }, res);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://ollama.test:9999/api/chat');
      expect(JSON.parse(init.body).model).toBe('qwen2.5');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a research request without a topic', async () => {
    const app = await loadFreshServer({});
    const res = fakeResponse();
    await handlerFor(app, '/tool/alphonso_research')({ body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'topic is required' });
  });
});
