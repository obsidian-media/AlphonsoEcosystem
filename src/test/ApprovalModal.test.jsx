import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalModal } from '../components/ApprovalModal.jsx';

describe('ApprovalModal', () => {
  const defaultProps = {
    label: 'Send message via Telegram',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onConfirm.mockClear();
    defaultProps.onCancel.mockClear();
  });

  it('renders dialog with aria role', () => {
    render(<ApprovalModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('shows "Approval Required" heading', () => {
    render(<ApprovalModal {...defaultProps} />);
    expect(screen.getByText('Approval Required')).toBeTruthy();
  });

  it('shows action text from label prop', () => {
    render(<ApprovalModal {...defaultProps} label="Send message via Telegram" />);
    expect(screen.getByText('Send message via Telegram')).toBeTruthy();
  });

  it('shows action text from action prop overriding label', () => {
    render(<ApprovalModal {...defaultProps} action="Explicit action name" label="Should not show" />);
    expect(screen.getByText('Explicit action name')).toBeTruthy();
    expect(screen.queryByText('Should not show')).toBeNull();
  });

  it('Approve button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ApprovalModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Deny button calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ApprovalModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Deny/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ApprovalModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows destructive warning when label contains "delete"', () => {
    render(<ApprovalModal {...defaultProps} label="delete file permanently" />);
    expect(screen.getByText(/irreversible/i)).toBeTruthy();
  });

  it('ScoreRing renders with mariaScore=72', () => {
    const { container } = render(<ApprovalModal {...defaultProps} mariaScore={72} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // The score value is shown as a span inside the ring div
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('infers high risk from label "delete file" and shows High Risk badge', () => {
    render(<ApprovalModal {...defaultProps} label="delete file" />);
    expect(screen.getByText('High Risk')).toBeTruthy();
  });
});
