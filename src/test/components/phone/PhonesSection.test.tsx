import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { phones, link } = vi.hoisted(() => {
  const phones = [{ deviceId: 'ph-1', name: 'Ann iPhone', publicKey: 'pk', pairedAtMs: 1, lastSeenMs: Date.now() - 5 * 60_000 }];
  const link = {
  listPhones: vi.fn(() => [...phones]),
  pairingQr: vi.fn(async () => 'alphonso-pair:{"x":1}'),
  removePhone: vi.fn(async (id: string) => { phones.splice(phones.findIndex((p) => p.deviceId === id), 1); }),
  phoneAccessOn: vi.fn(() => true),
  setPhoneAccess: vi.fn(),
  startPhoneLink: vi.fn(() => () => {}),
  webSocketFactory: vi.fn(),
};
  return { phones, link };
});
vi.mock('../../../services/phone/phoneLink', () => link);
const clipboard = vi.hoisted(() => ({ writeClipboard: vi.fn(async () => undefined) }));
vi.mock('../../../services/browserAutomationService', () => clipboard);

import { setPhoneSignInProvider } from '../../../services/phone/phoneAccount';
import { PhonesSection } from '../../../components/phone/PhonesSection';

function provider(signedIn: boolean) {
  let on = signedIn;
  return {
    signedIn: () => on,
    email: () => (on ? 'ann@example.com' : null),
    signIn: vi.fn(async () => { on = true; return { ok: true }; }),
    signOut: vi.fn(async () => { on = false; }),
    idToken: vi.fn(async () => (on ? 'tok' : null)),
  };
}

describe('PhonesSection', () => {
  beforeEach(() => { vi.stubEnv('VITE_PHONE_RELAY_URL', 'wss://relay.test/link'); });
  afterEach(() => { vi.unstubAllEnvs(); setPhoneSignInProvider(null); vi.clearAllMocks(); });

  it("says plainly when this build can't reach phones", () => {
    vi.stubEnv('VITE_PHONE_RELAY_URL', '');
    render(<PhonesSection />);
    expect(screen.getByText(/Phone access isn't available in this build yet/)).toBeTruthy();
  });

  it('shows the QR after sign-in', async () => {
    const p = provider(false);
    setPhoneSignInProvider(p);
    render(<PhonesSection />);
    fireEvent.click(screen.getByRole('button', { name: /Sign in to pair a phone/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Google/ }));
    await waitFor(() => expect(p.signIn).toHaveBeenCalledWith('google', undefined));
    fireEvent.click(await screen.findByRole('button', { name: /Pair a phone/ }));
    expect(await screen.findByText(/Scan this with the Alphonso app/)).toBeTruthy();
    expect(screen.getByTestId('phone-pairing-qr')).toBeTruthy();
    expect(link.startPhoneLink).toHaveBeenCalled();
  });

  it("shows the pairing code as text with a Copy button, for a phone that can't scan", async () => {
    setPhoneSignInProvider(provider(true));
    render(<PhonesSection />);
    fireEvent.click(await screen.findByRole('button', { name: /Pair a phone/ }));
    const code = await screen.findByTestId('phone-pairing-code');
    expect((code as HTMLInputElement).value).toBe('alphonso-pair:{"x":1}');
    fireEvent.click(screen.getByRole('button', { name: 'Copy the code' }));
    await waitFor(() => expect(clipboard.writeClipboard).toHaveBeenCalledWith('alphonso-pair:{"x":1}'));
    expect(await screen.findByText('Copied.')).toBeTruthy();
  });

  it('lists phones with last use', () => {
    setPhoneSignInProvider(provider(true));
    render(<PhonesSection />);
    expect(screen.getByText('Ann iPhone')).toBeTruthy();
    expect(screen.getByText(/Last used 5 min ago/)).toBeTruthy();
  });

  it('Remove asks first, then removes', async () => {
    setPhoneSignInProvider(provider(true));
    render(<PhonesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(link.removePhone).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove Ann iPhone\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(link.removePhone).toHaveBeenCalledWith('ph-1', expect.anything()));
  });
});
