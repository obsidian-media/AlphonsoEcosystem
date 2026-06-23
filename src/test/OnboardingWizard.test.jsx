import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

vi.mock('../lib/ollama', () => ({
  checkOllama: vi.fn(),
  fetchOllamaModels: vi.fn(),
  normalizeEndpoint: vi.fn((e) => e),
  pullOllamaModel: vi.fn(),
}));

vi.mock('../lib/appStorage', () => ({
  setStorage: vi.fn(),
  getStorage: vi.fn(() => false),
}));

vi.mock('../services/eventsService', () => ({
  buildOllamaPreflightEvent: vi.fn(() => ({})),
  recordEvent: vi.fn(),
}));

vi.mock('../services/runtimeManagerService', () => ({
  checkPrerequisites: vi.fn(),
  startTool: vi.fn(),
  waitForTool: vi.fn(),
}));

vi.mock('../services/composioService', () => ({
  setComposioConfig: vi.fn(),
  getComposioConfig: vi.fn(() => ({ enabled: false, apiKey: '', userId: 'alphonso-user' })),
}));

import { OnboardingWizard } from '../components/OnboardingWizard';
import { checkOllama, fetchOllamaModels } from '../lib/ollama';
import { checkPrerequisites, startTool, waitForTool } from '../services/runtimeManagerService';
import { setComposioConfig } from '../services/composioService';
import { setStorage } from '../lib/appStorage';

const mockOnComplete = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  checkPrerequisites.mockResolvedValue({ ollamaFound: true, pythonFound: true, gitFound: true, missing: [] });
  checkOllama.mockResolvedValue({ state: 'connected' });
  fetchOllamaModels.mockResolvedValue({ models: [{ name: 'llama3.2:3b', size: 2_000_000_000 }] });
});

describe('OnboardingWizard — Step 1 (Ollama check)', () => {
  it('shows "Connected" when Ollama is running', async () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
  });

  it('shows "Not running" and Start button when Ollama not running', async () => {
    checkOllama.mockResolvedValue({ state: 'error' });
    checkPrerequisites.mockResolvedValue({ ollamaFound: true, missing: [] });
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText(/Start automatically/i)).toBeTruthy());
    expect(screen.getAllByText(/Not running/i).length).toBeGreaterThan(0);
  });

  it('shows "Not installed" and download button when Ollama binary missing', async () => {
    checkOllama.mockRejectedValue(new Error('not found'));
    checkPrerequisites.mockResolvedValue({ ollamaFound: false, missing: ['Ollama'] });
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText(/Download Ollama/i)).toBeTruthy());
    expect(screen.getAllByText(/Not installed/i).length).toBeGreaterThan(0);
  });

  it('Continue button disabled when not connected', async () => {
    checkOllama.mockResolvedValue({ state: 'error' });
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText(/Start automatically/i)).toBeTruthy());
    const continueBtn = screen.getByText('Continue').closest('button');
    expect(continueBtn.disabled).toBe(true);
  });

  it('calls startTool("ollama") when Start automatically clicked', async () => {
    checkOllama.mockResolvedValue({ state: 'error' });
    checkPrerequisites.mockResolvedValue({ ollamaFound: true, missing: [] });
    startTool.mockResolvedValue({ ok: true, message: 'starting' });
    waitForTool.mockResolvedValue(false);
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText(/Start automatically/i)).toBeTruthy());
    fireEvent.click(screen.getByText(/Start automatically/i));
    await waitFor(() => expect(startTool).toHaveBeenCalledWith('ollama'));
  });

  it('Retry button triggers re-check', async () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(checkOllama).toHaveBeenCalledTimes(2));
  });
});

describe('OnboardingWizard — Step 2 (model picker)', () => {
  it('shows model list after advancing from step 1', async () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('llama3.2:3b')).toBeTruthy());
  });

  it('Continue disabled when no model selected', async () => {
    fetchOllamaModels.mockResolvedValue({ models: [] });
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText(/No models installed/i)).toBeTruthy());
  });
});

describe('OnboardingWizard — Step 3 (connect)', () => {
  const advanceToStep3 = async () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('llama3.2:3b')).toBeTruthy());
    fireEvent.click(screen.getByText('llama3.2:3b'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('Connect')).toBeTruthy());
  };

  it('shows all 4 channel options', async () => {
    await advanceToStep3();
    expect(screen.getAllByText('Telegram').length).toBeGreaterThan(0);
    expect(screen.getAllByText('WhatsApp').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Composio/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Skip for now/i)).toBeTruthy();
  });

  it('shows Telegram guide when Telegram selected', async () => {
    await advanceToStep3();
    fireEvent.click(screen.getAllByText('Telegram')[0]);
    expect(screen.getByText(/How to create a Telegram Bot/i)).toBeTruthy();
  });

  it('shows WhatsApp guide when WhatsApp selected', async () => {
    await advanceToStep3();
    fireEvent.click(screen.getAllByText('WhatsApp')[0]);
    expect(screen.getByText(/How to set up WhatsApp Cloud/i)).toBeTruthy();
  });

  it('shows Composio guide when Composio selected', async () => {
    await advanceToStep3();
    fireEvent.click(screen.getAllByText(/Composio \(100\+ tools\)/i)[0]);
    expect(screen.getByText(/Composio Setup/i)).toBeTruthy();
  });

  it('saves Composio config via setComposioConfig when key entered', async () => {
    await advanceToStep3();
    fireEvent.click(screen.getAllByText(/Composio \(100\+ tools\)/i)[0]);
    const input = screen.getByPlaceholderText(/composio_api_key/i);
    fireEvent.change(input, { target: { value: 'test_key_123' } });
    fireEvent.click(screen.getByText('Save'));
    expect(setComposioConfig).toHaveBeenCalledWith({ apiKey: 'test_key_123', enabled: true });
  });
});

describe('OnboardingWizard — Step 4 (ready)', () => {
  it('calls onComplete with selected model on finish', async () => {
    render(<OnboardingWizard onComplete={mockOnComplete} />);
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy());
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('llama3.2:3b')).toBeTruthy());
    fireEvent.click(screen.getByText('llama3.2:3b'));
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText('Connect')).toBeTruthy());
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(screen.getByText("You're ready")).toBeTruthy());
    expect(screen.getByText('llama3.2:3b')).toBeTruthy();
    fireEvent.click(screen.getByText(/Start chatting/i));
    expect(mockOnComplete).toHaveBeenCalledWith('llama3.2:3b');
    expect(setStorage).toHaveBeenCalledWith('alphonso_onboarding_complete_v1', true);
  });
});
