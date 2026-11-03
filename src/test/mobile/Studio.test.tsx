import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudioScreen } from '../../mobile/screens/Studio';
import { ON_COMPUTER_FOR_NOW } from '../../mobile/screens/More';
import { stepStamp, postsStamp } from '../../services/phone/contentStamps';
import type { StudioData } from '../../services/phone/remoteData';

const step = (status: string, versions = 1) => ({ status, versions: Array.from({ length: versions }, (_, i) => ({ version: i + 1, summary: `v${i + 1}`, output: {} })), chosenVersion: versions || null, error: null, progress: [] });

function project(over: any = {}) {
  return {
    id: 'p1', brandId: 'b1', name: 'Bakery tour', updatedAtMs: 5, brief: { idea: 'Bakery tour' },
    steps: { script: step('done'), review: step('needs_approval'), assemble: step('done') },
    posts: [{ id: 'post-1', platform: 'instagram', piece: 'reel', title: '', caption: 'Hi', hashtags: ['a'], scheduledAtMs: 100, status: 'draft' }],
    media: [{ projectId: 'p1', path: 'shop/p1/output/v1-9x16.mp4', kind: 'video' }],
    ...over,
  };
}

function studio(p: any = project(), over: Partial<StudioData> = {}): StudioData & { call: any; preview: any } {
  return {
    projects: () => [p], brands: () => [{ id: 'b1', name: 'Shop' }], calendar: () => [],
    call: vi.fn(async () => ({ ok: true, value: { ok: true, latest: p } })),
    preview: vi.fn(async () => ({ ok: true, url: 'blob:video' })),
    subscribe: () => () => {}, readOnly: false,
    ...over,
  } as any;
}
const lock = (ok = true) => ({ confirm: vi.fn(async () => ok) });

function openProject(data: StudioData, l = lock()) {
  render(<StudioScreen studio={data} lock={l} />);
  fireEvent.click(screen.getByRole('button', { name: /Bakery tour/ }));
}

describe('Miya Studio on the phone', () => {
  it('the list puts a project waiting for you first, with what it waits for', () => {
    const waiting = project();
    const quiet = project({ id: 'p2', name: 'Quiet one', updatedAtMs: 9, steps: { script: step('done') } });
    render(<StudioScreen studio={{ ...studio(), projects: () => [quiet, waiting] } as any} lock={lock()} />);
    const items = screen.getAllByTestId(/^studio-project-/);
    expect(items[0].getAttribute('data-testid')).toBe('studio-project-p1');
    expect(items[0].textContent).toContain('Review: Waiting for your approval');
  });

  it('a project waiting for review shows Approve and Send back', async () => {
    const p = project();
    const data = studio(p);
    openProject(data);
    fireEvent.click(screen.getByTestId('studio-approve-review'));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.approveStep', { projectId: 'p1', step: 'review', base: stepStamp(p, 'review') }));
    fireEvent.click(screen.getByTestId('studio-send-back-review'));
    fireEvent.change(screen.getByLabelText('What to change'), { target: { value: 'Shorter intro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it back' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.sendBack', { projectId: 'p1', step: 'review', reason: 'Shorter intro', base: stepStamp(p, 'review') }));
  });

  it('a step with versions offers each, and "Use this version" sends it', async () => {
    const p = project({ steps: { script: step('done', 2) } });
    const data = studio(p);
    openProject(data);
    fireEvent.click(screen.getByTestId('studio-use-script-1'));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.chooseVersion', { projectId: 'p1', step: 'script', version: 1, base: stepStamp(p, 'script') }));
  });

  it('Approve and schedule asks for Face ID (strict) first, and nothing goes when it is cancelled', async () => {
    const p = project();
    const data = studio(p);
    const l = lock(false);
    openProject(data, l);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and schedule' }));
    await waitFor(() => expect(l.confirm).toHaveBeenCalledWith('Approve and schedule the posts', { strict: true }));
    expect(data.call).not.toHaveBeenCalledWith('content.approvePosts', expect.anything());
    expect(await screen.findByText("Not approved: Face ID / fingerprint didn't confirm it.")).toBeTruthy();
    l.confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and schedule' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.approvePosts', { projectId: 'p1', base: postsStamp(p) }));
  });

  it("a post's caption is edited and saved with what it was based on", async () => {
    const p = project();
    const data = studio(p);
    openProject(data);
    fireEvent.change(screen.getByLabelText('Caption: instagram reel'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('studio-save-post-post-1'));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.editPost', expect.objectContaining({ projectId: 'p1', postId: 'post-1', caption: 'Hello' })));
  });

  it('a stale answer shows the latest with the plain line', async () => {
    const p = project();
    const latest = project({ steps: { script: step('done'), review: step('approved'), assemble: step('done') } });
    const data = studio(p, { call: vi.fn(async () => ({ ok: true, value: { stale: true, message: "This changed on your computer; here's the latest.", latest } })) } as any);
    openProject(data);
    fireEvent.click(screen.getByTestId('studio-approve-review'));
    expect(await screen.findByText("This changed on your computer; here's the latest.")).toBeTruthy();
    expect(screen.queryByTestId('studio-approve-review')).toBeNull();
  });

  it('a video loads when tapped, and asks first with its size on mobile data', async () => {
    let asked: string | null = null;
    const data = studio(project(), {
      preview: vi.fn(async (_ref: any, confirm: (b: number) => Promise<boolean>) => {
        const ok = await confirm(34 * 1024 * 1024);
        return ok ? { ok: true, url: 'blob:video' } : { ok: false, reason: 'Not loaded on mobile data.' };
      }),
    } as any);
    openProject(data);
    expect(document.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByTestId('studio-media-shop/p1/output/v1-9x16.mp4'));
    asked = (await screen.findByText('This video is 34 MB. Load it on mobile data?')).textContent;
    expect(asked).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(document.querySelector('video')?.getAttribute('src')).toBe('blob:video'));
  });

  it('New project sends idea, brand and what to make', async () => {
    const data = studio(project(), { call: vi.fn(async () => ({ ok: true, value: { ok: true, projectId: 'new-1', requestId: 'r1' } })) } as any);
    render(<StudioScreen studio={data} lock={lock()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Idea'), { target: { value: 'A bakery tour' } });
    fireEvent.click(screen.getByLabelText('Shorts'));
    fireEvent.click(screen.getByRole('button', { name: 'Run project' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('content.startProject', { brandId: 'b1', idea: 'A bakery tour', make: ['video', 'shorts'] }));
  });

  it('offline: the Studio shows what it last had, and its buttons are off', () => {
    openProject(studio(project(), { readOnly: true, readOnlyReason: 'Your computer is offline since 14:02.' } as any));
    expect((screen.getByTestId('studio-approve-review') as HTMLButtonElement).disabled).toBe(true);
  });

  it('More no longer lists Miya Studio and the Calendar as "On your computer for now"', () => {
    expect(ON_COMPUTER_FOR_NOW).not.toContain('Miya Studio');
    expect(ON_COMPUTER_FOR_NOW).not.toContain('Calendar');
  });
});
