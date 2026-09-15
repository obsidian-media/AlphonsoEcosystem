import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zone } from '../../../components/ui/Zone';

describe('Zone — warm/cool moods', () => {
  it('applies the warm mood class', () => {
    render(<Zone mood="warm" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).toMatch(/bg-\[var\(--warning-dim\)\]/);
  });

  it('applies the cool mood class', () => {
    render(<Zone mood="cool" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).toMatch(/bg-\[var\(--accent-dim\)\]/);
  });

  it('never adds a border or shadow class for any mood', () => {
    render(<Zone mood="warm" data-testid="z">content</Zone>);
    expect(screen.getByTestId('z').className).not.toMatch(/border-|shadow-/);
  });
});
