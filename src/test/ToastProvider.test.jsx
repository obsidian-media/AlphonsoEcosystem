import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../components/ToastProvider';

function TestConsumer() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Success!', 'Done')}>success</button>
      <button onClick={() => toast.error('Error!', 'Failed')}>error</button>
      <button onClick={() => toast.info('Info', 'Heads up')}>info</button>
      <button onClick={() => toast.warning('Warning', 'Careful')}>warning</button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('renders without crashing', () => {
    render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>
    );
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('provides toast function via context', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    expect(screen.getByText('success')).toBeTruthy();
  });

  it('shows toast on success', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText('success').click();
    });
    expect(screen.getByText('Success!')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('shows toast on error', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText('error').click();
    });
    expect(screen.getByText('Error!')).toBeTruthy();
  });

  it('shows toast on info', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText('info').click();
    });
    expect(screen.getByText('Info')).toBeTruthy();
  });

  it('shows toast on warning', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText('warning').click();
    });
    expect(screen.getByText('Warning')).toBeTruthy();
  });

  it('dismisses toast when X clicked', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText('success').click();
    });
    expect(screen.getByText('Success!')).toBeTruthy();
    act(() => {
      const toastEl = screen.getByText('Success!').closest('[class*="rounded-xl"]');
      const dismissBtn = within(toastEl).getAllByRole('button')[0];
      dismissBtn.click();
    });
    expect(screen.queryByText('Success!')).toBeNull();
  });

  it('throws when useToast used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useToast must be used inside ToastProvider');
    spy.mockRestore();
  });

  it('listens to alphonso:toast custom events', () => {
    render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>
    );
    act(() => {
      window.dispatchEvent(new CustomEvent('alphonso:toast', {
        detail: { type: 'success', title: 'Event', message: 'From event' }
      }));
    });
    expect(screen.getByText('Event')).toBeTruthy();
    expect(screen.getByText('From event')).toBeTruthy();
  });
});
