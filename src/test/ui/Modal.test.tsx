import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../components/ui/Modal';

describe('Modal', () => {
  it('returns null when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}}><div>Content</div></Modal>);
    expect(container.innerHTML).toBe('');
  });

  it('renders when open', () => {
    render(<Modal open={true} onClose={() => {}}><div>Modal content</div></Modal>);
    expect(screen.getByText('Modal content')).toBeTruthy();
  });

  it('renders title when provided', () => {
    render(<Modal open={true} onClose={() => {}} title="Modal Title">Content</Modal>);
    expect(screen.getByText('Modal Title')).toBeTruthy();
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose}>Content</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose}>Content</Modal>);
    const backdrop = document.querySelector('.bg-black\\/60');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders close button when title provided', () => {
    render(<Modal open={true} onClose={() => {}} title="Title">Content</Modal>);
    const closeBtn = screen.getByText('×');
    expect(closeBtn).toBeTruthy();
  });
});