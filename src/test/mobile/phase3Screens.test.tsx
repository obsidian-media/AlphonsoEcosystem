// Phone app phase 3 part A (owner, 2026-11-02): Memory, Projects and Boardroom screens on the phone.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryScreen } from '../../mobile/screens/Memory';
import { ProjectsScreen } from '../../mobile/screens/Projects';
import { BoardroomScreen } from '../../mobile/screens/Boardroom';
import { MoreScreen, ON_COMPUTER_FOR_NOW } from '../../mobile/screens/More';
import { MASKED_LINE } from '../../services/phone/phase3Mirror';
import type { MoreData } from '../../services/phone/remoteData';

const decision = (id: string, text: string) => ({ id, kind: 'decision', text, why: 'because', topics: [], appliesTo: [], source: { surface: 'chat' }, status: 'active', atMs: 1 });
const message = (id: string, over: any = {}) => ({ id, threadId: 't1', speaker: 'maria', content: `text ${id}`, kind: 'message', seq: Number(id.replace(/\D/g, '')) || 1, acknowledged: false, confirmed: false, approvalRequired: false, ...over });

function more(over: Partial<MoreData> & { answer?: any } = {}): MoreData & { call: any } {
  const { answer = { ok: true, value: {} }, ...rest } = over;
  return {
    memory: () => ({ decisions: [decision('d1', 'Post on Tuesdays')], cleanup: { setId: 's1', requestId: 'r1', stepId: 'echo', proposals: [{ id: 'p1', kind: 'drop', ids: ['d9'], reason: 'Old and replaced.' }] } }),
    projects: () => [{ id: 'p1', name: 'Shop', intake: { name: 'Shop', description: 'An online shop' }, runs: [{ requestId: 'r7', atMs: 1 }], createdAtMs: 1, latestRequestId: 'r7' }] as any,
    boardroom: () => ({
      threads: [{ id: 't0', topic: 'Old', updatedAtMs: 1 }, { id: 't1', topic: 'Launch', updatedAtMs: 9, governance: { summary: 'ok' } }] as any,
      messages: { t1: [message('m5'), message('m6', { kind: 'escalation', speaker: 'boardroom' }), message('m7', { content: MASKED_LINE, masked: true })] as any, t0: [] },
    }),
    call: vi.fn(async () => answer),
    subscribe: () => () => {},
    readOnly: false,
    ...rest,
  } as any;
}
const lock = (ok = true) => ({ confirm: vi.fn(async () => ok) });
const offline = { readOnly: true, readOnlyReason: 'Your computer is offline since 14:02.' };

describe('Memory on the phone', () => {
  it('lists decisions and searches on the computer', async () => {
    const data = more({ answer: { ok: true, value: [decision('d2', 'Use Slack #news')] } });
    render(<MemoryScreen more={data} />);
    expect(screen.getByText('Post on Tuesdays')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search what Echo remembers'), { target: { value: 'slack' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('memory.search', { query: 'slack' }));
    expect(await screen.findByText('Use Slack #news')).toBeTruthy();
  });

  it("Echo's clean-up shows Apply and Dismiss with its set", async () => {
    const data = more();
    render(<MemoryScreen more={data} />);
    expect(screen.getByText('Old and replaced.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('memory.applyCleanup', { requestId: 'r1', stepId: 'echo', setId: 's1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('memory.dismissCleanup', { requestId: 'r1', stepId: 'echo', setId: 's1' }));
  });

  it('offline: the offline line, Search and Apply off', () => {
    render(<MemoryScreen more={more(offline)} />);
    expect(screen.getByText('Your computer is offline since 14:02.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Projects on the phone', () => {
  it('Start starts the project, and its run opens on the board', async () => {
    const data = more();
    const onOpenRequest = vi.fn();
    render(<ProjectsScreen more={data} onOpenRequest={onOpenRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('project.start', { id: 'p1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the latest run' }));
    expect(onOpenRequest).toHaveBeenCalledWith('r7');
  });

  it('New project sends the intake', async () => {
    const data = more();
    render(<ProjectsScreen more={data} onOpenRequest={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Blog' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A cooking blog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('project.create', { intake: expect.objectContaining({ name: 'Blog', description: 'A cooking blog', priority: 'medium' }) }));
  });

  it('offline: Start and New project are off', () => {
    render(<ProjectsScreen more={more(offline)} onOpenRequest={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'New project' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Your computer is offline since 14:02.')).toBeTruthy();
  });
});

describe('Boardroom on the phone', () => {
  const openLaunch = (data: MoreData, l = lock()) => {
    render(<BoardroomScreen more={data} lock={l} />);
    fireEvent.click(screen.getByRole('button', { name: /Launch/ }));
  };

  it('threads are listed newest first', () => {
    render(<BoardroomScreen more={more()} lock={lock()} />);
    const items = screen.getAllByTestId(/^boardroom-thread-/);
    expect(items.map((i) => i.getAttribute('data-testid'))).toEqual(['boardroom-thread-t1', 'boardroom-thread-t0']);
  });

  it('a new thread is started with its topic', async () => {
    const data = more();
    render(<BoardroomScreen more={data} lock={lock()} />);
    fireEvent.change(screen.getByLabelText('New thread topic'), { target: { value: 'Pricing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start thread' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.createThread', { topic: 'Pricing' }));
  });

  it('a message is sent with a fresh message id', async () => {
    const data = more();
    openLaunch(data);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '@maria thoughts?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.send', { threadId: 't1', text: '@maria thoughts?', messageId: expect.stringMatching(/^msg-/) }));
  });

  it('Show earlier asks for the messages before the oldest shown', async () => {
    const data = more({ answer: { ok: true, value: [message('m2', { content: 'an older one' })] } });
    openLaunch(data);
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.earlier', { threadId: 't1', beforeSeq: 5 }));
    expect(await screen.findByText('an older one')).toBeTruthy();
  });

  it('thread actions call Conclude, Distribute and Creative brief', async () => {
    const data = more();
    openLaunch(data);
    fireEvent.click(screen.getByRole('button', { name: 'Conclude' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.conclude', { threadId: 't1' }));
    fireEvent.change(screen.getByLabelText('Slack channel'), { target: { value: '#news' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post to Slack' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.distribute', { threadId: 't1', mode: 'slack', channel: '#news' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review only' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.distribute', { threadId: 't1', mode: 'review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Creative brief' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.creativeBrief', { threadId: 't1' }));
  });

  it('an escalation can be acknowledged', async () => {
    const data = more();
    openLaunch(data);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.acknowledge', { messageId: 'm6' }));
  });

  it('a masked message is revealed only after Face ID or the fingerprint', async () => {
    const data = more({ answer: { ok: true, value: message('m7', { content: 'the real text', confirmed: true }) } });
    const l = lock();
    openLaunch(data, l);
    expect(screen.getByText(MASKED_LINE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('boardroom.reveal', { messageId: 'm7' }));
    expect(l.confirm).toHaveBeenCalledWith(expect.any(String), { strict: true });
    expect(await screen.findByText('the real text')).toBeTruthy();
  });

  it('a refused Face ID reveals nothing', async () => {
    const data = more();
    const l = lock(false);
    openLaunch(data, l);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await waitFor(() => expect(l.confirm).toHaveBeenCalled());
    expect(data.call).not.toHaveBeenCalledWith('boardroom.reveal', expect.anything());
  });

  it('offline: the offline line, Send and the actions off', () => {
    openLaunch(more(offline));
    expect(screen.getByText('Your computer is offline since 14:02.')).toBeTruthy();
    for (const name of ['Send', 'Conclude', 'Creative brief', 'Reveal', 'Acknowledge']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('opens straight on a thread a notice named', () => {
    render(<BoardroomScreen more={more()} lock={lock()} openThreadId="t1" />);
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });
});

describe('More', () => {
  it('opens Memory, Projects and Boardroom', () => {
    expect(ON_COMPUTER_FOR_NOW).toEqual([]);
    render(<MoreScreen more={more()} lock={lock()} onOpenRequest={vi.fn()} lockEnabled onLockChange={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Boardroom' }));
    expect(screen.getAllByTestId(/^boardroom-thread-/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Memory' }));
    expect(screen.getByText('Post on Tuesdays')).toBeTruthy();
  });
});
