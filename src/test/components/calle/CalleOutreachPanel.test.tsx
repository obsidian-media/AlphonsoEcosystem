import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCreateOutreachDraft = vi.fn();
const mockDismissOutreachCall = vi.fn();
const mockListOutreachCalls = vi.fn();
const mockRunOutreachCall = vi.fn();
vi.mock('../../../services/calleOutreachService', () => ({
  createOutreachDraft: (...args: unknown[]) => mockCreateOutreachDraft(...args),
  dismissOutreachCall: (...args: unknown[]) => mockDismissOutreachCall(...args),
  listOutreachCalls: (...args: unknown[]) => mockListOutreachCalls(...args),
  runOutreachCall: (...args: unknown[]) => mockRunOutreachCall(...args),
  ESTIMATED_COST_USD: 0.05
}));

const mockIsCalleConfigured = vi.fn<(...args: unknown[]) => boolean>(() => true);
vi.mock('../../../services/connectors/calleConnector', () => ({
  isCalleConfigured: (...args: unknown[]) => mockIsCalleConfigured(...args)
}));

import { CalleOutreachPanel } from '../../../components/calle/CalleOutreachPanel';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCalleConfigured.mockReturnValue(true);
  mockListOutreachCalls.mockReturnValue([]);
});

describe('CalleOutreachPanel', () => {
  it('disables Submit when CALL-E is not configured', () => {
    mockIsCalleConfigured.mockReturnValue(false);
    render(<CalleOutreachPanel />);
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('rejects an invalid phone number before allowing submit', () => {
    render(<CalleOutreachPanel />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: 'not-a-phone' } });
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('calls createOutreachDraft on submit with a valid phone', () => {
    mockCreateOutreachDraft.mockReturnValue({ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', status: 'pending_approval', policyBlockKind: 'needs_approval_click' });
    render(<CalleOutreachPanel />);
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Joe's Pizza" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+15550123456' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockCreateOutreachDraft).toHaveBeenCalledWith(expect.objectContaining({ businessName: "Joe's Pizza", phone: '+15550123456' }));
  });

  it('shows the Approve & Place Call action for a pending_approval record needing a click', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: 'Call and ask.', status: 'pending_approval', policyBlockKind: 'needs_approval_click' }]);
    render(<CalleOutreachPanel />);
    expect(screen.getByRole('button', { name: /approve.*place call/i })).toBeTruthy();
  });

  it('shows Settings-change guidance instead of Approve for a zero_cost_mode block', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: 'Call and ask.', status: 'pending_approval', policyBlockKind: 'zero_cost_mode' }]);
    render(<CalleOutreachPanel />);
    expect(screen.queryByRole('button', { name: /approve.*place call/i })).toBeNull();
    expect(screen.getByText(/zero-cost mode/i)).toBeTruthy();
  });

  it('calls runOutreachCall with approved: true when Approve & Place Call is clicked', async () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: 'Call and ask.', status: 'pending_approval', policyBlockKind: 'needs_approval_click' }]);
    mockRunOutreachCall.mockResolvedValue({ id: 'r1', status: 'queued' });
    render(<CalleOutreachPanel />);
    fireEvent.click(screen.getByRole('button', { name: /approve.*place call/i }));

    await waitFor(() => expect(mockRunOutreachCall).toHaveBeenCalledWith('r1', { approved: true }));
  });

  it('shows a Dismiss action for a blocked/failed record and calls dismissOutreachCall', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: '', status: 'failed_to_start', policyBlockKind: null, error: 'boom' }]);
    render(<CalleOutreachPanel />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockDismissOutreachCall).toHaveBeenCalledWith('r1');
  });

  it('renders the structured result and summary once a record is completed', () => {
    mockListOutreachCalls.mockReturnValue([{ id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: '', status: 'completed', structuredResult: { interested_in_website: 'yes' }, summary: 'They are interested.' }]);
    render(<CalleOutreachPanel />);
    expect(screen.getByText('They are interested.')).toBeTruthy();
  });

  it('renders past records in a history list', () => {
    mockListOutreachCalls.mockReturnValue([
      { id: 'r1', businessName: 'Joe\'s Pizza', phone: '+15550123456', task: '', status: 'completed' },
      { id: 'r2', businessName: 'Ann\'s Bakery', phone: '+15550987654', task: '', status: 'failed_to_start' }
    ]);
    render(<CalleOutreachPanel />);
    expect(screen.getByText("Joe's Pizza")).toBeTruthy();
    expect(screen.getByText("Ann's Bakery")).toBeTruthy();
  });
});
