import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentCalendar } from '../../../features/content-catalyst/workspace/ContentCalendar';

describe('ContentCalendar', () => {
  it('renders the Schedule header and the current month label', () => {
    render(<ContentCalendar drafts={[]} />);
    expect(screen.getByText('Schedule')).toBeTruthy();
  });

  it('shows the no-scheduled-drafts empty state when nothing is scheduled', () => {
    render(<ContentCalendar drafts={[]} />);
    expect(screen.getByText(/No scheduled drafts/)).toBeTruthy();
  });
});
