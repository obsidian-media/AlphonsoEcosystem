// Phone app phase 3 part B (owner, 2026-11-02): Teams, Skills, Settings and Connectors on the phone.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamsScreen } from '../../mobile/screens/Teams';
import { SkillsScreen } from '../../mobile/screens/Skills';
import { SettingsScreen } from '../../mobile/screens/PhoneSettings';
import { ConnectorsScreen } from '../../mobile/screens/Connectors';
import { MoreScreen } from '../../mobile/screens/More';
import type { MoreData } from '../../services/phone/remoteData';

const settings = {
  approvalMode: true,
  effectApprovals: { read: false, write_own_work: false, change_project: true, run: true, spend: true, publish_or_send: true, delete: true },
  effectLabels: { read: 'Read and analyse', write_own_work: 'Create new files in the project folder', change_project: 'Change files', run: 'Run code and commands', spend: 'Spend money', publish_or_send: 'Send or publish', delete: 'Delete' },
  lockedEffects: ['spend', 'publish_or_send', 'delete'],
  paidModels: { allowed: false, monthlyCapUsd: 10, monthSpendUsd: 1.5, available: false, reason: 'Paid models are off.' },
  waitingExpiryDays: 7,
  zeroCostMode: true,
  showModelThinking: true,
  phoneNotify: { stepWaiting: true, planWaiting: true, finished: true, reviewDecision: true, boardroomEscalations: true },
  computerModel: 'llama3.2:3b',
  agents: [{ id: 'hector', name: 'Hector', provider: 'ollama', model: null, providerOnly: false }],
  providerChoices: [{ provider: 'ollama', label: 'Ollama', paid: false, models: ['llama3.2:3b'] }, { provider: 'nvidia_nim', label: 'NVIDIA NIM', paid: false, models: ['meta/llama-3.1-8b-instruct'] }],
};

function more(over: Partial<MoreData> & { answer?: any } = {}): MoreData & { call: any } {
  const { answer = { ok: true, value: {} }, ...rest } = over;
  return {
    memory: () => ({ decisions: [], cleanup: null }),
    projects: () => [],
    boardroom: () => ({ threads: [], messages: {} }),
    settings: () => settings as any,
    teams: () => [
      { id: 'user_research', name: 'Research', steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', needs: [] }], problems: [] },
      { id: 'user_bad', name: 'Bad', steps: [], problems: ['Gives Hector’s work to Nova (research_report).'] },
    ] as any,
    skills: () => ({ skills: [{ agent: 'hector', name: 'Research a question', useWhen: 'A question needs facts', builtIn: true, stats: 'Used 3 times' }], refused: [{ file: 'maria/research.md', reason: 'Maria doesn’t do research.' }] }) as any,
    connectors: () => [
      { id: 'slack', name: 'Slack', status: 'live', statusLabel: 'Working', enabled: true, needsKeys: false, lastCheck: { atMs: Date.now(), ok: true } },
      { id: 'telegram', name: 'Telegram Bridge', status: 'disabled', statusLabel: 'Not set up', enabled: false, needsKeys: true, lastCheck: null },
    ] as any,
    call: vi.fn(async () => answer),
    subscribe: () => () => {},
    readOnly: false,
    ...rest,
  } as any;
}
const lock = (ok = true) => ({ confirm: vi.fn(async () => ok) });
const offline = { readOnly: true, readOnlyReason: 'Your computer is offline since 14:02.' };

describe('Teams on the phone', () => {
  it('runs a team with the typed job and opens its request', async () => {
    const data = more({ answer: { ok: true, value: { ok: true, requestId: 'req-1' } } });
    const open = vi.fn();
    render(<TeamsScreen more={data} onOpenRequest={open} />);
    expect(screen.getByText('Hector: research_report')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Job for Research'), { target: { value: 'Find bakeries' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run Research' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('team.run', { id: 'user_research', text: 'Find bakeries' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open on the board' }));
    expect(open).toHaveBeenCalledWith('req-1');
  });

  it('a team with problems shows them and cannot run', () => {
    render(<TeamsScreen more={more()} onOpenRequest={vi.fn()} />);
    expect(screen.getByText(/Gives Hector/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run Bad' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Skills on the phone', () => {
  it('shows each agent’s skills with their record, and refused files', () => {
    render(<SkillsScreen more={more()} />);
    expect(screen.getByText('Research a question')).toBeTruthy();
    expect(screen.getByText('Used 3 times')).toBeTruthy();
    expect(screen.getByText(/Maria doesn/)).toBeTruthy();
  });
});

describe('Settings on the phone', () => {
  it('turning Approval Mode off asks for Face ID, then sends it confirmed', async () => {
    const data = more({ answer: { ok: true, value: { ok: true, latest: settings } } });
    const l = lock();
    render(<SettingsScreen more={data} lock={l} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Approval Mode' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('settings.set', { setting: 'approvalMode', value: false, base: true, confirmed: true }));
    expect(l.confirm).toHaveBeenCalledWith(expect.any(String), { strict: true });
  });

  it('when Face ID says no, nothing is sent', async () => {
    const data = more();
    render(<SettingsScreen more={data} lock={lock(false)} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Zero-Cost Mode' }));
    await screen.findByText(/didn.t confirm/);
    expect(data.call).not.toHaveBeenCalled();
  });

  it('asking more needs no Face ID', async () => {
    const data = more();
    const l = lock();
    render(<SettingsScreen more={data} lock={l} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Ask before: Read and analyse' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('settings.set', { setting: 'effect:read', value: true, base: false }));
    expect(l.confirm).not.toHaveBeenCalled();
  });

  it('locked effects are shown on and cannot be switched', () => {
    render(<SettingsScreen more={more()} lock={lock()} />);
    const spend = screen.getByRole('switch', { name: 'Ask before: Spend money' }) as HTMLButtonElement;
    expect(spend.getAttribute('aria-checked')).toBe('true');
    expect(spend.disabled).toBe(true);
  });

  it('an agent’s model is picked from what the computer offers', async () => {
    const data = more();
    render(<SettingsScreen more={data} lock={lock()} />);
    const select = screen.getByLabelText('Model for Hector') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Ollama (this computer’s model: llama3.2:3b)', 'NVIDIA NIM: meta/llama-3.1-8b-instruct']);
    fireEvent.change(select, { target: { value: 'nvidia_nim|meta/llama-3.1-8b-instruct' } });
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('agent.setModel', { agentId: 'hector', provider: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct', base: { provider: 'ollama', model: null } }));
  });

  it("Alphonso is offered providers only, since his model is Chat's", () => {
    const data = more({ settings: () => ({ ...settings, agents: [{ id: 'alphonso', name: 'Alphonso', provider: 'ollama', model: null, providerOnly: true }] }) } as any);
    render(<SettingsScreen more={data} lock={lock()} />);
    const select = screen.getByLabelText('Model for Alphonso') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['ollama|', 'nvidia_nim|']);
  });

  it('offline, switches are off and the reason shows', () => {
    render(<SettingsScreen more={more(offline)} lock={lock()} />);
    expect(screen.getByText(offline.readOnlyReason)).toBeTruthy();
    expect((screen.getByRole('switch', { name: 'Approval Mode' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('before the computer sends its settings, it says so', () => {
    render(<SettingsScreen more={more({ settings: () => null } as any)} lock={lock()} />);
    expect(screen.getByText(/Waiting for your computer/)).toBeTruthy();
  });
});

describe('Connectors on the phone', () => {
  it('switches a connector, and points to the computer to set one up', async () => {
    const data = more();
    render(<ConnectorsScreen more={data} />);
    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByText('Set up on your computer')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Slack' }));
    await waitFor(() => expect(data.call).toHaveBeenCalledWith('connector.setEnabled', { id: 'slack', enabled: false, base: true }));
  });

  it('offline, switches are off', () => {
    render(<ConnectorsScreen more={more(offline)} />);
    expect((screen.getByRole('switch', { name: 'Slack' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('More (part B)', () => {
  it('lists all seven pages and nothing is left on the computer', () => {
    render(<MoreScreen more={more()} lock={lock()} onOpenRequest={vi.fn()} lockEnabled onLockChange={vi.fn()} onSignOut={vi.fn()} />);
    for (const name of ['Memory', 'Projects', 'Boardroom', 'Teams', 'Skills', 'Settings', 'Connectors']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByText('On your computer for now')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(screen.getByRole('switch', { name: 'Slack' })).toBeTruthy();
  });
});
