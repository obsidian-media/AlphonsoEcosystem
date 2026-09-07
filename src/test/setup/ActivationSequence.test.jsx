import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ActivationSequence } from '../../components/setup/ActivationSequence';

// Must match DURATIONS_MS in ActivationSequence.tsx — asserted at the exact
// boundary so shortening either timer fails the test instead of silently
// passing (a plain "advance past it" assertion would not catch that).
const FULL_MS = 3500;
const TOAST_MS = 1500;

describe('ActivationSequence', () => {
  it('shows "Alphonso is online." and calls onFinish exactly at the full duration', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="full" onFinish={onFinish} />);
    expect(screen.getByText(/alphonso is online/i)).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(FULL_MS - 1); });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onFinish exactly at the toast duration', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="toast" onFinish={onFinish} />);

    act(() => { vi.advanceTimersByTime(TOAST_MS - 1); });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('finishes the toast variant strictly sooner than the full variant', () => {
    expect(TOAST_MS).toBeLessThan(FULL_MS);

    vi.useFakeTimers();
    const toastFinish = vi.fn();
    const fullFinish = vi.fn();
    const { unmount } = render(<ActivationSequence variant="toast" onFinish={toastFinish} />);
    act(() => { vi.advanceTimersByTime(TOAST_MS); });
    unmount();
    render(<ActivationSequence variant="full" onFinish={fullFinish} />);
    act(() => { vi.advanceTimersByTime(TOAST_MS); });

    expect(toastFinish).toHaveBeenCalledTimes(1);
    expect(fullFinish).not.toHaveBeenCalled(); // full is still running
    vi.useRealTimers();
  });
});
