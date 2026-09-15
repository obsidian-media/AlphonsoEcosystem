import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalPanel } from '../components/ApprovalPanel.jsx';

const ONE_PENDING = [
  { itemId: 'item-1', agent: 'marcus', actionType: 'external_publish', riskLevel: 'high', reason: 'External publish requires approval' }
];

const TWO_PENDING = [
  { itemId: 'item-1', agent: 'marcus', actionType: 'external_publish', riskLevel: 'high', reason: 'External publish' },
  { itemId: 'item-2', agent: 'miya', actionType: 'creative_upload', riskLevel: 'medium', reason: 'Creative package upload' }
];

describe('ApprovalPanel', () => {
  let onApprove;
  let onReject;

  beforeEach(() => {
    onApprove = vi.fn();
    onReject = vi.fn();
  });

  it('renders nothing when no pending approvals', () => {
    const { container } = render(<ApprovalPanel pendingApprovals={[]} onApprove={onApprove} onReject={onReject} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows item count and pending badge', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('1 item awaiting approval')).toBeTruthy();
  });

  it('renders agent name and action type for each item', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('marcus')).toBeTruthy();
    expect(screen.getByText('miya')).toBeTruthy();
  });

  it('calls the injected onApprove with the item id when Approve is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalledWith('item-1');
  });

  it('calls the injected onReject with the item id when Deny is clicked', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    expect(onReject).toHaveBeenCalledWith('item-1');
  });

  it('shows Continue button after all items are resolved', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(screen.getByRole('button', { name: /Continue/i })).toBeTruthy();
  });

  it('does not show Continue button when items are unresolved', () => {
    render(<ApprovalPanel pendingApprovals={TWO_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('calls onAllResolved with results keyed by itemId when Continue is clicked', () => {
    const onAllResolved = vi.fn();
    render(
      <ApprovalPanel
        pendingApprovals={ONE_PENDING}
        commandId="cmd-1"
        onApprove={onApprove}
        onReject={onReject}
        onAllResolved={onAllResolved}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(onAllResolved).toHaveBeenCalledWith('cmd-1', { 'item-1': 'approved' });
  });

  it('shows risk badge for high-risk items', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('shows reason text when provided', () => {
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    expect(screen.getByText('External publish requires approval')).toBeTruthy();
  });

  it('surfaces an inline error and does not mark the item resolved if onApprove throws', () => {
    onApprove.mockImplementation(() => { throw new Error('boom'); });
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(screen.getByText('Approve failed: boom')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('surfaces an inline error and does not mark the item resolved if onReject throws', () => {
    onReject.mockImplementation(() => { throw new Error('boom'); });
    render(<ApprovalPanel pendingApprovals={ONE_PENDING} commandId="cmd-1" onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    expect(screen.getByText('Reject failed: boom')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Continue/i })).toBeNull();
  });

  it('uses the item riskLevel directly (no getItemDetail call) when riskLevel is already present', () => {
    const getItemDetail = vi.fn();
    render(
      <ApprovalPanel pendingApprovals={ONE_PENDING} onApprove={onApprove} onReject={onReject} getItemDetail={getItemDetail} />
    );
    expect(getItemDetail).not.toHaveBeenCalled();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('falls back to getItemDetail + inferred risk when the item has no riskLevel', () => {
    const NO_RISK_ITEM = [{ itemId: 'pkt-1', reason: 'External publish requires approval' }];
    const getItemDetail = vi.fn(() => ({ agent: 'marcus', actionType: 'external_publish', riskLevel: 'high' }));
    render(
      <ApprovalPanel pendingApprovals={NO_RISK_ITEM} onApprove={onApprove} onReject={onReject} getItemDetail={getItemDetail} />
    );
    expect(getItemDetail).toHaveBeenCalledWith('pkt-1');
    expect(screen.getByText('marcus')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });
});
