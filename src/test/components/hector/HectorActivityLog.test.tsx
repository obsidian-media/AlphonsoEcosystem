import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HectorActivityLog } from '../../../components/hector/HectorActivityLog';

describe('HectorActivityLog', () => {
  it('shows empty-state copy with no rows', () => {
    render(<HectorActivityLog rows={[]} />);
    expect(screen.getByText('No Hector activity yet.')).toBeTruthy();
  });

  it('renders rows in reverse-chronological order', () => {
    render(<HectorActivityLog rows={[
      { id: '1', type: 'draft_created', timestampMs: 1000 },
      { id: '2', type: 'source_fetched', timestampMs: 2000 },
    ]} />);
    const rendered = screen.getAllByText(/draft_created|source_fetched/).map((el) => el.textContent);
    expect(rendered).toEqual(['source_fetched', 'draft_created']);
  });
});
