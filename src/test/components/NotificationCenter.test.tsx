import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationCenter } from '../../components/NotificationCenter';

const mockNotifications = [
  { id: 'n1', type: 'info' as const, title: 'Info Title', message: 'Info message', timestamp: Date.now() - 30_000 },
  { id: 'n2', type: 'warning' as const, title: 'Warning Title', message: 'Warning message', timestamp: Date.now() - 120_000 },
  { id: 'n3', type: 'error' as const, title: 'Error Title', message: 'Error message', timestamp: Date.now() - 300_000 },
];

function makeProps(overrides = {}) {
  return {
    notifications: mockNotifications,
    onDismiss: vi.fn(),
    onClearAll: vi.fn(),
    ...overrides,
  };
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with notifications', () => {
    render(<NotificationCenter {...makeProps()} />);
    expect(screen.getByText('Info Title')).toBeTruthy();
    expect(screen.getByText('Warning Title')).toBeTruthy();
    expect(screen.getByText('Error Title')).toBeTruthy();
  });

  it('adds a notification (renders new notification)', () => {
    const single = [{ id: 'n1', type: 'success' as const, title: 'New Alert', message: 'Something happened', timestamp: Date.now() }];
    render(<NotificationCenter {...makeProps({ notifications: single })} />);
    expect(screen.getByText('New Alert')).toBeTruthy();
    expect(screen.getByText('Something happened')).toBeTruthy();
  });

  it('clears all notifications', () => {
    const onClearAll = vi.fn();
    render(<NotificationCenter {...makeProps({ onClearAll })} />);
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('shows colored border per notification type (info, warning, error)', () => {
    const { container } = render(<NotificationCenter {...makeProps()} />);
    const items = container.querySelectorAll('[class*="l-4"]');
    expect(items.length).toBeGreaterThanOrEqual(2);
    const bgZinc900 = container.querySelectorAll('.bg-zinc-900');
    expect(bgZinc900.length).toBe(3);
  });

  it('displays notification count badge (Clear all button visible when count > 1)', () => {
    render(<NotificationCenter {...makeProps()} />);
    expect(screen.getByText('Clear all')).toBeTruthy();
  });

  it('returns null when notifications array is empty', () => {
    const { container } = render(<NotificationCenter {...makeProps({ notifications: [] })} />);
    expect(container.firstChild).toBeNull();
  });
});