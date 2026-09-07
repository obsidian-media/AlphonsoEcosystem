import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  installTool: vi.fn(),
}));

import { installTool } from '../../services/runtimeManagerService';
import { InstallQueue } from '../../components/setup/InstallQueue';

const components = [
  { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
  { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
];

beforeEach(() => vi.clearAllMocks());

describe('InstallQueue', () => {
  it('starts all components as pending and installs them via installTool', async () => {
    installTool.mockResolvedValue({ tool: 'x', ok: true, message: 'done' });
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} />);
    await waitFor(() => expect(installTool).toHaveBeenCalledTimes(2));
  });

  it('calls onStarterReady as soon as the starter-model component succeeds, without waiting for the rest', async () => {
    let resolveFooocus;
    installTool.mockImplementation((name) => {
      if (name === 'starter-model') return Promise.resolve({ tool: name, ok: true, message: 'done' });
      return new Promise((resolve) => { resolveFooocus = resolve; });
    });
    const onStarterReady = vi.fn();
    render(<InstallQueue components={components} onStarterReady={onStarterReady} onAllComplete={() => {}} />);
    await waitFor(() => expect(onStarterReady).toHaveBeenCalled());
    resolveFooocus({ tool: 'fooocus', ok: true, message: 'done' });
  });

  it('calls onAllComplete once every component finishes', async () => {
    installTool.mockResolvedValue({ tool: 'x', ok: true, message: 'done' });
    const onAllComplete = vi.fn();
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={onAllComplete} />);
    await waitFor(() => expect(onAllComplete).toHaveBeenCalled());
  });

  it('shows an error status for a component whose install rejects, without blocking the others', async () => {
    installTool.mockImplementation((name) => {
      if (name === 'fooocus') return Promise.reject(new Error('network error'));
      return Promise.resolve({ tool: name, ok: true, message: 'done' });
    });
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} />);
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
  });
});
