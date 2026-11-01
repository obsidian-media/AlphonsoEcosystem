// 2.11.0 QA (owner, 2026-11-01): Settings → Appearance's three themes changed nothing you could
// see. The picker sets the app's accent colour, which every button and highlight uses.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccentColorPicker } from '../../components/AccentColorPicker';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-accent');
});

describe('AccentColorPicker', () => {
  it('shows each colour, marks the one in use, and switches the whole app to another', () => {
    render(<AccentColorPicker />);
    expect(screen.getAllByRole('radio').map((b) => b.textContent)).toEqual(['Cyan', 'Green', 'Purple', 'Gold']);
    expect(screen.getByRole('radio', { name: 'Cyan' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Purple' }));
    expect(document.documentElement.getAttribute('data-accent')).toBe('purple');
    expect(screen.getByRole('radio', { name: 'Purple' }).getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('alphonso_accent_theme')).toBe('purple');
  });
});
