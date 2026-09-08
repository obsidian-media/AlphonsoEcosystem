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

  it('has role="dialog" and aria-modal', () => {
    // This primitive had neither before -- a screen reader had no way to
    // know this overlay was a dialog at all.
    render(<Modal open onClose={() => {}} title="Title">Content</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('labels the dialog via aria-labelledby pointing at the visible title when one is provided', () => {
    render(<Modal open onClose={() => {}} title="Runtime Hub">Content</Modal>);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Runtime Hub');
  });

  it('falls back to a plain aria-label when no title is provided (no visible heading to point at)', () => {
    render(<Modal open onClose={() => {}}>Content</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
    expect(dialog.getAttribute('aria-labelledby')).toBeNull();
  });

  it('traps focus: Tab from the last focusable element wraps to the first', () => {
    render(
      <Modal open onClose={() => {}} title="Title">
        <button>first-content-button</button>
        <button>last-content-button</button>
      </Modal>
    );
    screen.getByText('last-content-button').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // The dialog's own × close button is the true first focusable element
    // when a title is present -- confirms the trap's boundary is the whole
    // dialog, not just the children passed in.
    expect(document.activeElement).toBe(screen.getByText('×'));
  });

  it('size="full" renders with its own class and not the sm/md/lg max-w classes', () => {
    render(
      <Modal open onClose={() => {}} size="full" title="Test">
        <div>content</div>
      </Modal>
    );
    const dialog = screen.getByText('Test').closest('div.relative');
    expect(dialog?.className).toContain('max-w-[95vw]');
    expect(dialog?.className).not.toMatch(/max-w-(sm|lg|2xl)/);
  });
});