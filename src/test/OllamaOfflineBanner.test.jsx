import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

vi.mock('../services/runtimeManagerService', () => ({
  startTool: vi.fn(),
  waitForTool: vi.fn(),
}));

import { OllamaOfflineBanner } from '../components/OllamaOfflineBanner';
import { startTool, waitForTool } from '../services/runtimeManagerService';

const mockRetry = vi.fn();
const mockOpenRuntimes = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OllamaOfflineBanner', () => {
  it('renders nothing when Ollama is connected', () => {
    const { container } = render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'connected' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when ollamaStatus is null', () => {
    const { container } = render(
      <OllamaOfflineBanner ollamaStatus={null} onRetry={mockRetry} onOpenRuntimes={mockOpenRuntimes} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows offline message when not_running', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    expect(screen.getByText(/Ollama is offline/i)).toBeTruthy();
  });

  it('shows no-models message when no_models', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'no_models' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    expect(screen.getByText(/no models are installed/i)).toBeTruthy();
  });

  it('shows Start Ollama button only when not_running', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    expect(screen.getByText(/Start Ollama/i)).toBeTruthy();
  });

  it('does not show Start Ollama button when no_models', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'no_models' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    expect(screen.queryByText(/Start Ollama/i)).toBeNull();
  });

  it('calls onRetry when Retry is clicked', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    fireEvent.click(screen.getByText(/Retry/i));
    expect(mockRetry).toHaveBeenCalledOnce();
  });

  it('calls onOpenRuntimes when Runtime Hub is clicked', () => {
    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    fireEvent.click(screen.getByText(/Runtime Hub/i));
    expect(mockOpenRuntimes).toHaveBeenCalledOnce();
  });

  it('calls startTool(ollama) when Start Ollama is clicked', async () => {
    startTool.mockResolvedValue({ ok: true, message: 'started' });
    waitForTool.mockResolvedValue(true);

    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    fireEvent.click(screen.getByText(/Start Ollama/i));
    await waitFor(() => expect(startTool).toHaveBeenCalledWith('ollama'));
  });

  it('shows error message when startTool fails', async () => {
    startTool.mockResolvedValue({ ok: false, message: 'Ollama binary not found.' });

    render(
      <OllamaOfflineBanner
        ollamaStatus={{ state: 'not_running' }}
        onRetry={mockRetry}
        onOpenRuntimes={mockOpenRuntimes}
      />
    );
    fireEvent.click(screen.getByText(/Start Ollama/i));
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeTruthy());
  });
});
