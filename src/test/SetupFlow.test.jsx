import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Every child screen is mocked to a minimal stub exposing its callback props
// as buttons -- SetupFlow's own step-transition logic and 'failed' step
// rendering is what's under test here, not any child screen's own behavior
// (each has its own dedicated test file already).
vi.mock('../components/setup/BootRitualIntro', () => ({
  BootRitualIntro: ({ onFinish }) => <button onClick={onFinish}>boot-finish</button>,
}));
vi.mock('../components/setup/SystemScan', () => ({
  SystemScan: ({ onContinue }) => (
    <button onClick={() => onContinue(
      { ramGb: 16, diskFreeGb: 100, ollamaModelsDirFreeGb: null, gpuPresent: false, gpuVendor: null, gpuModel: null },
      { missing: [], installHint: 'ok', pythonFound: true, dockerFound: true }
    )}>
      scan-continue
    </button>
  ),
}));
vi.mock('../components/setup/IntentSelection', () => ({
  IntentSelection: ({ onSelect }) => <button onClick={() => onSelect('chat-only')}>select-chat-only</button>,
}));
vi.mock('../components/setup/RecommendedSetup', () => ({
  RecommendedSetup: ({ onProceed }) => (
    <button onClick={() => onProceed([{ id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 }])}>
      recommend-proceed
    </button>
  ),
}));
vi.mock('../components/setup/AgentGrid', () => ({
  AgentGrid: () => <div>agent-grid</div>,
}));
vi.mock('../components/setup/InstallQueue', async (importOriginal) => ({
  ...(await importOriginal()),
  InstallQueue: ({ onFailed }) => (
    <>
      <button onClick={() => onFailed([{ id: 'starter-model', label: 'Ollama + starter model' }])}>
        fail-starter-model
      </button>
      <button onClick={() => onFailed([{ id: 'fooocus', label: 'Fooocus (image generation)' }])}>
        fail-fooocus
      </button>
    </>
  ),
}));
vi.mock('../components/setup/ActivationSequence', () => ({
  ActivationSequence: () => <div>activation</div>,
}));
vi.mock('../services/setupFlowService', async (importOriginal) => ({
  ...(await importOriginal()),
  markSetupComplete: vi.fn(),
}));

import { SetupFlow } from '../components/SetupFlow';
import { markSetupComplete } from '../services/setupFlowService';

function driveToFailedStep() {
  fireEvent.click(screen.getByText('boot-finish'));
  fireEvent.click(screen.getByText('scan-continue'));
  fireEvent.click(screen.getByText('select-chat-only'));
  fireEvent.click(screen.getByText('recommend-proceed'));
}

describe('SetupFlow — boot step', () => {
  it('starts on the boot ritual intro, before System Scan', () => {
    render(<SetupFlow onComplete={() => {}} />);
    expect(screen.getByText('boot-finish')).toBeInTheDocument();
    expect(screen.queryByText('scan-continue')).not.toBeInTheDocument();
  });

  it('advances to System Scan once the boot intro finishes', () => {
    render(<SetupFlow onComplete={() => {}} />);
    fireEvent.click(screen.getByText('boot-finish'));
    expect(screen.getByText('scan-continue')).toBeInTheDocument();
    expect(screen.queryByText('boot-finish')).not.toBeInTheDocument();
  });
});

describe('SetupFlow — failed step', () => {
  it('does not offer Continue Anyway when the starter model itself failed', () => {
    // Regression (CodeRabbit finding, PR #233): Continue Anyway called
    // finishSetup() unconditionally, regardless of which component failed.
    // Persisting setup-complete with no working starter model traps the
    // user in a broken chat with no automatic way back into Setup to fix
    // it -- the button must not exist at all in this specific case, not
    // just be discouraged.
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);
    driveToFailedStep();
    fireEvent.click(screen.getByText('fail-starter-model'));

    expect(screen.queryByText('Continue Anyway')).not.toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(markSetupComplete).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('still offers Continue Anyway, working correctly, when a non-starter component failed', () => {
    // The starter model succeeded -- chat works. An optional extra failing
    // (Fooocus here) is exactly the case Continue Anyway exists for.
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);
    driveToFailedStep();
    fireEvent.click(screen.getByText('fail-fooocus'));

    const continueAnyway = screen.getByText('Continue Anyway');
    fireEvent.click(continueAnyway);
    expect(markSetupComplete).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows starter-model-specific messaging when the starter model failed', () => {
    render(<SetupFlow onComplete={() => {}} />);
    driveToFailedStep();
    fireEvent.click(screen.getByText('fail-starter-model'));

    expect(screen.getByText(/required for chat/i)).toBeInTheDocument();
  });

  it('Retry still works for a failed starter model, routing back to the install queue', () => {
    render(<SetupFlow onComplete={() => {}} />);
    driveToFailedStep();
    fireEvent.click(screen.getByText('fail-starter-model'));

    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('fail-starter-model')).toBeInTheDocument(); // back on the (mocked) queue screen
  });
});
