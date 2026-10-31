// Hermes gateway (2026-10-30), Task 8: Connectors → Telegram warns about a connected profile's own Telegram.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const found = vi.fn();
const connected: Record<string, { name: string; folder: string }> = {};
vi.mock('../../../services/hermes/userProfiles', () => ({
  findUserProfiles: () => found(),
  connectedUserProfiles: () => connected,
}));

import { HermesMessagingWarning } from '../../../components/hermes/HermesMessagingWarning';

const profile = (name: string, platformsOn: string[]) => ({ name, folder: name, apiServer: { on: true, port: 8642 }, platformsOn, toolsetsOn: [], approvalsMode: null, readable: true, answering: true, warnings: [] });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(connected)) delete connected[k];
});

describe('HermesMessagingWarning', () => {
  it("warns when a profile an agent uses has its own Telegram", async () => {
    connected.hector = { name: 'work', folder: 'work' };
    found.mockResolvedValue([profile('work', ['telegram']), profile('home', ['telegram'])]);
    render(<HermesMessagingWarning platform="telegram" />);
    const warning = await screen.findByTestId('hermes-messaging-warning-telegram');
    expect(warning.textContent).toBe("Your Hermes profile work also has its own Telegram: messages there skip Alphonso's approvals.");
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
