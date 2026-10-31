// Hermes gateway (2026-10-30), Task 8: Hermes profiles in Settings → Agents.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../agents/agentRegistry', () => ({ listAgentProfiles: () => [{ id: 'hector', name: 'Hector' }, { id: 'nova', name: 'Nova' }] }));
const own: Array<{ agent: string; running: boolean }> = [];
const setUpProfile = vi.fn();
const removeProfile = vi.fn(async () => ({ ok: true }));
const setProfileModel = vi.fn(async () => ({ ok: true }));
vi.mock('../../../services/hermes/hermesProfiles', () => ({
  listOwnProfiles: async () => own.map((p) => ({ ...p, port: 8700, url: 'http://127.0.0.1:8700', folder: 'f' })),
  setUpProfile: (...a: unknown[]) => setUpProfile(...a),
  removeProfile: (...a: unknown[]) => removeProfile(...(a as [])),
  setProfileModel: (...a: unknown[]) => setProfileModel(...(a as [])),
  profileModelChoices: async () => [{ kind: 'ollama', model: 'qwen2.5:1.5b' }, { kind: 'openrouter', model: 'openrouter/free' }],
}));
const saved: Record<string, { kind: string; model: string }> = {};
vi.mock('../../../services/hermes/profileModels', () => ({ savedProfileModel: (a: string) => saved[a] || null }));
const found = vi.fn();
const connectUserProfile = vi.fn(async () => ({ ok: true }));
vi.mock('../../../services/hermes/userProfiles', async () => {
  const real = await vi.importActual<typeof import('../../../services/hermes/userProfiles')>('../../../services/hermes/userProfiles');
  return {
    ENV_NOT_CHECKED: real.ENV_NOT_CHECKED,
    findUserProfiles: () => found(),
    connectUserProfile: (...a: unknown[]) => connectUserProfile(...(a as [])),
    userProfileFor: () => null,
  };
});
const setAgentProvider = vi.fn();
vi.mock('../../../services/modelSelectionService', () => ({ setAgentProvider: (...a: unknown[]) => setAgentProvider(...a) }));

import { HermesProfilesSection } from '../../../components/hermes/HermesProfilesSection';

beforeEach(() => {
  vi.clearAllMocks();
  own.length = 0;
  for (const k of Object.keys(saved)) delete saved[k];
  found.mockResolvedValue([]);
});

describe('HermesProfilesSection', () => {
  it('offers to set up a profile for each agent, and sets one up', async () => {
    setUpProfile.mockImplementation(async () => { own.push({ agent: 'hector', running: false }); saved.hector = { kind: 'ollama', model: 'qwen2.5:1.5b' }; return { ok: true }; });
    render(<HermesProfilesSection />);
    const button = await screen.findByTestId('hermes-setup-hector');
    expect(button.textContent).toBe('Set up a Hermes profile for Hector');
    fireEvent.click(button);
    await waitFor(() => expect(setUpProfile).toHaveBeenCalledWith('hector'));
    expect((await screen.findByTestId('hermes-state-hector')).textContent).toBe('Stopped');
  });

  it("shows a profile's state and model, with the small-model warning, and changes the model", async () => {
    own.push({ agent: 'hector', running: true });
    saved.hector = { kind: 'ollama', model: 'qwen2.5:1.5b' };
    render(<HermesProfilesSection />);
    expect((await screen.findByTestId('hermes-state-hector')).textContent).toBe('Running');
    const picker = screen.getByTestId('hermes-model-hector') as HTMLSelectElement;
    expect(picker.value).toBe('ollama:qwen2.5:1.5b');
    expect(screen.getByTestId('small-model-notice')).toBeTruthy();
    fireEvent.change(picker, { target: { value: 'openrouter:openrouter/free' } });
    await waitFor(() => expect(setProfileModel).toHaveBeenCalledWith('hector', { kind: 'openrouter', model: 'openrouter/free' }));
  });

  it('asks before removing a profile', async () => {
    own.push({ agent: 'hector', running: false });
    render(<HermesProfilesSection />);
    fireEvent.click(await screen.findByTestId('hermes-remove-hector'));
    expect(removeProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove Hector's Hermes profile\?/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('hermes-remove-confirm-hector'));
    await waitFor(() => expect(removeProfile).toHaveBeenCalledWith('hector'));
  });

  it("finds the user's own profiles with their warnings, and connects one to an agent", async () => {
    found.mockResolvedValue([{ name: 'work', folder: 'C:/h/profiles/work', apiServer: { on: true, port: 8642 }, platformsOn: ['telegram'], toolsetsOn: [], approvalsMode: null, readable: true, answering: true,
      warnings: ["Messages to this profile's own Telegram skip Alphonso's approvals.", 'This profile can change things without asking.'] }]);
    render(<HermesProfilesSection />);
    fireEvent.click(await screen.findByTestId('hermes-find'));
    expect((await screen.findByTestId('hermes-user-work')).textContent).toContain('work');
    const warnings = screen.getByTestId('hermes-warning-work').textContent || '';
    expect(warnings).toContain("own Telegram skip Alphonso's approvals");
    expect(warnings).toContain('can change things without asking');
    fireEvent.change(screen.getByTestId('hermes-connect-agent-work'), { target: { value: 'nova' } });
    fireEvent.change(screen.getByTestId('hermes-connect-key-work'), { target: { value: 'sixteen-chars-key' } });
    fireEvent.click(screen.getByTestId('hermes-connect-work'));
    await waitFor(() => expect(connectUserProfile).toHaveBeenCalledWith('work', 'nova', 'sixteen-chars-key'));
    expect(setAgentProvider).toHaveBeenCalledWith('nova', { provider: 'hermes' });
  });

  it('says what went wrong in plain words, without Hermes jargon', async () => {
    setUpProfile.mockResolvedValue({ ok: false, reason: 'Install Hermes Agent in Runtime Hub first.' });
    const { container } = render(<HermesProfilesSection />);
    fireEvent.click(await screen.findByTestId('hermes-setup-hector'));
    expect(await screen.findByText('Install Hermes Agent in Runtime Hub first.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('hermes-find'));
    await waitFor(() => expect(found).toHaveBeenCalled());
    expect(container.textContent).not.toMatch(/gateway|daemon|toolset/i);
  });
});
