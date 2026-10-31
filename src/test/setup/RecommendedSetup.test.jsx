import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
  installPrerequisite: vi.fn(),
  // A location is already chosen unless a test says otherwise (owner,
  // 2026-10-22: Setup asks before installing a Runtime Hub tool).
  getInstallLocation: vi.fn(async () => ({ chosen: 'D:/Tools', effective: 'D:/Tools/Alphonso-runtimes', freeGb: null, suggested: 'D:/Alphonso' })),
  setInstallLocation: vi.fn(async (path) => ({ chosen: path, effective: `${path}/Alphonso-runtimes`, freeGb: null, suggested: 'D:/Alphonso' })),
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

import { getAllStatus, installPrerequisite, getInstallLocation, setInstallLocation } from '../../services/runtimeManagerService';
import { RecommendedSetup } from '../../components/setup/RecommendedSetup';

const hardware = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };
const allPrereqsOk = { missing: [], installHint: 'ok', pythonFound: true, dockerFound: true, gitFound: true };

beforeEach(() => vi.clearAllMocks());

describe('RecommendedSetup', () => {
  it('recommends the starter model plus ComfyUI for the chat-images intent', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/starter model/i)).toBeInTheDocument());
    expect(screen.getByText(/ComfyUI/i)).toBeInTheDocument();
  });

  it('shows a no-GPU warning next to the image-gen recommendation when hardware.gpuPresent is false', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('marks a component as already installed when getAllStatus reports it installed', async () => {
    getAllStatus.mockResolvedValue([{ name: 'comfyui', installed: true, running: false }]);
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
    // The install location loads a moment after the screen opens.
    await waitFor(() => expect(screen.getByText('Looks Good → Install')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).toHaveBeenCalled();
  });
});

describe('RecommendedSetup — install location', () => {
  // Owner, 2026-10-22: the user chooses where tools go; nothing is hardcoded.
  it('asks where to install before installing a tool, and the suggestion unblocks it', async () => {
    getAllStatus.mockResolvedValue([]);
    getInstallLocation.mockResolvedValueOnce({ chosen: null, effective: 'C:/AppData/Alphonso/runtimes', freeGb: 13, suggested: 'D:/Alphonso' });
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={allPrereqsOk} onProceed={onProceed} onCustomize={() => {}} />);
    expect(await screen.findByText('Where should tools be installed?')).toBeInTheDocument();
    expect(screen.getByText('Looks Good → Install')).toBeDisabled();
    fireEvent.click(screen.getByText('Use this folder'));
    await waitFor(() => expect(screen.getByText('Looks Good → Install')).not.toBeDisabled());
    expect(setInstallLocation).toHaveBeenCalledWith('D:/Alphonso');
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).toHaveBeenCalled();
  });

  it('does not ask when only the chat model is being installed', async () => {
    getAllStatus.mockResolvedValue([]);
    getInstallLocation.mockResolvedValueOnce({ chosen: null, effective: 'C:/x', freeGb: 13, suggested: 'D:/Alphonso' });
    render(<RecommendedSetup intent="chat-only" hardware={hardware} prereqs={allPrereqsOk} onProceed={vi.fn()} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText('Looks Good → Install')).toBeInTheDocument());
    expect(screen.queryByText('Where should tools be installed?')).toBeNull();
  });
});

describe('RecommendedSetup — prerequisite gating', () => {
  it('excludes ComfyUI from the queue and offers to install Python when Python is missing', async () => {
    // Regression target: comfyui/voice-os run via `exe: "python"` in
    // runtime_manager.rs's TOOLS — queuing them without Python present is
    // the same failure shape starter-model had with installTool.
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true, gitFound: true };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    await waitFor(() => expect(screen.getByText(/needs python/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'comfyui')).toBe(false);
    expect(queued.some((c) => c.id === 'starter-model')).toBe(true); // unaffected component still proceeds
  });

  it('excludes ChromaDB from the queue with a manual-install note when Docker is missing, with no install button', async () => {
    // Docker has no auto-install path anywhere in this codebase — offering a
    // button that cannot work would be worse than the missing-prereq note.
    getAllStatus.mockResolvedValue([]);
    const noDocker = { missing: ['Docker'], installHint: 'x', pythonFound: true, dockerFound: false, gitFound: true };
    render(<RecommendedSetup intent="full-power" hardware={hardware} prereqs={noDocker} onProceed={() => {}} onCustomize={() => {}} />);

    await waitFor(() => expect(screen.getByText(/needs docker/i)).toBeInTheDocument());
    expect(screen.queryByText(/install docker/i)).not.toBeInTheDocument();
  });

  it('calls installPrerequisite("python") when "Install Python" is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true, gitFound: true };
    installPrerequisite.mockResolvedValue({ tool: 'python', ok: true, message: 'installed' });
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={() => {}} onCustomize={() => {}} />);

    const installButton = await waitFor(() => screen.getByText('Install Python'));
    fireEvent.click(installButton);
    await waitFor(() => expect(installPrerequisite).toHaveBeenCalledWith('python'));
  });

  it('includes the previously-blocked component once Python install succeeds', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true, gitFound: true };
    installPrerequisite.mockResolvedValue({ tool: 'python', ok: true, message: 'installed' });
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByText('Install Python')));
    await waitFor(() => expect(screen.queryByText(/needs python/i)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Looks Good → Install')).not.toBeDisabled());

    fireEvent.click(screen.getByText('Looks Good → Install'));
    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'comfyui')).toBe(true);
  });

  it('asks for Git before installing ComfyUI, and Install Git installs it', async () => {
    getAllStatus.mockResolvedValue([]);
    const noGit = { missing: ['Git'], installHint: 'x', pythonFound: true, dockerFound: true, gitFound: false };
    installPrerequisite.mockResolvedValue({ tool: 'git', ok: true, message: 'installed' });
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={hardware} prereqs={noGit} onProceed={onProceed} onCustomize={() => {}} />);

    await waitFor(() => expect(screen.getByText(/needs git/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Install Git'));
    await waitFor(() => expect(installPrerequisite).toHaveBeenCalledWith('git'));
    await waitFor(() => expect(screen.queryByText(/needs git/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed.mock.calls[0][0].some((c) => c.id === 'comfyui')).toBe(true);
  });

  it('does not gate an intent with no Python/Docker-dependent components at all', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: false, gitFound: true };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} prereqs={noPython} onProceed={onProceed} onCustomize={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByText('Looks Good → Install')));
    expect(onProceed).toHaveBeenCalled();
    expect(screen.queryByText(/needs python/i)).not.toBeInTheDocument();
  });
});
