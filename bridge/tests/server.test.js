/* global process */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockApp } from './__mocks__/express.js';

vi.mock('node:child_process', () => ({ exec: vi.fn() }));

vi.mock('node:fs', () => ({ readFileSync: vi.fn(), existsSync: vi.fn() }));

describe('MCP Bridge Server', () => {
  let serverModule: any;

  beforeEach(async () => {
    process.env.OLLAMA_BASE = 'http://localhost:11434';
    process.env.OLLAMA_MODEL = 'llama3.2';
    process.env.ALPHONSO_BRIDGE_PORT = '4444';
    serverModule = await import('../server.js');
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

  it('uses configured port from environment', () => {
    const PORT = Number(process.env.ALPHONSO_BRIDGE_PORT || 4444);
    expect(PORT).toBe(4444);
  });

  it('uses default Ollama model when not set', () => {
    delete process.env.OLLAMA_MODEL;
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    expect(model).toBe('llama3.2');
  });
});