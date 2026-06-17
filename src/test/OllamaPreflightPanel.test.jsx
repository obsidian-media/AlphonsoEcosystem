import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('../services/eventsService.js', () => ({
  EVENT_OUTCOMES: { SUCCESS: 'success', FAILURE: 'failure', BLOCKED: 'blocked', PENDING: 'pending', SKIPPED: 'skipped' },
  buildOllamaPreflightEvent: vi.fn((overrides = {}) => ({
    id: `evt-${Date.now()}`,
    eventType: 'ollama.preflight',
    source: 'alphonso/operator',
    subjectKind: 'ollama_model',
    subjectId: overrides.model || null,
    outcome: overrides.ok ? 'success' : 'failure',
    payload: { endpoint: overrides.endpoint || 'http://127.0.0.1:11434', model: overrides.model, ok: Boolean(overrides.ok), error: overrides.error || null },
    dedupKey: `ollama.preflight:${overrides.model || 'runtime'}:${overrides.endpoint || 'default'}`,
    occurredAtMs: Date.now(),
    correlationId: overrides.correlationId || null,
    trust: overrides.ok ? 'verified' : 'failed'
  })),
  recordEvent: vi.fn(async (ev) => ({ ok: true, proof: { written: 1 }, event: ev })),
  listEvents: vi.fn(async () => [
    { id: 'e1', eventType: 'ollama.preflight', source: 'alphonso/operator', subjectId: 'llama3.2:3b', outcome: 'success', occurredAtMs: Date.now() - 1000, trust: 'verified' },
    { id: 'e2', eventType: 'ollama.preflight', source: 'alphonso/operator', subjectId: 'qwen2.5:3b', outcome: 'failure', occurredAtMs: Date.now() - 60_000, trust: 'failed' }
  ])
}));

vi.mock('../lib/ollama.js', () => ({
  checkOllama: vi.fn(async () => ({
    state: 'connected',
    label: 'Connected',
    message: 'ok',
    models: [{ name: 'llama3.2:3b' }],
    selectedModel: 'llama3.2:3b'
  })),
  normalizeEndpoint: vi.fn((e) => e || 'http://localhost:11434')
}));

import { OllamaPreflightPanel } from '../components/OllamaPreflightPanel.jsx';
import { listEvents, recordEvent } from '../services/eventsService.js';
import { checkOllama } from '../lib/ollama.js';

describe('OllamaPreflightPanel', () => {
  beforeEach(() => {
    listEvents.mockClear();
    recordEvent.mockClear();
    checkOllama.mockClear();
  });

  it('renders with preflight event stats on mount', async () => {
    render(<OllamaPreflightPanel />);
    await waitFor(() => expect(listEvents).toHaveBeenCalled());
    expect(screen.getByText('Total (7d)')).toBeTruthy();
    expect(screen.getByText('Success')).toBeTruthy();
    expect(screen.getByText('Failure')).toBeTruthy();
  });

  it('Re-run preflight button calls checkOllama + recordEvent', async () => {
    render(<OllamaPreflightPanel />);
    const button = await screen.findByRole('button', { name: /Re-run preflight/i });
    fireEvent.click(button);
    await waitFor(() => expect(checkOllama).toHaveBeenCalled());
    await waitFor(() => expect(recordEvent).toHaveBeenCalled());
  });

  it('shows the last preflight state after a successful re-run', async () => {
    render(<OllamaPreflightPanel />);
    const button = await screen.findByRole('button', { name: /Re-run preflight/i });
    fireEvent.click(button);
    await waitFor(() => screen.getByText('Last preflight'));
    expect(screen.getByText('connected')).toBeTruthy();
  });

  it('handles listEvents returning empty (no events yet)', async () => {
    listEvents.mockResolvedValueOnce([]);
    render(<OllamaPreflightPanel />);
    await waitFor(() => expect(listEvents).toHaveBeenCalled());
    expect(screen.getByText(/No preflight events yet/i)).toBeTruthy();
  });

  it('falls back gracefully when recordEvent rejects (non-blocking)', async () => {
    recordEvent.mockRejectedValueOnce(new Error('table locked'));
    render(<OllamaPreflightPanel />);
    const button = await screen.findByRole('button', { name: /Re-run preflight/i });
    fireEvent.click(button);
    await waitFor(() => screen.getByText('table locked'));
  });
});
