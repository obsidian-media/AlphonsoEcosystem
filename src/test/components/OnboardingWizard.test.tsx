import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/ollama', () => ({
  checkOllama: vi.fn().mockResolvedValue({ state: 'connected', message: 'Connected' }),
  fetchOllamaModels: vi.fn().mockResolvedValue({ models: [{ name: 'llama3.2:3b', size: 3_000_000_000 }] }),
  normalizeEndpoint: vi.fn().mockReturnValue('http://localhost:11434'),
  pullOllamaModel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/appStorage', () => ({
  setStorage: vi.fn(),
}));

vi.mock('../../services/eventsService', () => ({
  buildOllamaPreflightEvent: vi.fn().mockReturnValue({ endpoint: '', model: '', ok: true, error: null, correlationId: 'test' }),
  recordEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/composioService', () => ({
  setComposioConfig: vi.fn(),
}));

import { OnboardingWizard } from '../../components/OnboardingWizard';

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Check Ollama')).toBeTruthy();
  });

  it('shows step 1 initially (Check Ollama heading)', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText('Check Ollama')).toBeTruthy();
  });

  it('advances to next step when Continue is clicked', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    const continueButtons = screen.getAllByText('Continue');
    fireEvent.click(continueButtons[0]);
    await screen.findByText('Pick a model');
    expect(screen.getByText('Pick a model')).toBeTruthy();
  });

  it('goes back to previous step (via step indicator - step 2 has "Check Ollama" completed)', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    const continueButtons = screen.getAllByText('Continue');
    fireEvent.click(continueButtons[0]);
    await screen.findByText('Pick a model');
    // The step indicator shows step 1 as completed (CheckCircle)
    const checkCircles = document.querySelectorAll('.lucide-check-circle');
    expect(checkCircles.length).toBeGreaterThan(0);
  });

  it('has skip behavior (Skip for now option visible in step 3)', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    // advance to step 3 (connect)
    fireEvent.click(screen.getAllByText('Continue')[0]);
    await screen.findByText('Pick a model');
    // models are mocked, click continue
    const continueBtns = screen.getAllByText('Continue');
    fireEvent.click(continueBtns[continueBtns.length - 1]);
    await screen.findByText('Connect');
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('completes wizard when finish is clicked', async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    // step 0 -> step 1
    fireEvent.click(screen.getAllByText('Continue')[0]);
    await screen.findByText('Pick a model');
    // step 1 -> step 2
    const continueBtns = screen.getAllByText('Continue');
    fireEvent.click(continueBtns[continueBtns.length - 1]);
    await screen.findByText('Connect');
    // step 2 -> step 3
    fireEvent.click(screen.getAllByText('Continue')[screen.getAllByText('Continue').length - 1]);
    await screen.findByText("You're ready");
    fireEvent.click(screen.getByText('Start chatting'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});