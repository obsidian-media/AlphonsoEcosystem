import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CalendarScreen } from '../../mobile/screens/Calendar';
import { postStamp } from '../../services/phone/contentStamps';
import type { StudioData } from '../../services/phone/remoteData';

// 2026-11-10 is a Tuesday; times are local.
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).getTime();
const NOW = at(1, 9);

const ytPost = { id: 'post-yt', platform: 'youtube', piece: 'video', title: 'Bakery tour', caption: 'Watch', hashtags: [], scheduledAtMs: at(10, 18), status: 'scheduled', file: 'shop/p1/output/v1-16x9.mp4' };
function item(over: any = {}) {
  return {
    id: 'i-yt', kind: 'post', brandId: 'b1', brandName: 'Shop', brandColor: '#30a46c', initials: 'SH', platform: 'youtube', piece: 'video', isShort: false,
    post: ytPost, title: 'Bakery tour', caption: 'Watch', atMs: at(10, 18), hasTime: true, status: 'scheduled', statusLabel: 'Scheduled on YouTube',
    needsYou: false, projectId: 'p1', projectName: 'Bakery tour', postId: 'post-yt', draggable: true, movesOnPlatform: true, ...over,
  };
}
const igItem = item({ id: 'i-ig', brandId: 'b2', brandName: 'Cafe', initials: 'CA', platform: 'instagram', piece: 'Reel', atMs: at(10, 9), movesOnPlatform: false, post: { ...ytPost, id: 'post-ig', platform: 'instagram' }, postId: 'post-ig' });
const failed = item({ id: 'i-fail', atMs: at(12, 8), needsYou: true, status: 'failed', statusLabel: 'Failed', reason: 'Sign in to YouTube again.', postId: 'post-f', post: { ...ytPost, id: 'post-f', status: 'failed' } });

function studio(items: any[] = [item(), igItem, failed], over: Partial<StudioData> = {}) {
  return {
    projects: () => [{ id: 'p1', name: 'Bakery tour', media: [{ projectId: 'p1', path: 'shop/p1/output/v1-16x9.mp4', kind: 'video' }] }],
    brands: () => [{ id: 'b1', name: 'Shop' }, { id: 'b2', name: 'Cafe' }],
    calendar: () => items,
    call: vi.fn(async () => ({ ok: true, value: { ok: true } })),
    preview: vi.fn(async () => ({ ok: true, url: 'blob:v' })),
    subscribe: () => () => {}, readOnly: false, ...over,
  } as any;
}
const lock = (ok = true) => ({ confirm: vi.fn(async () => ok) });

describe('the Calendar on the phone', () => {
  it('posts are grouped by day in the month, earliest first', () => {
    render(<CalendarScreen studio={studio()} lock={lock()} nowMs={NOW} />);
    const day10 = screen.getByTestId('calendar-day-2026-11-10');
    const ids = within(day10).getAllByTestId(/^calendar-item-/).map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['calendar-item-i-ig', 'calendar-item-i-yt']);
    expect(screen.getByTestId('calendar-day-2026-11-12')).toBeTruthy();
    expect(screen.getByText('November 2026')).toBeTruthy();
  });

  it('the brand filter hides another brand', () => {
    render(<CalendarScreen studio={studio()} lock={lock()} nowMs={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cafe' }));
    expect(screen.queryByTestId('calendar-item-i-ig')).toBeNull();
    expect(screen.getByTestId('calendar-item-i-yt')).toBeTruthy();
  });

  it('a post needing you is marked, with its reason in the sheet', () => {
    render(<CalendarScreen studio={studio()} lock={lock()} nowMs={NOW} />);
    expect(screen.getByTestId('calendar-item-i-fail').getAttribute('data-needs-you')).toBe('true');
    expect(screen.getByTestId('calendar-item-i-yt').getAttribute('data-needs-you')).toBe('false');
    fireEvent.click(screen.getByTestId('calendar-item-i-fail'));
    expect(screen.getByText('Sign in to YouTube again.')).toBeTruthy();
  });

  it('changing the time of a YouTube post asks first and sends content.movePost', async () => {
    const data = studio();
    render(<CalendarScreen studio={data} lock={lock()} nowMs={NOW} />);
    fireEvent.click(screen.getByTestId('calendar-item-i-yt'));
    fireEvent.click(screen.getByRole('button', { name: 'Change time' }));
    fireEvent.change(screen.getByLabelText('New time'), { target: { value: '2026-11-11T20:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(screen.getByText(/This changes the time on YouTube\./)).toBeTruthy();
    expect(data.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Move it' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.movePost', {
      projectId: 'p1', postId: 'post-yt', atMs: new Date(2026, 10, 11, 20, 30).getTime(), base: postStamp(ytPost as any),
    }));
  });

  it('Cancel post asks and needs Face ID', async () => {
    const data = studio();
    const l = lock(false);
    render(<CalendarScreen studio={data} lock={l} nowMs={NOW} />);
    fireEvent.click(screen.getByTestId('calendar-item-i-yt'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel post' }));
    expect(screen.getByText('Cancel this post on YouTube? The video stays private on your channel.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel it' }));
    await waitFor(() => expect(l.confirm).toHaveBeenCalledWith('Cancel this post', { strict: true }));
    expect(data.call).not.toHaveBeenCalled();
    l.confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel it' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.cancelPost', { projectId: 'p1', postId: 'post-yt', base: postStamp(ytPost as any) }));
  });

  it("the sheet shows the post's video, loaded when tapped", () => {
    render(<CalendarScreen studio={studio()} lock={lock()} nowMs={NOW} />);
    fireEvent.click(screen.getByTestId('calendar-item-i-yt'));
    expect(screen.getByTestId('studio-media-shop/p1/output/v1-16x9.mp4')).toBeTruthy();
  });

  it('a Content Studio draft or a Marcus send is shown, changed only on the computer', () => {
    const send = item({ id: 'i-send', kind: 'send', postId: undefined, post: undefined, projectId: undefined, atMs: at(14, 9) });
    render(<CalendarScreen studio={studio([send])} lock={lock()} nowMs={NOW} />);
    fireEvent.click(screen.getByTestId('calendar-item-i-send'));
    expect(screen.queryByRole('button', { name: 'Change time' })).toBeNull();
    expect(screen.getByText('Change this one on your computer.')).toBeTruthy();
  });

  it('Week shows only the seven days from the week of today', () => {
    render(<CalendarScreen studio={studio()} lock={lock()} nowMs={at(10, 12)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getByTestId('calendar-item-i-yt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByTestId('calendar-item-i-yt')).toBeNull();
  });
});
