import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/connectors/nvidiaNimConnector', () => ({
  isNvidiaConfigured: vi.fn(() => true)
}));

vi.mock('../services/connectors/geminiConnector', () => ({
  isGeminiConfigured: vi.fn(() => false)
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

describe('ModelProviderPicker', () => {
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
