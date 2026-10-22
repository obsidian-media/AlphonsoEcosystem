import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// QA 2026-10-22 (Bug 73): an Ollama the user started refuses the app window.
// The picker asked from the window only, so it said "Ollama offline" and no
// model could be chosen, while chat itself worked through the backend.
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args), isTauri: () => true }));

import { OllamaModelPicker } from '../../components/ModelSwitcher';

describe('OllamaModelPicker', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInvoke.mockReset();
    (window as unknown as { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};
  });

  it('lists the models through the backend when the window is refused', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    mockInvoke.mockImplementation(async (command: string) => (
      command === 'ollama_list_models' ? { reachable: true, models: [{ name: 'llama3.2:3b' }, { name: 'qwen2.5:7b' }] } : null
    ));
    render(<OllamaModelPicker />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'qwen2.5:7b' })).toBeTruthy());
    expect(screen.queryByText(/Ollama offline/i)).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('ollama_list_models', expect.anything());
  });
});
