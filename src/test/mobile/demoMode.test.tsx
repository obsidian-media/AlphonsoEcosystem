// Phone phase 3 part C (owner, 2026-11-02): "Try a demo" on the sign-in screen, for Apple's reviewers
// and anyone before pairing. Marked on every screen; it sends nothing and leaves nothing behind.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileApp } from '../../mobile/MobileApp';
import { DEMO_BANNER, DEMO_REFUSED } from '../../mobile/demo/demoLink';

function signedOut() {
  let s = false;
  return { signedIn: () => s, email: () => 'ann@example.com', signIn: vi.fn(async () => { s = true; return { ok: true }; }), signOut: vi.fn(async () => { s = false; }), idToken: async () => (s ? 'tok' : null) };
}
const secrets = { get: async () => null, set: async () => {} };
const lock = { confirm: vi.fn(async () => true) };

function realLink() {
  return { call: vi.fn(async () => ({ ok: true, value: { requests: [], stepOutputs: {}, chat: [], computer: {} } })), onMirror: () => () => {}, onStatus: () => () => {}, onNotice: () => () => {}, online: () => true, offlineSince: () => null, stop: vi.fn() };
}

async function openDemo(connect = vi.fn(() => realLink() as any)) {
  render(<MobileApp signIn={signedOut()} secrets={secrets} lock={lock} connect={connect} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try a demo' }));
  await screen.findByText(DEMO_BANNER);
  return connect;
}

describe('Try a demo', () => {
  beforeEach(() => { localStorage.clear(); lock.confirm.mockClear(); });

  it('the sign-in screen offers it', async () => {
    render(<MobileApp signIn={signedOut()} secrets={secrets} lock={lock} />);
    expect(await screen.findByRole('button', { name: 'Try a demo' })).toBeTruthy();
  });

  it('every tab says it is a demo', async () => {
    await openDemo();
    for (const tab of ['Chat', 'Requests', 'Studio', 'Calendar', 'More']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByText(DEMO_BANNER)).toBeTruthy();
    }
  });

  it('Approve on the waiting send is refused, and asks for no Face ID', async () => {
    await openDemo();
    fireEvent.click(screen.getByRole('tab', { name: 'Requests' }));
    fireEvent.click(await screen.findByRole('button', { name: /Approve and carry on: Marcus/ }));
    expect(await screen.findByText(DEMO_REFUSED)).toBeTruthy();
    expect(lock.confirm).not.toHaveBeenCalledWith(expect.stringMatching(/Approve|Send/), expect.anything());
  });

  it("More's pages ask to pair a computer", async () => {
    await openDemo();
    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByText('Pair your computer to use this.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('leaving it returns to sign-in and keeps nothing; signing in then uses the real computer', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', computerName: 'Studio PC' }));
    const connect = await openDemo();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave demo' }));
    expect(await screen.findByRole('button', { name: 'Try a demo' })).toBeTruthy();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('alphonso_phone') && k !== 'alphonso_phone_pairing_v1')).toEqual([]);
    expect(connect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ann@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }));
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(DEMO_BANNER)).toBeNull();
  });
});
