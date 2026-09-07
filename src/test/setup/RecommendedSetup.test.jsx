import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
}));
// Real withTimeout preserved — RecommendedSetup wraps getAllStatus in it.
vi.mock('../../services/setupFlowService', async (importOriginal) => ({
  ...(await importOriginal()),
}));

import { getAllStatus } from '../../services/runtimeManagerService';
import { RecommendedSetup } from '../../components/setup/RecommendedSetup';

const hardware = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };

beforeEach(() => vi.clearAllMocks());

describe('RecommendedSetup', () => {
  it('recommends the starter model plus Fooocus for the chat-images intent', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/starter model/i)).toBeInTheDocument());
    expect(screen.getByText(/Fooocus/i)).toBeInTheDocument();
  });

  it('shows a no-GPU warning next to the image-gen recommendation when hardware.gpuPresent is false', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/no gpu detected/i)).toBeInTheDocument());
  });

  it('marks a component as already installed when getAllStatus reports it installed', async () => {
    getAllStatus.mockResolvedValue([{ name: 'fooocus', installed: true, running: false }]);
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/already installed/i)).toBeInTheDocument());
  });

  it('blocks proceeding and shows a shortfall message when free disk space is insufficient', async () => {
    getAllStatus.mockResolvedValue([]);
    const tightHardware = { ...hardware, diskFreeGb: 5 };
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-images" hardware={tightHardware} onProceed={onProceed} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/need \d+ ?GB more/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('calls onProceed with the selected component list when there is enough space', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} onProceed={onProceed} onCustomize={() => {}} />);
    const button = await waitFor(() => screen.getByText('Looks Good → Install'));
    fireEvent.click(button);
    expect(onProceed).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'starter-model' })]));
  });

  it('calls onCustomize when Customize is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const onCustomize = vi.fn();
    render(<RecommendedSetup intent="chat-only" hardware={hardware} onProceed={() => {}} onCustomize={onCustomize} />);
    fireEvent.click(await waitFor(() => screen.getByText('Customize')));
    expect(onCustomize).toHaveBeenCalled();
  });

  it('warns instead of silently assuming nothing is installed when the status lookup fails', async () => {
    // Regression: a transient getAllStatus() failure left installedNames
    // empty, which re-queued components the user already had — a wasted
    // multi-GB download presented as if it were required.
    getAllStatus.mockRejectedValue(new Error('status probe failed'));
    render(<RecommendedSetup intent="chat-images" hardware={hardware} onProceed={() => {}} onCustomize={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/couldn't check what's already installed/i)).toBeInTheDocument()
    );
  });

  it('allows installation to proceed when free disk space is unknown', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    const unknownDisk = { ...hardware, diskFreeGb: null };
    render(<RecommendedSetup intent="chat-images" hardware={unknownDisk} onProceed={onProceed} onCustomize={() => {}} />);
    await waitFor(() => expect(screen.getByText(/couldn't measure free disk space/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Looks Good → Install'));
    expect(onProceed).toHaveBeenCalled();
  });
});
