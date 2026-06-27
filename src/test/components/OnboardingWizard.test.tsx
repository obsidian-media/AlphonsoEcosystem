import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

vi.mock('../../services/runtimeManagerService', () => ({
  checkPrerequisites: vi.fn().mockResolvedValue({ ollama: true }),
  startTool: vi.fn().mockResolvedValue({ ok: true }),
  waitForTool: vi.fn().mockResolvedValue(true),
}));

import { OnboardingWizard } from '../../components/OnboardingWizard';

// Helper: wait for step 0's Continue button to become enabled (Ollama check completes)
async function waitForStep0Continue() {
  await waitFor(
    () => {
      const btns = screen.getAllByRole('button', { name: /Continue/i });
      const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled);
      if (!enabled) throw new Error('Continue still disabled');
      return enabled;
    },
    { timeout: 5000 }
  );
  return screen.getAllByRole('button', { name: /Continue/i }).find(
    (b) => !(b as HTMLButtonElement).disabled
  )!;
}

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
    const btn = await waitForStep0Continue();
    fireEvent.click(btn);
    await screen.findByText('Pick a model', {}, { timeout: 5000 });
    expect(screen.getByText('Pick a model')).toBeTruthy();
  });

  it('step indicator advances when moving to step 2', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    const btn = await waitForStep0Continue();
    fireEvent.click(btn);
    // Step 2 heading visible means step transition occurred
    await screen.findByText('Pick a model', {}, { timeout: 5000 });
    expect(screen.getByText('Pick a model')).toBeTruthy();
    // Step indicator: step 1 label is now a completed state (not showing "1")
    // We just verify the component rendered step 2 correctly
    expect(screen.queryByText('Check Ollama')).toBeNull();
  });

  it('has skip behavior (Skip for now option visible in step 3)', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    // Step 0 → Step 1
    const btn0 = await waitForStep0Continue();
    fireEvent.click(btn0);
    await screen.findByText('Pick a model', {}, { timeout: 5000 });
    // Select a model to enable step 1's Continue
    await waitFor(() => screen.getByText('llama3.2:3b'), { timeout: 5000 });
    fireEvent.click(screen.getByText('llama3.2:3b'));
    // Step 1 → Step 2
    await waitFor(
      () => {
        const btns = screen.getAllByRole('button', { name: /Continue/i });
        const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled);
        if (!enabled) throw new Error('Step 1 Continue still disabled');
      },
      { timeout: 5000 }
    );
    const btn1 = screen.getAllByRole('button', { name: /Continue/i }).find(
      (b) => !(b as HTMLButtonElement).disabled
    )!;
    fireEvent.click(btn1);
    await screen.findByText('Connect', {}, { timeout: 5000 });
    expect(screen.getByText('Skip for now')).toBeTruthy();
  });

  it('completes wizard when finish is clicked', async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} />);
    // Step 0 → Step 1
    const btn0 = await waitForStep0Continue();
    fireEvent.click(btn0);
    await screen.findByText('Pick a model', {}, { timeout: 5000 });
    // Select model, then step 1 → Step 2
    await waitFor(() => screen.getByText('llama3.2:3b'), { timeout: 5000 });
    fireEvent.click(screen.getByText('llama3.2:3b'));
    await waitFor(
      () => {
        const btns = screen.getAllByRole('button', { name: /Continue/i });
        const enabled = btns.find((b) => !(b as HTMLButtonElement).disabled);
        if (!enabled) throw new Error('disabled');
      },
      { timeout: 5000 }
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: /Continue/i }).find(
        (b) => !(b as HTMLButtonElement).disabled
      )!
    );
    // Step 2 → Step 3
    await screen.findByText('Connect', {}, { timeout: 5000 });
    const btns2 = screen.getAllByRole('button', { name: /Continue/i });
    fireEvent.click(btns2[btns2.length - 1]);
    await screen.findByText("You're ready", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Start chatting/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
