import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/agentBusService', () => ({
  AGENTS: { ALPHONSO: 'alphonso', JOSE: 'jose' },
  approvePacket: vi.fn(),
  canExecutePacket: vi.fn(() => false),
  createAgentPacket: vi.fn(),
  listAgentPackets: vi.fn(() => (globalThis as any).__orchPackets || []),
  listApprovalQueue: vi.fn(() => []),
  rejectPacket: vi.fn(),
  updatePacketStatus: vi.fn()
}));
vi.mock('../../services/memoryService', () => ({ listMemoryItems: vi.fn(() => []) }));
vi.mock('../../services/miyaMemoryService', () => ({ listMiyaMemory: vi.fn(() => []) }));
vi.mock('../../services/workflowBuilderService', () => ({ listWorkflows: vi.fn(() => []) }));
vi.mock('../../services/sessionIntelligenceService', () => ({
  appendSessionEvent: vi.fn(),
  listSessionEvents: vi.fn(() => [])
}));
vi.mock('../../services/resourceCostService', () => ({
  summarizeResourceUsage: vi.fn(() => ({ totalTokens: 0, totalCost: 0 }))
}));
vi.mock('../../services/orchestrationGovernanceService', () => ({
  listGovernanceDecisions: vi.fn(() => []),
  recordGovernanceDecision: vi.fn(),
  summarizeAgentWorkload: vi.fn(() => [])
}));
vi.mock('../../services/joseCommandRouterService', () => ({
  confirmJoseCommand: vi.fn(),
  createAgentReportToJose: vi.fn(),
  createJoseCommandRoute: vi.fn(),
  getJoseWorkflowObservability: vi.fn(() => null),
  listJoseCommands: vi.fn(() => []),
  listJoseDeadLetters: vi.fn(() => []),
  runJoseRetrySweep: vi.fn()
}));
vi.mock('../../services/packetExecutionService', () => ({
  executeApprovedPacket: vi.fn()
}));
vi.mock('../../services/trustModel', () => ({
  TRUST_STATES: { VERIFIED: 'verified', UNVERIFIED: 'unverified', TEMPORARY: 'temporary' }
}));
vi.mock('../../services/connectorRegistryService', () => ({
  isConnectorAuthenticated: vi.fn(() => ({ ok: false })),
  getConnectorCredential: vi.fn(() => ''),
  listConnectorAudit: vi.fn(() => []),
  pollWhatsAppConnector: vi.fn()
}));
vi.mock('../../services/orchestrationQueueService', () => ({
  getOrchestrationQueueSnapshot: vi.fn(() => ({ queued: 0, active: 0, deadLetters: 0 })),
  listOrchestrationQueueTransitions: vi.fn(() => []),
  replayPacketFromDeadLetter: vi.fn()
}));
vi.mock('../AgentAvatar', () => ({ AgentAvatar: vi.fn(() => null) }));
vi.mock('../JoseTaskQueue', () => ({ JoseTaskQueue: vi.fn(() => null) }));
vi.mock('../WhatsAppInboxPanel', () => ({ WhatsAppInboxPanel: vi.fn(() => null) }));
vi.mock('../OrchestratorQueueView', () => ({ OrchestratorQueueView: vi.fn(() => null) }));
vi.mock('../../components/jose/JoseRequestsBoard', () => ({
  JoseRequestsBoard: vi.fn(({ selectedRequestId }: { selectedRequestId?: string }) => <div>Jose requests board {selectedRequestId}</div>),
}));
// Phase 4: an approved step of a saved Jose request carries the request on.
vi.mock('../../services/jose/joseRequestStore', () => ({
  findRequestByPacket: vi.fn((id: string) => (id === 'p-request' ? { id: 'r1', status: 'waiting_approval' } : null)),
  listJoseRequests: vi.fn(() => (globalThis as any).__orchRequests || []),
}));
// Phase 6a: the Command tab goes through Jose's one entry.
vi.mock('../../services/jose/joseInbound', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../services/jose/joseInbound')>()), answerOrPlan: vi.fn() }));
vi.mock('../../services/joseExecutionEngineService', () => ({
  executeApprovedPackets: vi.fn(async () => ({ ok: true, summary: 'Marcus completed 1 approved task successfully.', results: [] })),
}));

vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span', section: 'section', p: 'p', li: 'li', button: 'button' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import { OrchestratorView } from '../../components/OrchestratorView';
import { executeApprovedPackets } from '../../services/joseExecutionEngineService';
import { executeApprovedPacket } from '../../services/packetExecutionService';
import { answerOrPlan } from '../../services/jose/joseInbound';

function makeProps(overrides = {}) {
  return {
    settings: {},
    ollamaStatus: { state: 'disconnected', label: 'Disconnected', trust: 'unverified' },
    onJoseStateChange: vi.fn(),
    ...overrides
  };
}

describe('OrchestratorView', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<OrchestratorView {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('renders with connected ollama', () => {
    const { container } = render(
      <OrchestratorView {...makeProps()} ollamaStatus={{ state: 'connected', label: 'Connected', trust: 'verified' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with empty orchestration state', () => {
    const { container } = render(<OrchestratorView {...makeProps()} />);
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0);
  });

  it('reports WhatsApp as not configured when authentication is unavailable', () => {
    render(<OrchestratorView {...makeProps()} />);
    expect(screen.getByTestId('whatsapp-inbound-status').textContent).toMatch(/^Not configured — add the access token and gateway drain URL/);
  });

  it('opens on the Requests tab with the request Chat asked for', () => {
    render(<OrchestratorView settings={{} as never} ollamaStatus={{ state: 'connected', label: 'Connected' } as never} initialTab="requests" selectedRequestId="r1" />);
    expect(screen.getByText('Jose requests board r1')).toBeTruthy();
  });

  it("runs an approved step of a Jose request through the request, other packets as before", async () => {
    (globalThis as any).__orchPackets = [
      { id: 'p-request', title: 'Post the launch', status: 'approved', fromAgent: 'jose', toAgent: 'marcus', packetType: 'agent_assignment' },
    ];
    render(<OrchestratorView {...makeProps()} initialTab="packets" />);
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => expect(executeApprovedPackets).toHaveBeenCalledWith(['p-request']));
    expect(executeApprovedPacket).not.toHaveBeenCalled();
    (globalThis as any).__orchPackets = undefined;
  });

  it('Send to Jose shows a direct answer', async () => {
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'answer', text: 'Paris.' });
    render(<OrchestratorView {...makeProps({ settings: { zeroCostMode: true } })} />);
    fireEvent.click(screen.getByRole('button', { name: /send to jose/i }));
    expect((await screen.findByTestId('orch-command-answer')).textContent).toBe('Paris.');
    expect(answerOrPlan).toHaveBeenCalledWith(expect.any(String), { source: 'user', zeroCostMode: true, background: true });
  });

  it('Send to Jose opens the Requests tab on the new request', async () => {
    (globalThis as any).__orchRequests = [{ id: 'r-old' }];
    vi.mocked(answerOrPlan).mockImplementationOnce(async () => {
      (globalThis as any).__orchRequests = [{ id: 'r-new' }, { id: 'r-old' }];
      return { kind: 'started', done: new Promise(() => {}) };
    });
    render(<OrchestratorView {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /send to jose/i }));
    expect(await screen.findByText('Jose requests board r-new', {}, { timeout: 3000 })).toBeTruthy();
    (globalThis as any).__orchRequests = undefined;
  });

  it('Send to Jose stops waiting and says why when no request was saved', async () => {
    (globalThis as any).__orchRequests = [];
    vi.mocked(answerOrPlan).mockResolvedValueOnce({ kind: 'started', done: Promise.resolve({ ok: false, reason: 'plan_rejected', problems: ['Only Alphonso may run commands.'] }) });
    render(<OrchestratorView {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /send to jose/i }));
    expect((await screen.findByTestId('orch-command-answer', {}, { timeout: 3000 })).textContent).toBe("Jose couldn't run it: Only Alphonso may run commands.");
    await waitFor(() => expect((screen.getByRole('button', { name: /send to jose/i }) as HTMLButtonElement).disabled).toBe(false));
    (globalThis as any).__orchRequests = undefined;
  });
});
