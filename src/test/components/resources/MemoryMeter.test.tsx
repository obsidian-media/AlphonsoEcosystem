// Resource manager Task 10: the small memory meter in the top bar.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let latest: unknown = null;
const listeners = new Set<(s: unknown) => void>();
vi.mock('../../../services/resources/idleStop', () => ({
  latestResources: () => latest,
  onResources: (l: (s: unknown) => void) => { listeners.add(l); return () => listeners.delete(l); },
}));

import { MemoryMeter } from '../../../components/resources/MemoryMeter';

const reading = (over = {}) => ({ atMs: 1, ramTotalMb: 16384, ramFreeMb: 4096, gpuTotalMb: 8192, gpuFreeMb: 6144, gpuSource: 'nvidia', loaded: [], ...over });

beforeEach(() => {
  latest = null;
  listeners.clear();
});

describe('MemoryMeter', () => {
  it('shows nothing before the first reading', () => {
    const { container } = render(<MemoryMeter onOpen={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows RAM and graphics memory used, and opens the Memory section', () => {
    latest = reading();
    const onOpen = vi.fn();
    render(<MemoryMeter onOpen={onOpen} />);
    const meter = screen.getByTestId('memory-meter');
    expect(meter.textContent).toContain('RAM 12/16 GB');
    expect(meter.textContent).toContain('GPU 2/8 GB');
    fireEvent.click(meter);
    expect(onOpen).toHaveBeenCalled();
  });

  it('leaves the graphics part out when it is unknown, and follows new readings', () => {
    latest = reading({ gpuTotalMb: null, gpuFreeMb: null, gpuSource: 'unknown' });
    render(<MemoryMeter onOpen={() => undefined} />);
    expect(screen.getByTestId('memory-meter').textContent).not.toContain('GPU');
    act(() => { for (const l of [...listeners]) l(reading({ ramFreeMb: 8192 })); });
    expect(screen.getByTestId('memory-meter').textContent).toContain('RAM 8/16 GB');
  });

  it('shows nothing when the computer could not be measured', () => {
    latest = reading({ ramTotalMb: 0 });
    const { container } = render(<MemoryMeter onOpen={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
});
