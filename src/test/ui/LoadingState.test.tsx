import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, LoadingState } from '../../components/ui/LoadingState';

describe('Spinner', () => {
  it('renders with sm size', () => {
    render(<Spinner size="sm" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner?.className).toContain('w-3');
  });

  it('renders with md size (default)', () => {
    render(<Spinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner?.className).toContain('w-5');
  });

  it('renders with lg size', () => {
    render(<Spinner size="lg" />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner?.className).toContain('w-8');
  });
});

describe('LoadingState', () => {
  it('renders spinner', () => {
    render(<LoadingState />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders message when provided', () => {
    render(<LoadingState message="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeTruthy();
  });

  it('does not render message when omitted', () => {
    render(<LoadingState />);
    const messages = document.querySelectorAll('.text-xs');
    expect(messages.length).toBe(0);
  });
});