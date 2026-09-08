import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ActivationSequence } from '../../components/setup/ActivationSequence';

// Must match DURATIONS_MS in ActivationSequence.tsx — asserted at the exact
// boundary so shortening either timer fails the test instead of silently
// passing (a plain "advance past it" assertion would not catch that).
const FULL_MS = 3500;
const TOAST_MS = 1500;
const REDUCED_MS = 300;

// jsdom has no matchMedia; default every test to "motion allowed" and let the
// reduced-motion tests opt in explicitly.
function setReducedMotion(matches) {
  window.matchMedia = vi.fn(() => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => setReducedMotion(false));

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

describe('ActivationSequence — reduced motion', () => {
  it('collapses the full sequence to a brief confirmation when reduced motion is set', () => {
    // The global prefers-reduced-motion rule in index.css neutralises CSS
    // animation, but cannot shorten a setTimeout — without this the user is
    // still held on a full-screen animation for 3.5s.
    setReducedMotion(true);
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="full" onFinish={onFinish} />);

    act(() => { vi.advanceTimersByTime(REDUCED_MS - 1); });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('still shows the confirmation text rather than skipping the screen entirely', () => {
    // Reduced motion means less animation, not less information — the screen
    // carries real "your setup finished" meaning.
    setReducedMotion(true);
    render(<ActivationSequence variant="full" onFinish={() => {}} />);
    expect(screen.getByText(/alphonso is online/i)).toBeInTheDocument();
  });

  it('shortens the toast variant too', () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="toast" onFinish={onFinish} />);
    act(() => { vi.advanceTimersByTime(REDUCED_MS); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('ActivationSequence — screen reader announcement', () => {
  it('announces completion politely without stealing focus', () => {
    render(<ActivationSequence variant="full" onFinish={() => {}} />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent(/alphonso is online/i);
  });

  it('announces the toast variant too', () => {
    render(<ActivationSequence variant="toast" onFinish={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/alphonso is online/i);
  });
});
