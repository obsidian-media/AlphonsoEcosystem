// Phase 3c: Sign in buttons in Settings → Connectors, and Instagram Login.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const signIn = vi.fn();
const finishPastedSignIn = vi.fn();
const chooseMetaPage = vi.fn();
vi.mock('../../services/signInService', () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  finishPastedSignIn: (...a: unknown[]) => finishPastedSignIn(...a),
  chooseMetaPage: (...a: unknown[]) => chooseMetaPage(...a),
}));
const saved: Record<string, string> = {};
vi.mock('../../services/connectors/connectorAuth', () => ({
  getConnectorCredential: (_id: string, key: string) => saved[key] || '',
  saveConnectorCredential: (_id: string, key: string, value: string) => { saved[key] = value; },
}));

import { SignInButton, InstagramLoginSection } from '../../components/SignInPanel';

beforeEach(() => {
  localStorage.clear();
  [signIn, finishPastedSignIn, chooseMetaPage].forEach((f) => f.mockReset());
  for (const k of Object.keys(saved)) delete saved[k];
});

describe('SignInButton', () => {
  it('each service has a Sign in button with its steps', () => {
    render(<><SignInButton service="youtube" /><SignInButton service="meta" /><SignInButton service="instagram" /></>);
    expect(screen.getByRole('button', { name: 'Sign in to YouTube' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in to Facebook' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in with Instagram' })).toBeTruthy();
    expect(screen.getAllByText(/http:\/\/localhost:8085\/callback/).length).toBeGreaterThan(0);
  });

  it('signs in and says so', async () => {
    signIn.mockResolvedValue({ ok: true });
    render(<SignInButton service="youtube" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to YouTube' }));
    expect(await screen.findByText('Signed in to YouTube.')).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith('youtube');
  });

  it('while waiting, a pasted address finishes the sign-in', async () => {
    signIn.mockImplementation(() => new Promise(() => undefined));
    finishPastedSignIn.mockResolvedValue({ ok: true });
    render(<SignInButton service="instagram" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Instagram' }));
    fireEvent.change(await screen.findByLabelText('The address the browser ended on'), { target: { value: 'http://localhost:8087/callback?code=x&state=y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
    await waitFor(() => expect(finishPastedSignIn).toHaveBeenCalledWith('instagram', 'http://localhost:8087/callback?code=x&state=y'));
    expect(await screen.findByText('Signed in to Instagram.')).toBeTruthy();
  });

  it('shows a refusal', async () => {
    signIn.mockResolvedValue({ ok: false, reason: 'Fill in the App ID and App Secret first.' });
    render(<SignInButton service="meta" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Facebook' }));
    expect(await screen.findByText('Fill in the App ID and App Secret first.')).toBeTruthy();
  });

  it('with several Facebook Pages, asks which one', async () => {
    const pages = [{ id: '1', name: 'Shop', accessToken: 'a' }, { id: '2', name: 'Blog', accessToken: 'b' }];
    signIn.mockResolvedValue({ ok: true, pages });
    render(<SignInButton service="meta" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Facebook' }));
    fireEvent.change(await screen.findByLabelText('Facebook Page to post to'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this Page' }));
    expect(chooseMetaPage).toHaveBeenCalledWith(pages[1]);
  });
});

// Final review: the first wait ending later must not undo a sign-in finished by pasting.
it('a pasted sign-in stays signed in when the browser wait ends later', async () => {
  let endWait: (v: unknown) => void = () => undefined;
  signIn.mockImplementation(() => new Promise((r) => { endWait = r; }));
  finishPastedSignIn.mockResolvedValue({ ok: true });
  render(<SignInButton service="instagram" />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Instagram' }));
  fireEvent.change(await screen.findByLabelText('The address the browser ended on'), { target: { value: 'http://localhost:8087/callback?code=x&state=y' } });
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
  expect(await screen.findByText('Signed in to Instagram.')).toBeTruthy();
  endWait({ ok: false, reason: 'No answer from the browser within 5 minutes.' });
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.getByRole('status').textContent).toBe('Signed in to Instagram.');
});

it('a wrong pasted address says why and still waits for the browser', async () => {
  let endWait: (v: unknown) => void = () => undefined;
  signIn.mockImplementation(() => new Promise((r) => { endWait = r; }));
  finishPastedSignIn.mockResolvedValue({ ok: false, reason: 'That is not the address the browser ended on.' });
  render(<SignInButton service="youtube" />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to YouTube' }));
  fireEvent.change(await screen.findByLabelText('The address the browser ended on'), { target: { value: 'nonsense' } });
  fireEvent.click(screen.getByRole('button', { name: 'Finish signing in' }));
  expect(await screen.findByText('That is not the address the browser ended on.')).toBeTruthy();
  expect(screen.getByLabelText('The address the browser ended on')).toBeTruthy();
  endWait({ ok: true });
  expect(await screen.findByText('Signed in to YouTube.')).toBeTruthy();
});

it('a note with the sign-in is shown', async () => {
  signIn.mockResolvedValue({ ok: true, note: 'Signed in, but this account has no Facebook Page.' });
  render(<SignInButton service="meta" />);
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to Facebook' }));
  expect(await screen.findByText('Signed in, but this account has no Facebook Page.')).toBeTruthy();
});

describe('InstagramLoginSection', () => {
  it('saves the Instagram app keys and has the route choice', () => {
    render(<InstagramLoginSection />);
    fireEvent.change(screen.getByLabelText('Instagram App ID'), { target: { value: 'iga' } });
    fireEvent.change(screen.getByLabelText('Instagram App Secret'), { target: { value: 'igs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Instagram app' }));
    expect(saved).toMatchObject({ INSTAGRAM_APP_ID: 'iga', INSTAGRAM_APP_SECRET: 'igs' });
    const route = screen.getByLabelText('Post to Instagram') as HTMLSelectElement;
    fireEvent.change(route, { target: { value: 'instagram_login' } });
    expect(localStorage.getItem('alphonso_instagram_route_v1')).toBe('instagram_login');
  });
});
