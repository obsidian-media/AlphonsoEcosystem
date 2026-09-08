import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock installComponent (the model-vs-tool router) rather than installTool —
// the queue no longer calls installTool directly. installComponent's own
// routing logic is covered separately in installComponent.test.js.
vi.mock('../../services/setupFlowService', async (importOriginal) => ({
  ...(await importOriginal()),
  installComponent: vi.fn(),
}));

import { installComponent } from '../../services/setupFlowService';
import { InstallQueue } from '../../components/setup/InstallQueue';

const components = [
  { id: 'starter-model', label: 'Ollama + starter model', sizeGb: 2 },
  { id: 'fooocus', label: 'Fooocus (image generation)', sizeGb: 15 },
];

beforeEach(() => vi.clearAllMocks());

describe('InstallQueue', () => {
  it('starts every install in parallel, before any of them resolve', async () => {
    // Deferred promises: with mockResolvedValue, a serial implementation
    // could still satisfy a plain call-count assertion, so hold both open
    // and prove both calls happened while neither had settled.
    const resolvers = [];
    installComponent.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));

    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} onFailed={() => {}} />);

    await waitFor(() => expect(installComponent).toHaveBeenCalledTimes(2));
    expect(resolvers).toHaveLength(2); // both in flight simultaneously
    resolvers.forEach((r) => r({ tool: 'x', ok: true, message: 'done' }));
  });

  it('calls onStarterReady as soon as the starter-model component succeeds, without waiting for the rest', async () => {
    let resolveFooocus;
    installComponent.mockImplementation((name) => {
      if (name === 'starter-model') return Promise.resolve({ tool: name, ok: true, message: 'done' });
      return new Promise((resolve) => { resolveFooocus = resolve; });
    });
    const onStarterReady = vi.fn();
    render(<InstallQueue components={components} onStarterReady={onStarterReady} onAllComplete={() => {}} onFailed={() => {}} />);
    await waitFor(() => expect(onStarterReady).toHaveBeenCalled());
    resolveFooocus({ tool: 'fooocus', ok: true, message: 'done' });
  });

  it('calls onAllComplete exactly once when every component succeeds', async () => {
    installComponent.mockResolvedValue({ tool: 'x', ok: true, message: 'done' });
    const onAllComplete = vi.fn();
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={onAllComplete} onFailed={() => {}} />);
    await waitFor(() => expect(onAllComplete).toHaveBeenCalledTimes(1));
  });

  it('shows an error status for a component whose install rejects, without blocking the others', async () => {
    installComponent.mockImplementation((name) => {
      if (name === 'fooocus') return Promise.reject(new Error('network error'));
      return Promise.resolve({ tool: name, ok: true, message: 'done' });
    });
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={() => {}} onFailed={() => {}} />);
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
  });

  it('calls onFailed, NOT onAllComplete, when any component fails', async () => {
    // Treating a failed queue as completion would play "Alphonso is online."
    // and persist the setup-complete flag, permanently hiding the flow that
    // would let the user retry.
    installComponent.mockImplementation((name) => {
      if (name === 'fooocus') return Promise.reject(new Error('network error'));
      return Promise.resolve({ tool: name, ok: true, message: 'done' });
    });
    const onAllComplete = vi.fn();
    const onFailed = vi.fn();
    render(<InstallQueue components={components} onStarterReady={() => {}} onAllComplete={onAllComplete} onFailed={onFailed} />);
    await waitFor(() => expect(onFailed).toHaveBeenCalledTimes(1));
    expect(onFailed).toHaveBeenCalledWith(['Fooocus (image generation)']);
    expect(onAllComplete).not.toHaveBeenCalled();
  });
});
