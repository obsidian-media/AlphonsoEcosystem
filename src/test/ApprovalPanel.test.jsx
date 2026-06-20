import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../services/agentBusService', () => ({
  approvePacket: vi.fn(() => ({ id: 'pkt-1', status: 'approved' })),
  rejectPacket: vi.fn(() => ({ id: 'pkt-1', status: 'rejected' })),
  getPacketById: vi.fn((id) => ({
    id,
    status: 'pending_approval',
    payload: {
      assignment: {
        agent: 'marcus',
        actionType: 'external_publish',
        riskLevel: 'high'
      }
    }
  }))
}));

import { ApprovalPanel } from '../components/ApprovalPanel.jsx';
import { approvePacket, rejectPacket } from '../services/agentBusService';

const ONE_PENDING = [
  { packetId: 'pkt-1', agent: 'marcus', status: 'approval_required', reason: 'External publish requires approval' }
];

const TWO_PENDING = [
  { packetId: 'pkt-1', agent: 'marcus', status: 'approval_required', reason: 'External publish' },
  { packetId: 'pkt-2', agent: 'miya', status: 'approval_required', reason: 'Creative package upload' }
];

describe('ApprovalPanel', () => {
  beforeEach(() => {
    approvePacket.mockClear();
    rejectPacket.mockClear();
  });

  it('renders nothing when no pending approvals', () => {
    const { container } = render(<ApprovalPanel pendingApprovals={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows item count and pending badge', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    expect(screen.getByText('1 item awaiting approval')).toBeTruthy();
  });

  it('renders agent name and action type for each item', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" />);
    expect(screen.getByText('marcus')).toBeTruthy();
    expect(screen.getByText('miya')).toBeTruthy();
  });

  it('calls approvePacket when Approve is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    const approveBtn = screen.getByRole('button', { name: /Approve/i });
    fireEvent.click(approveBtn);
    expect(approvePacket).toHaveBeenCalledWith('pkt-1', 'chatview-inline');
  });

  it('calls rejectPacket when Deny is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    const denyBtn = screen.getByRole('button', { name: /Deny/i });
    fireEvent.click(denyBtn);
    expect(rejectPacket).toHaveBeenCalledWith('pkt-1', 'Rejected from chat inline approval');
  });

  it('shows Continue button after all items are resolved', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    const approveBtn = screen.getByRole('button', { name: /Approve/i });
    fireEvent.click(approveBtn);
    expect(screen.getByRole('button', { name: /Continue/i })).toBeTruthy();
  });

  it('does not show Continue button when items are unresolved', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" />);
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('calls onAllResolved with results when Continue is clicked', () => {
    const onAllResolved = vi.fn();
    render(
      <ApprovalPanel
        pendingApprovals={ONE_PENDING}
        commandId="cmd-1"
        onAllResolved={onAllResolved}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(onAllResolved).toHaveBeenCalledWith('cmd-1', { 'pkt-1': 'approved' });
  });

  it('shows risk badge for high-risk items', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('shows reason text when provided', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" />);
    expect(screen.getByText('External publish requires approval')).toBeTruthy();
  });
});
