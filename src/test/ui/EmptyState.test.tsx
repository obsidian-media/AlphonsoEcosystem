import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No items" description="Try adding something new" />);
    expect(screen.getByText('Try adding something new')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No items" icon={<span data-testid="icon">🔍</span>} />);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="No items" action={<button>Create</button>} />);
    expect(screen.getByText('Create')).toBeTruthy();
  });
});