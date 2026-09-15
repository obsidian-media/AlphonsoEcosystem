import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HectorApprovalHandoff } from '../../../components/hector/HectorApprovalHandoff';

describe('HectorApprovalHandoff', () => {
  it('disables the button when there is no report', () => {
    const onCreateHandoff = vi.fn();
    render(<HectorApprovalHandoff report={null} onCreateHandoff={onCreateHandoff} />);
    expect(screen.getByText('Send Report To Jose').closest('button')).toBeDisabled();
  });

  it('calls onCreateHandoff with the report id when clicked', () => {
    const onCreateHandoff = vi.fn();
    render(<HectorApprovalHandoff report={{ id: 'report-1' }} onCreateHandoff={onCreateHandoff} />);
    fireEvent.click(screen.getByText('Send Report To Jose'));
    expect(onCreateHandoff).toHaveBeenCalledWith('report-1');
  });
});
