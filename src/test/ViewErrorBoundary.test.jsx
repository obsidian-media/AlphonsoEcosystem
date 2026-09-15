import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { ViewErrorBoundary } from '../components/ViewErrorBoundary';

vi.mock('../services/crashLogService.js', () => ({
  logError: vi.fn()
}));

function ThrowingChild() {
  throw new Error('Test crash');
}

function GoodChild() {
  return <div>all good</div>;
}

describe('ViewErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ViewErrorBoundary>
        <GoodChild />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('catches errors and shows fallback UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ViewErrorBoundary label="Test View">
        <ThrowingChild />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('Test View crashed')).toBeTruthy();
    expect(screen.getByText('Test crash')).toBeTruthy();
    spy.mockRestore();
  });

  it('shows reload button', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ViewErrorBoundary>
        <ThrowingChild />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('Reload view')).toBeTruthy();
    spy.mockRestore();
  });

  it('resets error when reload clicked', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <ViewErrorBoundary onReset={onReset}>
        <ThrowingChild />
      </ViewErrorBoundary>
    );
    screen.getByText('Reload view').click();
    expect(onReset).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('toggles stack trace details', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ViewErrorBoundary>
        <ThrowingChild />
      </ViewErrorBoundary>
    );
    const toggleBtn = screen.getAllByText((_, el) => el?.textContent?.includes('stack trace'))
      .find(el => el.tagName === 'BUTTON');
    expect(toggleBtn).toBeTruthy();
    act(() => {
      toggleBtn.click();
    });
    const hideBtn = screen.getAllByText((_, el) => el?.textContent?.includes('Hide'))
      .find(el => el.tagName === 'BUTTON');
    expect(hideBtn).toBeTruthy();
    spy.mockRestore();
  });

  it('uses default label when none provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ViewErrorBoundary>
        <ThrowingChild />
      </ViewErrorBoundary>
    );
    expect(screen.getByText('View crashed')).toBeTruthy();
    spy.mockRestore();
  });
});
