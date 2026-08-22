import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for a real QA finding (Q&A E2E Test.md, Round 3 N-14,
// "Endpoint propagation — now measured, not inferred"): the QA pass pointed
// Settings' "Ollama API Endpoint" at a second Ollama instance and observed
// several call sites keep polling the OLD hardcoded localhost:11434 default
// instead of following the configured endpoint. getConfiguredOllamaEndpoint()
// is the fix — every previously-hardcoded call site now reads through it.

describe('getConfiguredOllamaEndpoint', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('falls back to the default endpoint when no settings are persisted', async () => {
    const { getConfiguredOllamaEndpoint, DEFAULT_OLLAMA_ENDPOINT } = await import('../lib/ollama');
    expect(getConfiguredOllamaEndpoint()).toBe(DEFAULT_OLLAMA_ENDPOINT);
  });

  it('follows the user-configured endpoint from Settings, matching the QA repro (repointing to :11500)', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ endpoint: 'http://localhost:11500' }));
    const { getConfiguredOllamaEndpoint } = await import('../lib/ollama');
    expect(getConfiguredOllamaEndpoint()).toBe('http://localhost:11500');
  });

  it('normalizes a bare host:port value the same way the rest of the app does', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ endpoint: '192.168.1.50:11434' }));
    const { getConfiguredOllamaEndpoint } = await import('../lib/ollama');
    expect(getConfiguredOllamaEndpoint()).toBe('http://192.168.1.50:11434');
  });

  it('falls back to the default when the persisted endpoint is empty/blank', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ endpoint: '' }));
    const { getConfiguredOllamaEndpoint, DEFAULT_OLLAMA_ENDPOINT } = await import('../lib/ollama');
    expect(getConfiguredOllamaEndpoint()).toBe(DEFAULT_OLLAMA_ENDPOINT);
  });
});
