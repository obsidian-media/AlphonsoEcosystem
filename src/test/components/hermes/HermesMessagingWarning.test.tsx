// Hermes gateway (2026-10-30), Task 8: Connectors → Telegram warns about a connected profile's own Telegram.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const found = vi.fn();
const connected: Record<string, { name: string; folder: string }> = {};
const listeners = new Set<() => void>();
vi.mock('../../../services/hermes/userProfiles', () => ({
  findUserProfiles: () => found(),
  connectedUserProfiles: () => connected,
  onUserProfilesChanged: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
}));

import { HermesMessagingWarning } from '../../../components/hermes/HermesMessagingWarning';

const profile = (name: string, platformsOn: string[]) => ({ name, folder: name, apiServer: { on: true, port: 8642 }, platformsOn, toolsetsOn: [], approvalsMode: null, readable: true, answering: true, warnings: [] });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(connected)) delete connected[k];
  listeners.clear();
});

describe('HermesMessagingWarning', () => {
  it("warns when a profile an agent uses has its own Telegram", async () => {
    connected.hector = { name: 'work', folder: 'work' };
    found.mockResolvedValue([profile('work', ['telegram']), profile('home', ['telegram'])]);
    render(<HermesMessagingWarning platform="telegram" />);
    const warning = await screen.findByTestId('hermes-messaging-warning-telegram');
    expect(warning.textContent).toBe("Your Hermes profile work also has its own Telegram: messages there skip Alphonso's approvals.");
  });

  // QA, 2026-10-31 (desktop run): connecting a profile on the same page showed no warning until
  // you left Connectors and came back.
  it('appears as soon as a profile with its own Telegram is connected, without leaving the page', async () => {
    found.mockResolvedValue([profile('work', ['telegram'])]);
    render(<HermesMessagingWarning platform="telegram" />);
    expect(screen.queryByTestId('hermes-messaging-warning-telegram')).toBeNull();
    connected.alphonso = { name: 'work', folder: 'work' };
    act(() => { for (const fn of listeners) fn(); });
    expect(await screen.findByTestId('hermes-messaging-warning-telegram')).toBeTruthy();
  });

  it('says nothing when no connected profile has it, or none is connected', async () => {
    connected.hector = { name: 'work', folder: 'work' };
    found.mockResolvedValue([profile('work', ['discord'])]);
    const { container } = render(<HermesMessagingWarning platform="telegram" />);
    await waitFor(() => expect(found).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    delete connected.hector;
    found.mockClear();
    render(<HermesMessagingWarning platform="telegram" />);
    expect(found).not.toHaveBeenCalled();
  });
});
