// Phone app phase 3 part B (2026-11-02): settings, teams, skills and connectors on the phone.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../services/jose/joseModels', () => ({ listInstalledModels: vi.fn(async () => ['llama3.2:3b', 'all-minilm:latest', 'qwen2.5:7b']) }));
vi.mock('../../../services/connectors/nvidiaNimConnector', () => ({ isNvidiaConfigured: () => true, listNvidiaModels: vi.fn(async () => ['meta/llama-3.1-8b-instruct']) }));
vi.mock('../../../services/connectors/geminiConnector', () => ({ isGeminiConfigured: () => false }));
vi.mock('../../../services/connectors/openRouterConnector', () => ({ isOpenRouterConfigured: () => false, listOpenRouterModels: vi.fn(async () => []) }));

import { settingsMirrorData, teamsMirrorData, skillsMirrorData, connectorsMirrorData, refreshModelChoices, resetPhase3bMirrorForTests } from '../../../services/phone/phase3bMirror';
import { mirrorSnapshots } from '../../../services/phone/phoneMirror';
import { saveUserTemplate } from '../../../services/jose/joseUserTemplates';
import { LOCKED_EFFECTS } from '../../../services/jose/joseEffects';

beforeEach(() => { localStorage.clear(); resetPhase3bMirrorForTests(); });

describe('phase 3 part B mirror', () => {
  it('settings: approvals with the locked effects, money, notifications, and no keys', () => {
    localStorage.setItem('alphonso_settings', JSON.stringify({ approvalMode: false, zeroCostMode: false, effectApprovals: { read: true }, paidModels: { allowed: true, monthlyCapUsd: 12, apiKey: 'sk-secret-1234567890' }, phoneNotify: { finished: false }, joseWaitingExpiryDays: 3 }));
    const s = settingsMirrorData();
    expect(s.approvalMode).toBe(false);
    expect(s.zeroCostMode).toBe(false);
    expect(s.effectApprovals.read).toBe(true);
    for (const e of LOCKED_EFFECTS) expect(s.effectApprovals[e]).toBe(true);
    expect(s.lockedEffects).toEqual(LOCKED_EFFECTS);
    expect(s.paidModels).toMatchObject({ allowed: true, monthlyCapUsd: 12 });
    expect(s.waitingExpiryDays).toBe(3);
    expect(s.phoneNotify).toMatchObject({ finished: false, stepWaiting: true, boardroomEscalations: true });
    expect(JSON.stringify(s)).not.toContain('sk-secret');
  });

  it('model choices: installed chat models and set-up cloud providers, never an embedding model', async () => {
    await refreshModelChoices();
    const s = settingsMirrorData();
    const ollama = s.providerChoices.find((c) => c.provider === 'ollama');
    expect(ollama?.models).toEqual(['llama3.2:3b', 'qwen2.5:7b']);
    expect(s.providerChoices.find((c) => c.provider === 'nvidia_nim')?.models).toEqual(['meta/llama-3.1-8b-instruct']);
    expect(s.providerChoices.some((c) => c.provider === 'gemini')).toBe(false);
    expect(s.agents.find((a) => a.id === 'hector')).toMatchObject({ provider: 'ollama' });
  });

  it('teams: steps in order, with their problems', () => {
    saveUserTemplate({ name: 'Bad pair', kind: 'normal', steps: [{ stepId: 'hector', agent: 'hector', actionType: 'research_report', effects: ['read'], needs: [] }, { stepId: 'nova', agent: 'nova', actionType: 'research_report', effects: ['read'], needs: ['hector'] }] as any, requestText: 'x' });
    const [team] = teamsMirrorData();
    expect(team.name).toBe('Bad pair');
    expect(team.steps.map((s) => s.agent)).toEqual(['hector', 'nova']);
    expect(team.problems.length).toBeGreaterThan(0);
  });

  it('skills: each skill with its record line, and refused files with why', () => {
    const { skills, refused } = skillsMirrorData();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0]).toEqual(expect.objectContaining({ agent: expect.any(String), name: expect.any(String), useWhen: expect.any(String), stats: expect.any(String) }));
    expect(Array.isArray(refused)).toBe(true);
  });

  it('connectors: status and the on/off switch, no key names or values', () => {
    const list = connectorsMirrorData();
    const telegram = list.find((c) => c.id === 'telegram');
    expect(telegram).toMatchObject({ enabled: expect.any(Boolean), needsKeys: true });
    expect(JSON.stringify(list)).not.toMatch(/TELEGRAM_BOT_TOKEN|requiredEnv|envPresence/);
  });

  it('the snapshot carries the four new stores', () => {
    const snap = mirrorSnapshots() as Record<string, unknown>;
    for (const k of ['settings', 'teams', 'skills', 'connectors']) expect(snap[k]).toBeTruthy();
  });
});
