import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BootRitualIntro } from '../../components/setup/BootRitualIntro';

vi.mock('../../hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: vi.fn(() => false),
}));

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

beforeEach(() => {
  vi.useFakeTimers();
  usePrefersReducedMotion.mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('BootRitualIntro', () => {
  it('shows the Alphonso HUD title', () => {
    render(<BootRitualIntro onFinish={() => {}} />);
    expect(screen.getByText('ALPHONSO')).toBeInTheDocument();
  });

  it('auto-advances after the full-motion duration', () => {
    const onFinish = vi.fn();
    render(<BootRitualIntro onFinish={onFinish} />);
    expect(onFinish).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2600); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skips immediately on click, without waiting for the timer', () => {
    const onFinish = vi.fn();
    render(<BootRitualIntro onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skips on Enter, Space, or Escape', () => {
    for (const key of ['Enter', ' ', 'Escape']) {
      const onFinish = vi.fn();
      const { unmount } = render(<BootRitualIntro onFinish={onFinish} />);
      fireEvent.keyDown(document, { key });
      expect(onFinish).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('never calls onFinish twice, even if skipped right as the auto-advance timer fires', () => {
    // The real risk this guards against: the native <button>'s own Enter
    // activation and the document-level keydown listener can both fire in
    // the same tick when the button happens to be focused -- a naive guard
    // (React state, which is stale within one synchronous batch) would let
    // both through.
    const onFinish = vi.fn();
    render(<BootRitualIntro onFinish={onFinish} />);
    const button = screen.getByRole('button', { name: 'Skip intro' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button); // the native button's own Enter-activation click
    act(() => { vi.advanceTimersByTime(2600); }); // the timer, which would also fire
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders the emblem at final state immediately and advances quickly with reduced motion', () => {
    usePrefersReducedMotion.mockReturnValue(true);
    const onFinish = vi.fn();
    render(<BootRitualIntro onFinish={onFinish} />);
    expect(screen.getByText('ALPHONSO')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
