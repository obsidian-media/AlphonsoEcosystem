import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
  installPrerequisite: vi.fn(),
}));
// Real withTimeout/checkDiskSpace preserved; isComponentAlreadyInstalled is
// stubbed to the Runtime-Hub-set behaviour so these tests stay focused on the
// recommendation screen. Its real model-vs-tool routing (which hits ollama's
// /api/tags for the starter model) is covered in installComponent.test.js.
vi.mock('../../services/setupFlowService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isComponentAlreadyInstalled: vi.fn(async (id, installedToolNames) => installedToolNames.has(id)),
  };
});

import { getAllStatus, installPrerequisite } from '../../services/runtimeManagerService';
import { RecommendedSetup } from '../../components/setup/RecommendedSetup';

const hardware = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };
const allPrereqsOk = { missing: [], installHint: 'ok', pythonFound: true, dockerFound: true };

beforeEach(() => vi.clearAllMocks());

describe('RecommendedSetup', () => {
  it('recommends the starter model plus Fooocus for the chat-images intent', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/starter model/i)).toBeInTheDocument());
    expect(screen.getByText(/Fooocus/i)).toBeInTheDocument();
  });

  it('shows a no-GPU warning next to the image-gen recommendation when hardware.gpuPresent is false', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('marks a component as already installed when getAllStatus reports it installed', async () => {
    getAllStatus.mockResolvedValue([{ name: 'fooocus', installed: true, running: false }]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/already installed/i)).toBeInTheDocument());
  });

  it('blocks proceeding and shows a shortfall message when free disk space is insufficient', async () => {
    getAllStatus.mockResolvedValue([]);
    const tightHardware = { ...hardware, diskFreeGb: 5 };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={tightHardware} prereqs={allPrereqsOk} onProceed={onProceed} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/need \d+ ?GB more/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('calls onProceed with the selected component list when there is enough space', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} prereqs={allPrereqsOk} onProceed={onProceed} onCustomize={() => {}} />);
    const button = await waitFor(() => screen.getByText('Looks Good → Install'));
    fireEvent.click(button);
    expect(onProceed).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'starter-model' })]));
  });

  it('calls onCustomize when Customize is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const onCustomize = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={onCustomize} />);
    fireEvent.click(await waitFor(() => screen.getByText('Customize')));
    expect(onCustomize).toHaveBeenCalled();
  });

  it('warns instead of silently assuming nothing is installed when the status lookup fails', async () => {
    // Regression: a transient getAllStatus() failure left installedNames
    // empty, which re-queued components the user already had — a wasted
    // multi-GB download presented as if it were required.
    getAllStatus.mockRejectedValue(new Error('status probe failed'));
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/couldn't check what's already installed/i)).toBeInTheDocument()
    );
  });

  it('allows installation to proceed when free disk space is unknown', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    const unknownDisk = { ...hardware, diskFreeGb: null };
    render(<RecommendedSetup intent="chat-images" hardware={unknownDisk} prereqs={allPrereqsOk} onProceed={onProceed} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/couldn't measure free disk space/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).toHaveBeenCalled();
  });
});

describe('RecommendedSetup — prerequisite gating', () => {
  it('excludes Fooocus from the queue and offers to install Python when Python is missing', async () => {
    // Regression target: fooocus/voice-os run via `exe: "python"` in
    // runtime_manager.rs's TOOLS — queuing them without Python present is
    // the same failure shape starter-model had with installTool.
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    await waitFor(() => expect(screen.getByText(/needs python/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'fooocus')).toBe(false);
    expect(queued.some((c) => c.id === 'starter-model')).toBe(true); // unaffected component still proceeds
  });

  it('excludes ChromaDB from the queue with a manual-install note when Docker is missing, with no install button', async () => {
    // Docker has no auto-install path anywhere in this codebase — offering a
    // button that cannot work would be worse than the missing-prereq note.
    getAllStatus.mockResolvedValue([]);
    const noDocker = { missing: ['Docker'], installHint: 'x', pythonFound: true, dockerFound: false };
    render(<RecommendedSetup intent="full-power" hardware={hardware} prereqs={noDocker} onProceed={() => {}} onCustomize={() => {}} />);

    await waitFor(() => expect(screen.getByText(/needs docker/i)).toBeInTheDocument());
    expect(screen.queryByText(/install docker/i)).not.toBeInTheDocument();
  });

  it('calls installPrerequisite("python") when "Install Python" is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true };
    installPrerequisite.mockResolvedValue({ tool: 'python', ok: true, message: 'installed' });
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={() => {}} onCustomize={() => {}} />);

    const installButton = await waitFor(() => screen.getByText('Install Python'));
    fireEvent.click(installButton);
    await waitFor(() => expect(installPrerequisite).toHaveBeenCalledWith('python'));
  });

  it('includes the previously-blocked component once Python install succeeds', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true };
    installPrerequisite.mockResolvedValue({ tool: 'python', ok: true, message: 'installed' });
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByText('Install Python')));
    await waitFor(() => expect(screen.queryByText(/needs python/i)).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Looks Good → Install'));
    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'fooocus')).toBe(true);
  });

  it('does not gate an intent with no Python/Docker-dependent components at all', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: false };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByText('Looks Good → Install')));
    expect(onProceed).toHaveBeenCalled();
    expect(screen.queryByText(/needs python/i)).not.toBeInTheDocument();
  });
});
