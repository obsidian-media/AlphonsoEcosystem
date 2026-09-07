import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ActivationSequence } from '../../components/setup/ActivationSequence';

describe('ActivationSequence', () => {
  it('shows "Alphonso is online." and calls onFinish after the full sequence', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="full" onFinish={onFinish} />);
    expect(screen.getByText(/alphonso is online/i)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onFinish).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('finishes faster for the toast variant than the full variant', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<ActivationSequence variant="toast" onFinish={onFinish} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onFinish).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
