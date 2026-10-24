// Phase 3b: the Calendar page (month and week, side panel, brand chips, drag to move, ask before a platform changes).
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const listCalendarItems = vi.fn();
const moveCalendarItem = vi.fn();
const cancelProjectPost = vi.fn();
vi.mock('../../../services/contentFactory/calendarItems', async () => {
  const actual = await vi.importActual<any>('../../../services/contentFactory/calendarItems');
  return { ...actual, listCalendarItems: (...a: unknown[]) => listCalendarItems(...a), moveCalendarItem: (...a: unknown[]) => moveCalendarItem(...a) };
});
vi.mock('../../../services/contentFactory/contentPostMoves', async () => {
  const actual = await vi.importActual<any>('../../../services/contentFactory/contentPostMoves');
  return { ...actual, cancelProjectPost: (...a: unknown[]) => cancelProjectPost(...a) };
});
vi.mock('../../../services/contentFactory/contentBrandService', () => ({
  listBrands: () => [
    { id: 'lw', name: 'Learn With Alphonso', palette: ['#30a46c'], platforms: ['YouTube', 'Instagram'] },
    { id: 'sp', name: 'ShipToPhone', palette: [], platforms: ['Instagram'] },
  ],
}));

import { CalendarPage } from '../../../components/calendar/CalendarPage';
import type { CalendarItem } from '../../../services/contentFactory/calendarItems';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const item = (patch: Partial<CalendarItem>): CalendarItem => ({
  id: 'post:x', kind: 'post', brandId: 'lw', brandName: 'Learn With Alphonso', brandColor: '#30a46c', initials: 'LW',
  platform: 'instagram', piece: 'Reel', title: 'Reel', caption: 'Hi', atMs: at(27, 18), hasTime: true, status: 'scheduled',
  statusLabel: 'Scheduled', needsYou: false, projectId: 'p1', projectName: 'Why tired', postId: 'x', draggable: true, movesOnPlatform: false, ...patch,
});
const ITEMS = [
  item({ id: 'post:yt', postId: 'yt', platform: 'youtube', piece: 'video', title: 'Why tired', atMs: at(26, 18), movesOnPlatform: true }),
  item({ id: 'post:ig', postId: 'ig' }),
  item({ id: 'post:sp', postId: 'sp', brandId: 'sp', brandName: 'ShipToPhone', initials: 'S', brandColor: '#8e4ec6', title: 'Launch reel', atMs: at(31, 10) }),
  item({ id: 'draft:d1', kind: 'draft', draftId: 'd1', postId: undefined, projectId: undefined, brandId: null, brandName: 'Content Studio', initials: 'CS', title: 'Studio draft', atMs: at(29, 0), hasTime: false, platform: 'other' }),
  item({ id: 'post:lock', postId: 'lock', platform: 'youtube', piece: 'Short', title: 'Short', atMs: at(30, 17), status: 'locked_private', statusLabel: 'Kept private by YouTube', needsYou: true, draggable: false, reason: 'YouTube kept it private' }),
];
const START = at(26, 10);

beforeEach(() => {
  listCalendarItems.mockReset().mockReturnValue(ITEMS);
  moveCalendarItem.mockReset().mockResolvedValue({ ok: true });
  cancelProjectPost.mockReset().mockResolvedValue({ ok: true });
});

const renderPage = () => render(<CalendarPage initialDateMs={START} onOpenProject={vi.fn()} />);

describe('CalendarPage', () => {
  it("opens on the month with every brand's posts, drafts and what needs you", () => {
    renderPage();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
    const day27 = screen.getByTestId('calendar-day-2026-10-27');
    expect(within(day27).getByText(/18:00 Reel/)).toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-day-2026-10-31')).getByText('S')).toBeInTheDocument();
    expect(within(screen.getByTestId('calendar-day-2026-10-29')).getByText('Studio draft')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-item-post:lock').getAttribute('data-needs-you')).toBe('true');
  });

  it('the week shows only the hours that have posts, plus No time', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const hours = screen.getAllByTestId(/^calendar-hour-/).map((el) => el.getAttribute('data-testid'));
    expect(hours).toEqual(['calendar-hour-10', 'calendar-hour-17', 'calendar-hour-18', 'calendar-hour-none']);
  });

  it("a brand chip hides that brand's posts", () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /ShipToPhone/ }));
    expect(screen.queryByTestId('calendar-item-post:sp')).toBeNull();
    expect(screen.getByTestId('calendar-item-post:ig')).toBeInTheDocument();
  });

  it('dropping a draft on another day moves it at once', async () => {
    renderPage();
    fireEvent.dragStart(screen.getByTestId('calendar-item-draft:d1'));
    fireEvent.drop(screen.getByTestId('calendar-day-2026-10-30'));
    await waitFor(() => expect(moveCalendarItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft:d1' }), new Date(2026, 9, 30, 0, 0).getTime()));
  });

  it('dropping a post scheduled on YouTube asks first; No changes nothing, Yes moves it', async () => {
    renderPage();
    fireEvent.dragStart(screen.getByTestId('calendar-item-post:yt'));
    fireEvent.drop(screen.getByTestId('calendar-day-2026-10-28'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/This changes the time on YouTube/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(moveCalendarItem).not.toHaveBeenCalled();
    fireEvent.dragStart(screen.getByTestId('calendar-item-post:yt'));
    fireEvent.drop(screen.getByTestId('calendar-day-2026-10-28'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move it' }));
    await waitFor(() => expect(moveCalendarItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'post:yt' }), at(28, 18)));
  });

  it("a post that can't move is not draggable", () => {
    renderPage();
    expect(screen.getByTestId('calendar-item-post:lock').getAttribute('draggable')).toBe('false');
  });

  it('the side panel shows the post, changes its time and says when the move is refused', async () => {
    moveCalendarItem.mockResolvedValueOnce({ ok: false, reason: 'That time is in the past.' });
    renderPage();
    fireEvent.click(screen.getByTestId('calendar-item-post:ig'));
    const panel = screen.getByRole('region', { name: 'Selected post' });
    expect(within(panel).getByText(/Learn With Alphonso · Why tired/)).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('New time'), { target: { value: '2026-10-28T09:30' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(moveCalendarItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'post:ig' }), at(28, 9, 30)));
    expect(await within(panel).findByText('That time is in the past.')).toBeInTheDocument();
  });

  it('Cancel in the side panel asks, then cancels the post', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('calendar-item-post:ig'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Selected post' })).getByRole('button', { name: 'Cancel post' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel it' }));
    await waitFor(() => expect(cancelProjectPost).toHaveBeenCalledWith('p1', 'ig'));
  });
});
