import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../services/toolConnectionService', () => ({
  listToolConnectionAudit: vi.fn(() => []),
  listToolConnectionTypes: vi.fn(() => []),
  listToolConnections: vi.fn(() => []),
  removeToolConnection: vi.fn(),
  proveToolConnectionPath: vi.fn(async () => ({ ok: true })),
  sendToolConnectionMessage: vi.fn(async () => ({ ok: true })),
  upsertToolConnection: vi.fn()
}));

import { ToolConnectionsPanel } from '../../components/ToolConnectionsPanel';
import { listToolConnections } from '../../services/toolConnectionService';

describe('ToolConnectionsPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders without crashing', () => {
    const { container } = render(<ToolConnectionsPanel />);
    expect(container).toBeTruthy();
  });

  it('renders with tool connections', () => {
    (listToolConnections as any).mockReturnValueOnce([
      { id: 'c1', type: 'webhook', label: 'My hook', active: true }
    ]);
    const { container } = render(<ToolConnectionsPanel />);
    expect(container).toBeTruthy();
  });
});