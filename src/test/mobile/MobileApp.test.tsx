import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MobileApp, PHONE_LOCK_KEY } from '../../mobile/MobileApp';
import { NOT_ALPHONSO_QR } from '../../mobile/phoneSession';

function signedIn(on = true) {
  let s = on;
  return { signedIn: () => s, email: () => 'ann@example.com', signIn: vi.fn(async () => { s = true; return { ok: true }; }), signOut: vi.fn(async () => { s = false; }), idToken: async () => (s ? 'tok' : null) };
}

function fakeLink(opts: { online: boolean; since?: number; snapshot?: any }) {
  const statusFns = new Set<any>();
  return {
    call: vi.fn(async (name: string) => (name === 'mirror.snapshot' ? { ok: !!opts.online, value: opts.snapshot } : { ok: true, value: '' })),
    onMirror: () => () => {},
    onStatus: (fn: any) => { statusFns.add(fn); return () => statusFns.delete(fn); },
    onNotice: () => () => {},
    online: () => opts.online,
    offlineSince: () => (opts.online ? null : opts.since ?? null),
    stop: vi.fn(),
    fire: () => statusFns.forEach((fn) => fn(opts.online, opts.since ?? null)),
  };
}

const request = { id: 'r1', commandId: 'c1', source: 'user', text: 'Research coffee kiosks', kind: 'normal', status: 'done', createdAtMs: 1, updatedAtMs: 1, steps: [] };

describe('the phone app', () => {
  beforeEach(() => localStorage.clear());

  it('a QR from another app is refused with a plain line', async () => {
    const pair = vi.fn(async () => ({ ok: false, reason: NOT_ALPHONSO_QR }));
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={{ confirm: async () => true }} pair={pair} connect={() => fakeLink({ online: true }) as any} />);
    fireEvent.change(await screen.findByLabelText('Pairing code'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    expect(await screen.findByText(NOT_ALPHONSO_QR)).toBeTruthy();
  });

  it('the Studio tab lists the projects the computer sent', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const content = { projects: [{ id: 'p1', brandId: 'b1', name: 'Bakery tour', updatedAtMs: 1, steps: {}, posts: [], media: [] }], brands: [{ id: 'b1', name: 'Shop' }], calendar: [] };
    const link = fakeLink({ online: true, snapshot: { requests: [], stepOutputs: {}, chat: [], computer: {}, content } });
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={{ confirm: async () => true }} connect={() => link as any} />);
    await act(async () => { link.fire(); });
    fireEvent.click(await screen.findByRole('tab', { name: 'Studio' }));
    expect(await screen.findByTestId('studio-project-p1')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(await screen.findByTestId('mobile-calendar')).toBeTruthy();
  });

  it("the Requests tab renders the desktop's board in one column", async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const link = fakeLink({ online: true, snapshot: { requests: [request], stepOutputs: {}, chat: [], computer: {} } });
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={{ confirm: async () => true }} connect={() => link as any} />);
    await act(async () => { link.fire(); });
    fireEvent.click(await screen.findByRole('tab', { name: 'Requests' }));
    expect(await screen.findAllByText('Research coffee kiosks')).toBeTruthy();
    expect(screen.getByTestId('mobile-requests').className).toContain('flex-col');
  });

  it('offline shows "Your computer is offline since 14:02." with the last known requests', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    localStorage.setItem('alphonso_phone_mirror_v1', JSON.stringify({ requests: [request], stepOutputs: {}, chat: [], computer: {} }));
    const since = new Date(2026, 9, 31, 14, 2).getTime();
    const link = fakeLink({ online: false, since });
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={{ confirm: async () => true }} connect={() => link as any} />);
    await act(async () => { link.fire(); });
    expect(await screen.findByText('Your computer is offline since 14:02.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Requests' }));
    expect((await screen.findAllByText('Research coffee kiosks')).length).toBeGreaterThan(0);
  });

  it('the app asks for Face ID / fingerprint on open when it is on, and the setting can be turned off', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const lock = { confirm: vi.fn(async () => false) };
    const { unmount } = render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={lock} connect={() => fakeLink({ online: true }) as any} />);
    await waitFor(() => expect(lock.confirm).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Chat' })).toBeNull();
    unmount();
    lock.confirm.mockResolvedValue(true);
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={lock} connect={() => fakeLink({ online: true }) as any} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'More' }));
    fireEvent.click(screen.getByLabelText('Ask for Face ID or fingerprint when opening'));
    expect(localStorage.getItem(PHONE_LOCK_KEY)).toBe('off');
  });
  const waiting = (effects: string[]) => ({ ...request, status: 'waiting_approval', steps: [{ stepId: 'marcus', agent: 'marcus', actionType: 'distribution_slack', effects, needs: [], status: 'waiting_approval' }] });
  function actions() {
    const fns = new Set<any>();
    return { onAction: (fn: any) => { fns.add(fn); return () => fns.delete(fn); }, fire: (a: any) => fns.forEach((fn) => fn(a)) };
  }

  it("a notification's Approve answers the computer and shows what it said", async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const link = fakeLink({ online: true, snapshot: { requests: [waiting(['read'])], stepOutputs: {}, chat: [], computer: {} } });
    link.call.mockImplementation(async (name: string) => (name === 'mirror.snapshot' ? { ok: true, value: { requests: [waiting(['read'])], stepOutputs: {}, chat: [], computer: {} } } : { ok: true, value: 'Approved. Marcus carries on.' }));
    const n = actions();
    const lock = { confirm: vi.fn(async () => true) };
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={lock} connect={() => link as any} onNotificationAction={n.onAction} />);
    await act(async () => { link.fire(); });
    await screen.findByRole('tab', { name: 'Chat' });
    lock.confirm.mockClear();
    await act(async () => { n.fire({ action: 'approve', requestId: 'r1', stepId: 'marcus' }); });
    expect(await screen.findByText('Approved. Marcus carries on.')).toBeTruthy();
    expect(link.call).toHaveBeenCalledWith('request.approveStep', { requestId: 'r1', stepId: 'marcus' });
    expect(lock.confirm).not.toHaveBeenCalled();
  });

  it('Open from a notification shows that request; approving a locked step there asks for Face ID / fingerprint', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const snap = { requests: [waiting(['publish_or_send'])], stepOutputs: {}, chat: [], computer: {} };
    const link = fakeLink({ online: true, snapshot: snap });
    const n = actions();
    const lock = { confirm: vi.fn(async () => true) };
    render(<MobileApp signIn={signedIn()} secrets={{ get: async () => null, set: async () => {} }} lock={lock} connect={() => link as any} onNotificationAction={n.onAction} />);
    await act(async () => { link.fire(); });
    await screen.findByRole('tab', { name: 'Chat' });
    lock.confirm.mockClear();
    await act(async () => { n.fire({ action: 'open', requestId: 'r1', stepId: 'marcus' }); });
    expect(screen.getByRole('tab', { name: 'Requests' }).getAttribute('aria-selected')).toBe('true');
    lock.confirm.mockResolvedValue(false);
    await act(async () => { n.fire({ action: 'approve', requestId: 'r1', stepId: 'marcus' }); });
    expect(lock.confirm).toHaveBeenCalledWith("Approve Marcus's step", { strict: true });
    expect(link.call).not.toHaveBeenCalledWith('request.approveStep', expect.anything());
  });
});
