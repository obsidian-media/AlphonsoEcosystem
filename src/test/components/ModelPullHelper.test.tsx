import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

const pull = vi.fn();
const openLink = vi.fn();
vi.mock('../../lib/ollama', async (orig) => ({
  ...(await orig<typeof import('../../lib/ollama')>()),
  pullOllamaModel: (...args: unknown[]) => pull(...args),
  getConfiguredOllamaEndpoint: () => 'http://127.0.0.1:11434',
}));
vi.mock('../../services/browserAutomationService', () => ({ openExternalUrl: (url: string) => openLink(url) }));

import { ModelPullHelper } from '../../components/ModelPullHelper';
import { PREFERRED_MODEL } from '../../lib/ollama';

describe('ModelPullHelper (QA, 2026-10-31: no terminal, no built-in model list)', () => {
  beforeEach(() => { pull.mockReset(); openLink.mockReset(); });

  it('downloads the typed model inside the app, shows progress, then refreshes the list', async () => {
    const onRefresh = vi.fn();
    pull.mockImplementation(async ({ onProgress }) => { onProgress({ status: 'pulling', percent: 40 }); return { ok: true, model: 'qwen2.5:7b' }; });
    render(<ModelPullHelper onRefresh={onRefresh} />);
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: ' qwen2.5:7b ' } });
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(pull).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' }));
    expect(screen.getByText(/Downloaded qwen2.5:7b/)).toBeTruthy();
  });

  it('says why a download failed', async () => {
    pull.mockRejectedValue(new Error('pull model manifest: file does not exist'));
    render(<ModelPullHelper onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'nope:1b' } });
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    expect(await screen.findByText(/Download failed: pull model manifest/)).toBeTruthy();
  });

  it('offers no built-in model names and no terminal command; the example is the starter model', () => {
    render(<ModelPullHelper onRefresh={vi.fn()} />);
    expect(screen.queryByText(/terminal/i)).toBeNull();
    expect(screen.queryByText(/ollama pull/)).toBeNull();
    expect(screen.queryByText('phi3.5')).toBeNull();
    expect((screen.getByLabelText('Model name') as HTMLInputElement).placeholder).toContain(PREFERRED_MODEL);
    expect((screen.getByRole('button', { name: /Download/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens Ollama\'s model library in the browser', () => {
    render(<ModelPullHelper onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ollama's model library/ }));
    expect(openLink).toHaveBeenCalledWith('https://ollama.com/library');
  });
});
