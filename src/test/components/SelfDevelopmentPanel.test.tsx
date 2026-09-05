import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/selfDevelopmentService', () => ({
  getCurrentSelfDevelopmentPacketBundle: vi.fn(() => null),
  listSelfDevelopmentCycles: vi.fn(() => []),
  runSelfDevelopmentCycle: vi.fn(async () => ({
    root: '/test',
    validation: { ok: true },
    auditSummary: { filesScanned: 10, blockerCount: 0, partialCount: 0, needsSetupCount: 0, issueCount: 0, todoCount: 0 },
    readinessSummary: { partialCount: 0, needsSetupCount: 0 },
    packets: [],
    generatedAtMs: Date.now()
  }))
}));
vi.mock('../../services/nativeRc0ProofService', () => ({
  formatNativeProofDetail: vi.fn(() => 'No native proof recorded'),
  formatNativeRc0ProofResult: vi.fn(() => ({
    runtime: 'native_tauri', proofAuthority: 'rust_engine', proofMode: 'automated',
    autorun: false, state: 'confirmed', workspaceRoot: '/test', workspaceRootValid: true,
    filesScanned: 100, p0Count: 0, p1Count: 0, p2Count: 0, topPackets: [],
    exportPath: '/export', proofReceiptsWritten: true,
    rc0Proof: { proofPath: '', readmePath: '', artifacts: [], sentinels: [] },
    timestampMs: Date.now(), note: 'test', error: null
  })),
  PROOF_AUTHORITY: { RUST_ENGINE: 'rust_engine', JS_BRIDGE: 'js_bridge' },
  runNativeRc0Proof: vi.fn(async () => ({ ok: true }))
}));
vi.mock('../../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => '/default/root'),
  validateWorkspaceRoot: vi.fn(async () => ({ valid: true }))
}));
vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import { SelfDevelopmentPanel } from '../../components/SelfDevelopmentPanel';
import { getCurrentSelfDevelopmentPacketBundle, listSelfDevelopmentCycles } from '../../services/selfDevelopmentService';

function makeProps(overrides = {}) {
  return {
    settings: { workspaceRoot: '/test/workspace' },
    setSettings: vi.fn(),
    updateCheckState: vi.fn(),
    verificationLogs: [],
    workspaceFoundation: {},
    nativeSelfDevProof: null,
    setNativeSelfDevProof: vi.fn(),
    nativeProofHooks: null,
    ...overrides
  };
}

describe('SelfDevelopmentPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<SelfDevelopmentPanel {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('shows self-development heading', () => {
    render(<SelfDevelopmentPanel {...makeProps()} />);
    expect(screen.getByText(/Self-Development Mode/i)).toBeTruthy();
  });

  it('renders with bundle data', () => {
    (getCurrentSelfDevelopmentPacketBundle as any).mockReturnValueOnce({
      id: 'b1', root: '/test', generatedAtMs: Date.now(),
      packets: [{ id: 'p1', title: 'Fix bug', priority: 'P0', riskLevel: 'high', currentIssue: 'Test fails' }],
      packetSummary: { count: 1, p0: 1, p1: 0, p2: 0 },
      auditSummary: { blockerCount: 1, partialCount: 0, needsSetupCount: 0, issueCount: 1, filesScanned: 10, todoCount: 0 },
      overallState: 'blocked'
    });
    render(<SelfDevelopmentPanel {...makeProps()} />);
    expect(screen.getByText(/Self-Development Mode/i)).toBeTruthy();
  });

  it('renders with cycles history', () => {
    (listSelfDevelopmentCycles as any).mockReturnValueOnce([{
      id: 'c1', root: '/test', generatedAtMs: Date.now() - 3600000, packets: [],
      packetSummary: { count: 0, p0: 0, p1: 0, p2: 0 },
      auditSummary: { blockerCount: 0, partialCount: 0, needsSetupCount: 0, issueCount: 0, filesScanned: 5, todoCount: 0 },
      overallState: 'verified'
    }]);
    render(<SelfDevelopmentPanel {...makeProps()} />);
    expect(screen.getByText(/Self-Development Mode/i)).toBeTruthy();
  });

  it('renders with native self dev proof', () => {
    render(<SelfDevelopmentPanel {...makeProps()} nativeSelfDevProof={{
      runtime: 'native_tauri', proofAuthority: 'rust_engine', proofMode: 'automated',
      autorun: false, state: 'confirmed', workspaceRoot: '/test', workspaceRootValid: true,
      filesScanned: 50, p0Count: 0, p1Count: 0, p2Count: 0, topPackets: [],
      exportPath: '/export', proofReceiptsWritten: true,
      rc0Proof: { proofPath: '', readmePath: '', artifacts: [], sentinels: [] },
      timestampMs: Date.now(), note: 'test', error: null
    }} />);
    expect(screen.getByText(/Self-Development Mode/i)).toBeTruthy();
  });

  it('renders with workspace foundation', () => {
    render(<SelfDevelopmentPanel {...makeProps()} workspaceFoundation={{ screenCapture: { enabled: true } }} />);
    expect(screen.getByText(/Self-Development Mode/i)).toBeTruthy();
  });
});
