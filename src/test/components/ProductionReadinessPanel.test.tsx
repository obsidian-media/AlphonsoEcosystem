import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/productionReadinessService', () => ({
  collectProductionReadinessSnapshot: vi.fn(async () => ({ report: { overallStatus: 'verified', sections: [] } })),
  getLastProductionReadinessReport: vi.fn(() => ({ overallStatus: 'verified', sections: [] })),
  summarizeCommandProofs: vi.fn(() => ({ total: 0 })),
  summarizeProductionReadiness: vi.fn(() => ({ status: 'verified' }))
}));
vi.mock('../../services/nativeRc0ProofService', () => ({
  formatNativeProofDetail: vi.fn(() => 'No native proof recorded')
}));
vi.mock('../../services/workspaceRootService', () => ({
  getDefaultWorkspaceRoot: vi.fn(() => '/default/root'),
  validateWorkspaceRoot: vi.fn(async () => ({ valid: true }))
}));
vi.mock('framer-motion', () => ({
  motion: { div: 'div', span: 'span' },
  AnimatePresence: vi.fn(({ children }) => children)
}));

import { ProductionReadinessPanel } from '../../components/ProductionReadinessPanel';

function makeProps(overrides = {}) {
  return {
    settings: { workspaceRoot: '/test/workspace' },
    setSettings: vi.fn(),
    // updateCheckState is a plain UpdateCheckState data object, not a
    // callback -- omitting it is valid and simpler than a mismatched vi.fn()
    // that nothing ever asserts calls on.
    verificationLogs: [],
    workspaceFoundation: {},
    ollamaStatus: { label: 'Connected', trust: 'verified' },
    nativeSelfDevProof: null,
    ...overrides
  };
}

describe('ProductionReadinessPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<ProductionReadinessPanel {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('shows production readiness heading', () => {
    render(<ProductionReadinessPanel {...makeProps()} />);
    expect(screen.getAllByText(/Production Readiness/i)).toBeTruthy();
  });

  it('renders with native self dev proof', () => {
    render(
      <ProductionReadinessPanel
        {...makeProps()}
        nativeSelfDevProof={{
          state: 'confirmed',
          ok: true,
          error: undefined,
          p0Count: 0,
          p1Count: 0,
          p2Count: 0,
          sentinels: [],
          artifacts: []
        }}
      />
    );
    expect(screen.getAllByText(/Production Readiness/i)).toBeTruthy();
  });

  it('renders with workspace foundation', () => {
    render(
      <ProductionReadinessPanel
        {...makeProps()}
        workspaceFoundation={{ screenCapture: { enabled: true } }}
      />
    );
    expect(screen.getAllByText(/Production Readiness/i)).toBeTruthy();
  });

  it('renders with verification logs', () => {
    render(
      <ProductionReadinessPanel
        {...makeProps()}
        verificationLogs={[{ id: 'v1', status: 'verified' }]}
      />
    );
    expect(screen.getAllByText(/Production Readiness/i)).toBeTruthy();
  });
});
