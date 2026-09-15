import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zone } from '../../components/ui/Zone';

describe('Zone', () => {
  it('renders its children', () => {
    render(<Zone>Some section content</Zone>);
    expect(screen.getByText('Some section content')).toBeTruthy();
  });

  it('defaults to the neutral mood', () => {
    render(<Zone data-testid="zone">content</Zone>);
    expect(screen.getByTestId('zone').className).toMatch(/bg-surface-2/);
  });

  it('applies the hector mood as a tinted background, not a border or shadow', () => {
    render(<Zone mood="hector" data-testid="zone">content</Zone>);
    const el = screen.getByTestId('zone');
    expect(el.className).toMatch(/bg-agent-hector\/10/);
    expect(el.className).not.toMatch(/shadow/);
    expect(el.className).not.toMatch(/border/);
  });

  it('applies the miya mood as a tinted background', () => {
    render(<Zone mood="miya" data-testid="zone">content</Zone>);
    expect(screen.getByTestId('zone').className).toMatch(/bg-agent-miya\/10/);
  });

  it('never includes a shadow or border class regardless of mood', () => {
    (['neutral', 'hector', 'miya'] as const).forEach((mood) => {
      const { unmount } = render(<Zone mood={mood} data-testid={`zone-${mood}`}>x</Zone>);
      const el = screen.getByTestId(`zone-${mood}`);
      expect(el.className).not.toMatch(/shadow/);
      expect(el.className).not.toMatch(/\bborder\b/);
      unmount();
    });
  });
});
