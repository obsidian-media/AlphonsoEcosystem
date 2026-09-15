import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../components/SetupFlow', () => ({
  SetupFlow: ({ onComplete }) => (
    <div data-testid="setup-flow">
      <button onClick={() => onComplete()}>finish setup</button>
    </div>
  ),
}));
import App from '../App';
import { ToastProvider } from '../components/ToastProvider';

beforeEach(() => {
  localStorage.clear();
});

function renderApp() {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}

describe('Setup gating', () => {
  it('renders SetupFlow, not OnboardingWizard, when setup is not yet complete', async () => {
    renderApp();
    expect(await screen.findByTestId('setup-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-wizard')).not.toBeInTheDocument();
  });

  it('renders the main app shell when setup is already marked complete', async () => {
    localStorage.setItem('alphonso_setup_complete_v1', JSON.stringify(true));
    renderApp();
    expect(screen.queryByTestId('setup-flow')).not.toBeInTheDocument();
    expect(document.querySelector('[data-alphonso-shell-ready="true"]')).toBeInTheDocument();
  });
});
