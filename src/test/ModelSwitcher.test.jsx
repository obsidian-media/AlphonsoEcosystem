import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const findWorkingNvidiaModel = vi.fn(async (candidates) => ({ model: candidates[0], notServed: [] }));
const nvidiaModelsNotServed = vi.fn(() => []);
vi.mock('../services/connectors/nvidiaNimConnector', () => ({
  isNvidiaConfigured: vi.fn(() => true),
  findWorkingNvidiaModel: (...args) => findWorkingNvidiaModel(...args),
  nvidiaModelsNotServed: (...args) => nvidiaModelsNotServed(...args),
}));

vi.mock('../services/connectors/geminiConnector', () => ({
  isGeminiConfigured: vi.fn(() => false)
}));

const findWorkingOpenRouterModel = vi.fn(async (candidates) => ({ model: candidates[0], skipped: [] }));
vi.mock('../services/connectors/openRouterConnector', () => ({
  OPENROUTER_CHOOSE_FREE: 'openrouter/free',
  openRouterFailure: (r) => (r.ok ? null : r),
  isOpenRouterConfigured: vi.fn(() => true),
  listOpenRouterModels: vi.fn(async () => [
    { id: 'openrouter/free', name: 'Free Models Router', contextLength: 200000, promptUsdPerToken: 0, completionUsdPerToken: 0, free: true, expiresAtMs: null },
    { id: 'a/x:free', name: 'A: X (free)', contextLength: 131072, promptUsdPerToken: 0, completionUsdPerToken: 0, free: true, expiresAtMs: null },
    { id: 'b/y', name: 'B: Y', contextLength: 32000, promptUsdPerToken: 1e-6, completionUsdPerToken: 2e-6, free: false, expiresAtMs: null },
  ]),
  getOpenRouterKeyInfo: vi.fn(async () => ({ freeUsed: 4, freeLimit: 50, freeRemaining: 46, isFreeTier: false })),
}));
vi.mock('../services/connectors/openRouterModels', async (orig) => ({
  ...(await orig()),
  findWorkingOpenRouterModel: (...args) => findWorkingOpenRouterModel(...args),
}));

vi.mock('../services/jose/joseSpend', () => ({
  paidModelAvailable: vi.fn(() => ({ ok: true })),
  paidModelId: vi.fn(() => 'claude:claude-sonnet-5'),
}));
vi.mock('../services/modelSelectionService', () => ({
  getCloudModelList: vi.fn(async (provider) => {
    if (provider === 'nvidia_nim') return ['meta/llama-3.1-8b-instruct', 'nvidia/nemotron-4-340b-instruct'];
    return ['gemini-1.5-flash'];
  })
}));

const { CloudModelPicker, ModelProviderPicker } = await import('../components/ModelSwitcher');

describe('CloudModelPicker', () => {
  it('lists models for the given provider', async () => {
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="" onModelChange={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('meta/llama-3.1-8b-instruct')).toBeInTheDocument();
    });
  });

  it('calls onModelChange when a model is selected', async () => {
    const onModelChange = vi.fn();
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="" onModelChange={onModelChange} />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'nvidia/nemotron-4-340b-instruct' } });
    expect(onModelChange).toHaveBeenCalledWith('nvidia/nemotron-4-340b-instruct');
  });
});

describe('CloudModelPicker with NVIDIA (no fixed model list)', () => {
  beforeEach(() => {
    findWorkingNvidiaModel.mockReset();
    nvidiaModelsNotServed.mockReset();
    nvidiaModelsNotServed.mockReturnValue([]);
  });

  it('tries the chosen model first, then the rest, and uses the one that answers', async () => {
    findWorkingNvidiaModel.mockResolvedValueOnce({ model: 'meta/llama-3.1-8b-instruct', notServed: ['nvidia/nemotron-4-340b-instruct'] });
    const onModelChange = vi.fn();
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="nvidia/nemotron-4-340b-instruct" onModelChange={onModelChange} />);
    await waitFor(() => expect(onModelChange).toHaveBeenCalledWith('meta/llama-3.1-8b-instruct'));
    expect(findWorkingNvidiaModel.mock.calls[0][0]).toEqual(['nvidia/nemotron-4-340b-instruct', 'meta/llama-3.1-8b-instruct']);
  });

  it('marks a model NVIDIA no longer serves and does not offer it', async () => {
    nvidiaModelsNotServed.mockReturnValue(['nvidia/nemotron-4-340b-instruct']);
    findWorkingNvidiaModel.mockResolvedValueOnce({ model: 'meta/llama-3.1-8b-instruct', notServed: [] });
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="" onModelChange={() => {}} />);
    const gone = await screen.findByText('nvidia/nemotron-4-340b-instruct (not served)');
    expect(gone).toBeDisabled();
  });

  it('says so when no NVIDIA model answers', async () => {
    findWorkingNvidiaModel.mockResolvedValueOnce({ model: null, notServed: [] });
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="" onModelChange={() => {}} />);
    expect(await screen.findByText(/No NVIDIA model answered/i)).toBeInTheDocument();
  });
});

describe('CloudModelPicker on NVIDIA', () => {
  // QA batch 1: until a model answered, the Ollama model's name stayed selected and Chat sent it to NVIDIA.
  it("drops a model that isn't NVIDIA's at once, before looking for one that answers", async () => {
    let finish;
    findWorkingNvidiaModel.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onModelChange = vi.fn();
    render(<CloudModelPicker provider="nvidia_nim" selectedModel="llama3.2:3b" onModelChange={onModelChange} />);
    await waitFor(() => expect(onModelChange).toHaveBeenCalledWith(''));
    finish({ model: 'meta/llama-3.1-8b-instruct', notServed: [] });
    await waitFor(() => expect(onModelChange).toHaveBeenLastCalledWith('meta/llama-3.1-8b-instruct'));
  });
});

describe('OpenRouter in the picker (2026-10-30)', () => {
  it('lists only free models, the router first, with the free requests left and the privacy line', async () => {
    const onModelChange = vi.fn();
    render(<CloudModelPicker provider="openrouter" selectedModel="" onModelChange={onModelChange} />);
    expect(await screen.findByText('46 free requests left today.')).toBeInTheDocument();
    expect(screen.getByText('Let OpenRouter choose a free model')).toBeInTheDocument();
    expect(screen.getByText('A: X (free) (128k)')).toBeInTheDocument();
    expect(screen.queryByText(/B: Y/)).toBeNull();
    expect(screen.getByText('Free models are run by other companies through OpenRouter; some may keep what you send.')).toBeInTheDocument();
    // Nothing chosen yet: the router is used.
    expect(onModelChange).toHaveBeenCalledWith('openrouter/free');
  });

  it('tests a free model when it is chosen', async () => {
    const onModelChange = vi.fn();
    render(<CloudModelPicker provider="openrouter" selectedModel="openrouter/free" onModelChange={onModelChange} />);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'a/x:free' } });
    await waitFor(() => expect(findWorkingOpenRouterModel).toHaveBeenCalledWith(['a/x:free', 'openrouter/free']));
    expect(onModelChange).toHaveBeenLastCalledWith('a/x:free');
  });

  it('has an OpenRouter tab', () => {
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
  });
});

describe('ModelProviderPicker', () => {
  // 2.11.0 QA (owner, 2026-11-01): an agent can use the paid model chosen in Settings → General (Allow paid models).
  it('offers a Paid tab only where it is asked for, showing the paid model and that it asks first', async () => {
    const { paidModelAvailable } = await import('../services/jose/joseSpend');
    const onProviderChange = vi.fn();
    const { rerender } = render(<ModelProviderPicker provider="ollama" onProviderChange={onProviderChange} selectedModel="" onModelChange={() => {}} ollamaPicker={<div />} agentId="alphonso" />);
    expect(screen.queryByText('Paid')).toBeNull();
    rerender(<ModelProviderPicker provider="paid" onProviderChange={onProviderChange} selectedModel="" onModelChange={() => {}} ollamaPicker={<div />} agentId="hector" allowPaid />);
    await waitFor(() => expect(screen.getByText('Paid').closest('button')).not.toBeDisabled());
    expect(screen.getByTestId('paid-model-line').textContent).toBe('Claude · claude-sonnet-5. Each request asks first, with the cost. Change it in Settings → General (Allow paid models).');
    vi.mocked(paidModelAvailable).mockReturnValue({ ok: false, reason: 'Zero-Cost Mode is on.' });
    rerender(<ModelProviderPicker provider="ollama" onProviderChange={onProviderChange} selectedModel="" onModelChange={() => {}} ollamaPicker={<div />} agentId="maria" allowPaid />);
    await waitFor(() => expect(screen.getByText('Paid').closest('button')).toBeDisabled());
    expect(screen.getByText('Paid').closest('button')).toHaveAttribute('title', 'Zero-Cost Mode is on. Paid models are set up in Settings → General (Allow paid models).');
  });

  it('renders a tab for each provider', () => {
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA NIM')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
  });

  it('disables the tab for an unconfigured cloud provider', () => {
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    expect(screen.getByText('Gemini').closest('button')).toBeDisabled();
  });

  it('leaves the configured cloud provider tab enabled', async () => {
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA NIM').closest('button')).not.toBeDisabled();
    });
  });

  it('switches to the CloudModelPicker when a configured provider tab is clicked', async () => {
    const onProviderChange = vi.fn();
    render(<ModelProviderPicker provider="ollama" onProviderChange={onProviderChange} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA NIM').closest('button')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText('NVIDIA NIM'));
    expect(onProviderChange).toHaveBeenCalledWith('nvidia_nim');
  });

  it('locks every provider tab while a reply is generating', async () => {
    const onProviderChange = vi.fn();
    render(<ModelProviderPicker provider="ollama" locked onProviderChange={onProviderChange} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA NIM').closest('button')).toBeDisabled();
    });
    expect(screen.getByText('Ollama').closest('button')).toBeDisabled();
    expect(screen.getByText('NVIDIA NIM').closest('button')).toHaveAttribute('title', 'Wait for the current reply to finish before switching provider');
    fireEvent.click(screen.getByText('NVIDIA NIM'));
    expect(onProviderChange).not.toHaveBeenCalled();
  });

  it('renders the ollama picker when provider is ollama', () => {
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    expect(screen.getByText('ollama-picker')).toBeInTheDocument();
  });

  it('renders CloudModelPicker when provider is nvidia_nim', async () => {
    render(<ModelProviderPicker provider="nvidia_nim" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);
    await waitFor(() => {
      expect(screen.getByText('meta/llama-3.1-8b-instruct')).toBeInTheDocument();
    });
  });

  it('re-checks configured status on window focus, so a credential added elsewhere is picked up without a remount', async () => {
    const { isGeminiConfigured } = await import('../services/connectors/geminiConnector');
    render(<ModelProviderPicker provider="ollama" onProviderChange={() => {}} selectedModel="" onModelChange={() => {}} ollamaPicker={<div>ollama-picker</div>} />);

    await waitFor(() => {
      expect(screen.getByText('Gemini').closest('button')).toBeDisabled();
    });

    isGeminiConfigured.mockReturnValueOnce(true);
    fireEvent(window, new Event('focus'));

    await waitFor(() => {
      expect(screen.getByText('Gemini').closest('button')).not.toBeDisabled();
    });
  });
});
