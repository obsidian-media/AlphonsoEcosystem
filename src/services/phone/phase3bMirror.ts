// What part B of phase 3 mirrors to a paired phone (2026-11-02): the settings the phone may see and
// switch (approvals, money, models, notifications; never a key or price list), the saved teams, each
// agent's skills with their record, and the connectors with their on/off switch. Model choices are
// read from the computer's own lists (installed chat models, set-up cloud providers) in the background
// and kept here, since the mirror's reads are synchronous.
import { EFFECT_LABELS, LOCKED_EFFECTS, getEffectApprovals, type JoseEffect } from '../jose/joseEffects';
import { getPaidModelSettings, monthSpendUsd, paidModelAvailable } from '../jose/joseSpend';
import { getWaitingExpiryDays } from '../jose/joseExpiry';
import { phoneNotifySettings } from './phoneNotifications';
import { AGENT_NAMES } from '../jose/agentNames';
import { getAgentProvider, type AgentModelProvider } from '../modelSelectionService';
import { AGENT_PROVIDER_LABELS } from '../providerLabels';
import { getConfiguredOllamaModel, isChatModel } from '../../lib/ollama';
import { listUserTemplates } from '../jose/joseUserTemplates';
import { templateProblems } from '../jose/teams';
import { listSkills, refusedSkills } from '../skills/skillLibrary';
import { skillStats, statsLine } from '../skills/skillOutcomes';
import { listConnectors } from '../connectors/connectorRegistry';
import { isConnectorAuthenticated } from '../connectors/connectorAuth';
import { CONNECTOR_STATUS_LABELS, deriveConnectorStatus } from '../connectorStatusService';
import { readAppSettings } from '../settingsWriter';

export interface ProviderChoice { provider: AgentModelProvider; label: string; paid: boolean; models: string[] }
export interface PhoneSettings {
  approvalMode: boolean;
  effectApprovals: Record<JoseEffect, boolean>;
  effectLabels: Record<JoseEffect, string>;
  lockedEffects: JoseEffect[];
  paidModels: { allowed: boolean; monthlyCapUsd: number | null; monthSpendUsd: number; available: boolean; reason: string | null };
  waitingExpiryDays: number;
  zeroCostMode: boolean;
  showModelThinking: boolean;
  phoneNotify: Record<'stepWaiting' | 'planWaiting' | 'finished' | 'reviewDecision' | 'boardroomEscalations', boolean>;
  /** The model every agent on Ollama uses (Settings → General). */
  computerModel: string;
  agents: Array<{ id: string; name: string; provider: AgentModelProvider; model: string | null }>;
  providerChoices: ProviderChoice[];
}
export interface PhoneTeam { id: string; name: string; steps: Array<{ stepId: string; agent: string; actionType: string; needs: string[] }>; problems: string[] }
export interface PhoneSkills { skills: Array<{ agent: string; name: string; useWhen: string; builtIn: boolean; stats: string }>; refused: Array<{ file: string; reason: string }> }
export interface PhoneConnector { id: string; name: string; status: string; statusLabel: string; enabled: boolean; needsKeys: boolean; lastCheck: { atMs: number; ok: boolean } | null }

let cachedChoices: ProviderChoice[] = [];

/** Reads what the computer offers today, as its own Settings would. Never throws. */
export async function refreshModelChoices(): Promise<ProviderChoice[]> {
  const choices: ProviderChoice[] = [];
  const add = (provider: AgentModelProvider, models: string[], paid = false) => choices.push({ provider, label: AGENT_PROVIDER_LABELS[provider], paid, models });
  try {
    const { listInstalledModels } = await import('../jose/joseModels');
    add('ollama', (await listInstalledModels()).filter((m) => isChatModel(m)));
  } catch { add('ollama', []); }
  try {
    const nvidia = await import('../connectors/nvidiaNimConnector');
    if (nvidia.isNvidiaConfigured()) add('nvidia_nim', await nvidia.listNvidiaModels());
  } catch { /* not offered */ }
  try {
    const gemini = await import('../connectors/geminiConnector');
    if (gemini.isGeminiConfigured()) {
      const { getCloudModelList } = await import('../modelSelectionService');
      add('gemini', await getCloudModelList('gemini'));
    }
  } catch { /* not offered */ }
  try {
    const openRouter = await import('../connectors/openRouterConnector');
    if (openRouter.isOpenRouterConfigured()) add('openrouter', (await openRouter.listOpenRouterModels()).filter((m) => m.free).map((m) => m.id));
  } catch { /* not offered */ }
  if (paidModelAvailable().ok) add('paid', [], true);
  cachedChoices = choices;
  return choices;
}

export function cachedModelChoices(): ProviderChoice[] { return cachedChoices; }
export function resetPhase3bMirrorForTests(): void { cachedChoices = []; }

export function settingsMirrorData(): PhoneSettings {
  const s = readAppSettings();
  const paid = getPaidModelSettings();
  const available = paidModelAvailable();
  const notify = phoneNotifySettings();
  const effectApprovals = getEffectApprovals();
  for (const e of LOCKED_EFFECTS) effectApprovals[e] = true;
  return {
    approvalMode: s.approvalMode !== false,
    effectApprovals,
    effectLabels: { ...EFFECT_LABELS },
    lockedEffects: [...LOCKED_EFFECTS],
    paidModels: { allowed: paid.allowed, monthlyCapUsd: paid.monthlyCapUsd, monthSpendUsd: monthSpendUsd(), available: available.ok, reason: available.ok ? null : available.reason || null },
    waitingExpiryDays: getWaitingExpiryDays(),
    zeroCostMode: s.zeroCostMode !== false,
    showModelThinking: s.showModelThinking !== false,
    phoneNotify: { stepWaiting: notify.stepWaiting, planWaiting: notify.planWaiting, finished: notify.finished, reviewDecision: notify.reviewDecision, boardroomEscalations: s.phoneNotify?.boardroomEscalations !== false },
    computerModel: getConfiguredOllamaModel(),
    agents: Object.keys(AGENT_NAMES).map((id) => {
      const config = getAgentProvider(id);
      return { id, name: AGENT_NAMES[id], provider: config.provider, model: config.model || null };
    }),
    providerChoices: cachedChoices,
  };
}

export function teamsMirrorData(): PhoneTeam[] {
  return listUserTemplates().filter((t) => t.kind === 'normal').map((t) => ({
    id: t.id,
    name: t.name,
    steps: t.steps.map((st) => ({ stepId: st.stepId, agent: st.agent, actionType: st.actionType, needs: [...(st.needs || [])] })),
    problems: templateProblems(t),
  }));
}

export function skillsMirrorData(): PhoneSkills {
  return {
    skills: listSkills().map((k) => ({ agent: k.agent, name: k.name, useWhen: k.useWhen, builtIn: k.source === 'built_in', stats: statsLine(skillStats(k.agent, k.name)) })),
    refused: refusedSkills().map((r) => ({ file: r.file, reason: r.problems.join(' ') })),
  };
}

export function connectorsMirrorData(): PhoneConnector[] {
  return (listConnectors() as Array<Record<string, any>>).map((c) => {
    const status = deriveConnectorStatus(c as any);
    const required = Array.isArray(c.requiredEnv) ? c.requiredEnv : [];
    return {
      id: String(c.id),
      name: String(c.name || c.id),
      status,
      statusLabel: CONNECTOR_STATUS_LABELS[status],
      enabled: isConnectorAuthenticated(String(c.id)).enabled,
      needsKeys: required.length > 0 && status !== 'live',
      lastCheck: typeof c.lastTestAtMs === 'number' && c.lastTestAtMs > 0 ? { atMs: c.lastTestAtMs, ok: c.lastTestStatus === 'verified' } : null,
    };
  });
}
