// Phase 3b: Content Studio's small calendar opens the full Calendar page.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentCalendar } from '../../features/content-catalyst/workspace/ContentCalendar';

describe('ContentCalendar', () => {
  it('has "Open the Calendar" when the page can be opened', () => {
    const onOpenCalendar = vi.fn();
    render(<ContentCalendar drafts={[]} onAssignDay={vi.fn()} onSelectDraft={vi.fn()} onPublish={vi.fn()} onOpenCalendar={onOpenCalendar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the Calendar' }));
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it('shows no button without it', () => {
    render(<ContentCalendar drafts={[]} onAssignDay={vi.fn()} onSelectDraft={vi.fn()} onPublish={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Open the Calendar' })).toBeNull();
  });
});
