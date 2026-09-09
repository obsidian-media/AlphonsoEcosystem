import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../services/runtimeManagerService', () => ({
  getAllStatus: vi.fn(),
  installPrerequisite: vi.fn(),
}));
vi.mock('../../services/setupFlowService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isComponentAlreadyInstalled: vi.fn(async (id, installedToolNames) => installedToolNames.has(id)),
  };
});

import { getAllStatus } from '../../services/runtimeManagerService';
import { AgentGrid } from '../../components/setup/AgentGrid';

const hardware = { ramGb: 16, diskFreeGb: 220, gpuPresent: false, gpuVendor: null, gpuModel: null };
const allPrereqsOk = { missing: [], installHint: 'ok', pythonFound: true, dockerFound: true };

beforeEach(() => vi.clearAllMocks());

describe('AgentGrid', () => {
  it('renders all 9 real agents, not the 8-agent roster from the original draft', async () => {
    // The original draft included "Boardroom" (a feature, not an agent) and
    // omitted Sentinel and Nova — verified against src/agents/*/*.js's real
    // ids, not assumed.
    getAllStatus.mockResolvedValue([]);
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('Alphonso')).toBeInTheDocument());
    for (const name of ['Alphonso', 'Jose', 'Miya', 'Hector', 'Maria', 'Marcus', 'Echo', 'Sentinel', 'Nova']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.queryByText('Boardroom')).not.toBeInTheDocument();
  });

  it('always includes Alphonso (starter model) — its toggle is disabled, not optional', async () => {
    getAllStatus.mockResolvedValue([]);
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onBack={() => {}} />);
    const alphonsoToggle = await waitFor(() => screen.getByRole('checkbox', { name: /alphonso/i }));
    expect(alphonsoToggle).toBeChecked();
    expect(alphonsoToggle).toBeDisabled();
  });

  it('marks agents with no installable component as already included, with no toggle', async () => {
    // Jose/Hector/Echo/Sentinel/Nova are software-only per CLAUDE.md (local
    // Ollama-powered or cloud-only) — there is nothing to install for them.
    getAllStatus.mockResolvedValue([]);
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('Jose')).toBeInTheDocument());
    expect(screen.queryByRole('checkbox', { name: /jose/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/included/i).length).toBeGreaterThanOrEqual(5);
  });

  it('lets the user toggle Miya (Fooocus) on and includes it in the queued selection', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={onProceed} onBack={() => {}} />);

    const miyaToggle = await waitFor(() => screen.getByRole('checkbox', { name: /miya/i }));
    expect(miyaToggle).not.toBeChecked();
    fireEvent.click(miyaToggle);
    fireEvent.click(screen.getByText('Install Selected'));

    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'fooocus')).toBe(true);
  });

  it('lets the user toggle an agent component off, excluding it from the queue', async () => {
    getAllStatus.mockResolvedValue([]);
    const onProceed = vi.fn();
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={onProceed} onBack={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByRole('checkbox', { name: /marcus/i })));
    fireEvent.click(screen.getByRole('checkbox', { name: /marcus/i })); // on, then off
    fireEvent.click(screen.getByText('Install Selected'));

    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'voice-os')).toBe(false);
  });

  it('marks a toggled component as already installed rather than re-queuing it', async () => {
    getAllStatus.mockResolvedValue([{ name: 'fooocus', installed: true, running: false }]);
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText(/miya/i)).toBeInTheDocument());
    expect(screen.getByText(/already installed/i)).toBeInTheDocument();
  });

  it('excludes a toggled component from the queue when its prerequisite is unmet', async () => {
    getAllStatus.mockResolvedValue([]);
    const noPython = { missing: ['Python 3.10+'], installHint: 'x', pythonFound: false, dockerFound: true };
    const onProceed = vi.fn();
    render(<AgentGrid hardware={hardware} prereqs={noPython} onProceed={onProceed} onBack={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByRole('checkbox', { name: /miya/i })));
    await waitFor(() => expect(screen.getByText(/needs python/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Install Selected'));

    const queued = onProceed.mock.calls[0][0];
    expect(queued.some((c) => c.id === 'fooocus')).toBe(false);
    expect(queued.some((c) => c.id === 'starter-model')).toBe(true);
  });

  it('blocks proceeding when the toggled selection exceeds free disk space', async () => {
    getAllStatus.mockResolvedValue([]);
    const tightHardware = { ...hardware, diskFreeGb: 5 };
    const onProceed = vi.fn();
    render(<AgentGrid hardware={tightHardware} prereqs={allPrereqsOk} onProceed={onProceed} onBack={() => {}} />);

    fireEvent.click(await waitFor(() => screen.getByRole('checkbox', { name: /miya/i })));
    await waitFor(() => expect(screen.getByText(/need \d+ ?GB more/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Install Selected'));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('calls onBack when Back is clicked', async () => {
    getAllStatus.mockResolvedValue([]);
    const onBack = vi.fn();
    render(<AgentGrid hardware={hardware} prereqs={allPrereqsOk} onProceed={() => {}} onBack={onBack} />);
    fireEvent.click(await waitFor(() => screen.getByText('Back')));
    expect(onBack).toHaveBeenCalled();
  });
});
