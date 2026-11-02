// Phone phase 3 part C (owner, 2026-11-02): Apple requires that an account made in the app can be
// deleted from inside it (guideline 5.1.1(v)). Face ID first; the relay deletes it; the phone forgets.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { deleteAccount, DELETE_ACCOUNT_LINE } from '../../mobile/phoneSession';
import { MoreScreen } from '../../mobile/screens/More';

const auth = { idToken: async () => 'tok-ann' };
const secrets = () => ({ get: vi.fn(async () => 'x'), set: vi.fn(async () => {}) });

describe('deleting the account from the phone', () => {
  beforeEach(() => localStorage.clear());

  it('asks the relay to delete it, then forgets the pairing, the keys and the kept data', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', JSON.stringify({ deviceId: 'ph', relayUrl: 'wss://relay.example' }));
    localStorage.setItem('alphonso_phone_mirror_v1', '{}');
    const s = secrets();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await deleteAccount({ auth, secrets: s, relayUrl: 'wss://relay.example', fetchImpl });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('https://relay.example/account', expect.objectContaining({ method: 'DELETE', headers: { authorization: 'Bearer tok-ann' } }));
    expect(Object.keys(localStorage).filter((k) => k.startsWith('alphonso_phone'))).toEqual([]);
    expect(s.set).toHaveBeenCalledWith('alphonso_phone_private_key', '');
  });

  it('keeps everything when the relay refuses, and says why', async () => {
    localStorage.setItem('alphonso_phone_pairing_v1', '{}');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Sign in again.' }), { status: 400 }));
    const result = await deleteAccount({ auth, secrets: secrets(), relayUrl: 'wss://relay.example', fetchImpl });
    expect(result).toEqual({ ok: false, reason: 'Sign in again.' });
    expect(localStorage.getItem('alphonso_phone_pairing_v1')).toBe('{}');
  });

  it('needs a relay address and a sign-in', async () => {
    expect((await deleteAccount({ auth, secrets: secrets(), relayUrl: null })).ok).toBe(false);
    expect((await deleteAccount({ auth: { idToken: async () => null }, secrets: secrets(), relayUrl: 'wss://relay.example' })).ok).toBe(false);
  });

  it('More asks first, then Face ID, then deletes', async () => {
    const onDeleteAccount = vi.fn(async () => ({ ok: true }));
    const lock = { confirm: vi.fn(async () => true) };
    const more: any = { readOnly: false, subscribe: () => () => {} };
    render(<MoreScreen more={more} lock={lock} onOpenRequest={() => {}} lockEnabled onLockChange={() => {}} onSignOut={() => {}} onDeleteAccount={onDeleteAccount} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByText(DELETE_ACCOUNT_LINE)).toBeTruthy();
    expect(onDeleteAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(1));
    expect(lock.confirm).toHaveBeenCalledWith('Delete your Alphonso account', { strict: true });
  });

  it('nothing is deleted when Face ID is refused', async () => {
    const onDeleteAccount = vi.fn(async () => ({ ok: true }));
    const more: any = { readOnly: false, subscribe: () => () => {} };
    render(<MoreScreen more={more} lock={{ confirm: async () => false }} onOpenRequest={() => {}} lockEnabled onLockChange={() => {}} onSignOut={() => {}} onDeleteAccount={onDeleteAccount} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete it' }));
    await waitFor(() => expect(screen.getByText(/Not deleted/)).toBeTruthy());
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });
});
