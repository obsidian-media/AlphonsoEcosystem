// Phone app phase 3 part B (2026-11-02): settings, models, teams and connectors from the phone.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const submitSteps = vi.fn();
vi.mock('../../../services/jose/submitToJose', () => ({ submitStepsToJose: (input: any) => submitSteps(input) }));
vi.mock('../../../services/jose/joseModels', () => ({ listInstalledModels: vi.fn(async () => ['llama3.2:3b']) }));
vi.mock('../../../services/connectors/nvidiaNimConnector', () => ({ isNvidiaConfigured: () => true, listNvidiaModels: vi.fn(async () => ['meta/llama-3.1-8b-instruct']) }));
vi.mock('../../../services/connectors/geminiConnector', () => ({ isGeminiConfigured: () => false }));
vi.mock('../../../services/connectors/openRouterConnector', () => ({ isOpenRouterConfigured: () => false, listOpenRouterModels: vi.fn(async () => []) }));

import { PHASE3B_CALLS, NEEDS_CONFIRM, ALWAYS_ASKS } from '../../../services/phone/phase3bCalls';
import { STALE } from '../../../services/phone/phase3Calls';
import { refreshModelChoices, resetPhase3bMirrorForTests } from '../../../services/phone/phase3bMirror';
import { getAgentProvider } from '../../../services/modelSelectionService';
import { saveUserTemplate } from '../../../services/jose/joseUserTemplates';
import { isConnectorAuthenticated } from '../../../services/connectors/connectorAuth';

const saved = () => JSON.parse(localStorage.getItem('alphonso_settings') || '{}');
const call = (name: string, args: Record<string, unknown>) => (PHASE3B_CALLS as any)[name](args, 'phone-1');

beforeEach(() => { localStorage.clear(); submitSteps.mockReset(); resetPhase3bMirrorForTests(); });

describe('settings.set', () => {
  it('turning Approval Mode off needs the phone confirmed', async () => {
    await expect(call('settings.set', { setting: 'approvalMode', value: false, base: true })).rejects.toThrow(NEEDS_CONFIRM);
    expect(saved().approvalMode).toBeUndefined();
    const r: any = await call('settings.set', { setting: 'approvalMode', value: false, base: true, confirmed: true });
    expect(saved().approvalMode).toBe(false);
    expect(r.latest.approvalMode).toBe(false);
  });

  it('asking more needs nothing extra', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: false, zeroCostMode: false }));
    await call('settings.set', { setting: 'approvalMode', value: true, base: false });
    await call('settings.set', { setting: 'zeroCostMode', value: true, base: false });
    expect(saved()).toMatchObject({ approvalMode: true, zeroCostMode: true });
  });

  it('Zero-Cost Mode off, paid models on and a higher cap need confirming; a lower cap does not', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ paidModels: { allowed: false, monthlyCapUsd: 10 } }));
    await expect(call('settings.set', { setting: 'zeroCostMode', value: false, base: true })).rejects.toThrow(NEEDS_CONFIRM);
    await expect(call('settings.set', { setting: 'paidModels.allowed', value: true, base: false })).rejects.toThrow(NEEDS_CONFIRM);
    await expect(call('settings.set', { setting: 'paidModels.monthlyCapUsd', value: 20, base: 10 })).rejects.toThrow(NEEDS_CONFIRM);
    await expect(call('settings.set', { setting: 'paidModels.monthlyCapUsd', value: null, base: 10 })).rejects.toThrow(NEEDS_CONFIRM);
    await call('settings.set', { setting: 'paidModels.monthlyCapUsd', value: 5, base: 10 });
    expect(saved().paidModels).toEqual({ allowed: false, monthlyCapUsd: 5 });
  });

  it('an effect switched off needs confirming; a locked effect cannot be switched off at all', async () => {
    await expect(call('settings.set', { setting: 'effect:run', value: false, base: true })).rejects.toThrow(NEEDS_CONFIRM);
    await call('settings.set', { setting: 'effect:run', value: false, base: true, confirmed: true });
    expect(saved().effectApprovals.run).toBe(false);
    await expect(call('settings.set', { setting: 'effect:spend', value: false, base: true, confirmed: true })).rejects.toThrow(ALWAYS_ASKS);
  });

  it('a setting the phone may not change, or a wrong value, is refused', async () => {
    await expect(call('settings.set', { setting: 'endpoint', value: 'http://evil', base: '' })).rejects.toThrow();
    await expect(call('settings.set', { setting: 'effect:nope', value: true, base: true })).rejects.toThrow();
    await expect(call('settings.set', { setting: 'waitingExpiryDays', value: -3, base: 7 })).rejects.toThrow();
    await expect(call('settings.set', { setting: 'zeroCostMode', value: 'no', base: true })).rejects.toThrow();
  });

  it('a change based on an old value comes back with the latest', async () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ zeroCostMode: false }));
    await expect(call('settings.set', { setting: 'zeroCostMode', value: true, base: true })).rejects.toThrow(STALE);
  });

  it('notifications and the days switch save', async () => {
    await call('settings.set', { setting: 'notify:boardroomEscalations', value: false, base: true });
    await call('settings.set', { setting: 'waitingExpiryDays', value: 3, base: 7 });
    expect(saved()).toMatchObject({ phoneNotify: { boardroomEscalations: false }, joseWaitingExpiryDays: 3 });
  });
});

describe('agent.setModel', () => {
  it('only a model the computer offers', async () => {
    await refreshModelChoices();
    await expect(call('agent.setModel', { agentId: 'hector', provider: 'nvidia_nim', model: 'made/up', base: { provider: 'ollama', model: null } })).rejects.toThrow();
    await expect(call('agent.setModel', { agentId: 'hector', provider: 'gemini', model: null, base: { provider: 'ollama', model: null } })).rejects.toThrow();
    await call('agent.setModel', { agentId: 'hector', provider: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct', base: { provider: 'ollama', model: null } });
    expect(getAgentProvider('hector')).toEqual({ provider: 'nvidia_nim', model: 'meta/llama-3.1-8b-instruct' });
  });

  it('a stale base is refused', async () => {
    await refreshModelChoices();
    await expect(call('agent.setModel', { agentId: 'hector', provider: 'ollama', model: null, base: { provider: 'gemini', model: null } })).rejects.toThrow(STALE);
  });
});

describe('team.run and connector.setEnabled', () => {
  it('a team run answers when its request starts', async () => {
    const team = saveUserTemplate({ name: 'Research', kind: 'normal', steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }] as any, requestText: 'x' });
    submitSteps.mockImplementation((input: any) => { input.onProgress?.({ stage: 'request_started', requestId: 'req-1' }); return new Promise(() => undefined); });
    const r: any = await call('team.run', { id: team.id, text: 'Find bakeries' });
    expect(r).toEqual({ ok: true, requestId: 'req-1' });
    expect(submitSteps.mock.calls[0][0].source).toBe('phone');
  });

  it('a team run with no job says so', async () => {
    const team = saveUserTemplate({ name: 'Research', kind: 'normal', steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }] as any, requestText: 'x' });
    await expect(call('team.run', { id: team.id, text: ' ' })).rejects.toThrow();
  });

  it('a connector is switched on and off, with a stale check', async () => {
    const before = isConnectorAuthenticated('telegram').enabled;
    await call('connector.setEnabled', { id: 'telegram', enabled: !before, base: before });
    expect(isConnectorAuthenticated('telegram').enabled).toBe(!before);
    await expect(call('connector.setEnabled', { id: 'telegram', enabled: before, base: before })).rejects.toThrow(STALE);
    await expect(call('connector.setEnabled', { id: 'not-a-connector', enabled: true, base: false })).rejects.toThrow();
  });
});
