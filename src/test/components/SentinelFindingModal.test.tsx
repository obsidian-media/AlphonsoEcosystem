import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  X: ({ className, onClick, ...props }: Record<string, unknown>) => (
    <button aria-label="Close" className={className as string} onClick={onClick as () => void} {...props}>X</button>
  ),
}));

import { SentinelFindingModal } from '../../components/SentinelFindingModal';

const mockFinding = {
  severity: 'high',
  type: 'CSP Violation',
  pattern: 'unsafe-inline',
  recommendation: 'Use a nonce or hash-based CSP instead of unsafe-inline.',
};

describe('SentinelFindingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with finding data', () => {
    render(<SentinelFindingModal finding={mockFinding} onClose={vi.fn()} />);
    expect(screen.getByText('CSP Violation')).toBeTruthy();
    expect(screen.getByText('unsafe-inline')).toBeTruthy();
    expect(screen.getByText('Use a nonce or hash-based CSP instead of unsafe-inline.')).toBeTruthy();
  });

  it('shows severity badge', () => {
    render(<SentinelFindingModal finding={mockFinding} onClose={vi.fn()} />);
    const badges = screen.getAllByText('high');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows finding details (pattern and recommendation)', () => {
    render(<SentinelFindingModal finding={mockFinding} onClose={vi.fn()} />);
    expect(screen.getByText('Pattern')).toBeTruthy();
    expect(screen.getByText('Recommendation')).toBeTruthy();
  });

  it('close button works (backdrop click)', () => {
    const onClose = vi.fn();
    render(<SentinelFindingModal finding={mockFinding} onClose={onClose} />);
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('handles empty/null finding (returns null)', () => {
    const { container } = render(<SentinelFindingModal finding={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('close button in footer works', () => {
    const onClose = vi.fn();
    render(<SentinelFindingModal finding={mockFinding} onClose={onClose} />);
    const footerCloseBtn = screen.getAllByText('Close')[0];
    fireEvent.click(footerCloseBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});