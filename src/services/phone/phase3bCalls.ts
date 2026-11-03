// The phone's Settings, Teams and Connectors calls (phone app phase 3 part B, 2026-11-02). The phone
// asks for Face ID or the fingerprint before a change that makes Alphonso ask less or spend more; the
// computer refuses such a change unless the phone says it confirmed. Locked effects stay on. Each
// change carries the value the phone saw (`base`) and is refused with the latest when it differs.
import { JOSE_EFFECTS, LOCKED_EFFECTS, type JoseEffect } from '../jose/joseEffects';
import { applySettingsPatch } from '../settingsWriter';
import { getAgentProvider, setAgentProvider, type AgentModelProvider } from '../modelSelectionService';
import { runTeam } from '../jose/teams';
import { isConnectorAuthenticated, updateConnectorAuthProfile } from '../connectors/connectorAuth';
import { listConnectors } from '../connectors/connectorRegistry';
import { AGENT_NAMES } from '../jose/agentNames';
import { cachedModelChoices, PROVIDER_ONLY_AGENTS, settingsMirrorData, type PhoneSettings } from './phase3bMirror';
import { STALE } from './phase3Calls';
import { asksLess } from './asksLess';

export type Phase3bCallName = 'settings.set' | 'agent.setModel' | 'team.run' | 'connector.setEnabled';

export const NEEDS_CONFIRM = 'Confirm with Face ID or your fingerprint on the phone first.';
export const ALWAYS_ASKS = 'Spending, sending and deleting always ask.';
const NOT_ON_PHONE = 'That setting is changed on your computer.';
const BAD_VALUE = "That value can't be used.";
const NOT_OFFERED = "That model isn't offered on your computer.";
const NO_CONNECTOR = 'That connector is not on your computer.';
const NOTIFY_KINDS = ['stepWaiting', 'planWaiting', 'finished', 'reviewDecision', 'boardroomEscalations'] as const;

type Args = Record<string, unknown>;
type Call = (args: Args, fromDeviceId: string) => Promise<unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => { if (typeof v !== 'boolean') throw new Error(BAD_VALUE); return v; };

interface Setting {
  read: (s: PhoneSettings) => unknown;
  check: (value: unknown) => unknown;
  patch: (value: any) => Record<string, unknown>;
}

function setting(path: string): Setting {
  if (path === 'approvalMode') return { read: (s) => s.approvalMode, check: bool, patch: (v) => ({ approvalMode: v }) };
  if (path === 'zeroCostMode') return { read: (s) => s.zeroCostMode, check: bool, patch: (v) => ({ zeroCostMode: v }) };
  if (path === 'showModelThinking') return { read: (s) => s.showModelThinking, check: bool, patch: (v) => ({ showModelThinking: v }) };
  if (path === 'paidModels.allowed') return { read: (s) => s.paidModels.allowed, check: bool, patch: (v) => ({ paidModels: { allowed: v } }) };
  if (path === 'paidModels.monthlyCapUsd') {
    return {
      read: (s) => s.paidModels.monthlyCapUsd,
      check: (v) => { if (v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)) return v; throw new Error(BAD_VALUE); },
      patch: (v) => ({ paidModels: { monthlyCapUsd: v } }),
    };
  }
  if (path === 'waitingExpiryDays') {
    return {
      read: (s) => s.waitingExpiryDays,
      check: (v) => { if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3650) return v; throw new Error(BAD_VALUE); },
      patch: (v) => ({ joseWaitingExpiryDays: v }),
    };
  }
  const effect = /^effect:(.+)$/.exec(path)?.[1] as JoseEffect | undefined;
  if (effect && JOSE_EFFECTS.includes(effect)) {
    return {
      read: (s) => s.effectApprovals[effect],
      check: (v) => { const on = bool(v); if (!on && LOCKED_EFFECTS.includes(effect)) throw new Error(ALWAYS_ASKS); return on; },
      patch: (v) => ({ effectApprovals: { [effect]: v } }),
    };
  }
  const kind = /^notify:(.+)$/.exec(path)?.[1];
  if (kind && (NOTIFY_KINDS as readonly string[]).includes(kind)) {
    return { read: (s) => s.phoneNotify[kind as typeof NOTIFY_KINDS[number]], check: bool, patch: (v) => ({ phoneNotify: { [kind]: v } }) };
  }
  throw new Error(NOT_ON_PHONE);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function runSettings(): { endpoint?: string; zeroCostMode?: boolean } {
  const s = settingsMirrorData();
  let endpoint: string | undefined;
  try { const e = JSON.parse(localStorage.getItem('alphonso_settings') || '{}')?.endpoint; if (typeof e === 'string') endpoint = e; } catch { /* default */ }
  return { ...(endpoint ? { endpoint } : {}), zeroCostMode: s.zeroCostMode };
}

export const PHASE3B_CALLS: Record<Phase3bCallName, Call> = {
  'settings.set': async (args) => {
    const def = setting(str(args.setting));
    const value = def.check(args.value);
    const current = def.read(settingsMirrorData());
    if (!same(current, args.base)) throw new Error(STALE);
    if (asksLess(str(args.setting), current, value) && args.confirmed !== true) throw new Error(NEEDS_CONFIRM);
    applySettingsPatch(def.patch(value));
    return { ok: true, latest: settingsMirrorData() };
  },

  'agent.setModel': async (args) => {
    const agentId = str(args.agentId);
    if (!AGENT_NAMES[agentId]) throw new Error('That agent is not on your computer.');
    const provider = str(args.provider) as AgentModelProvider;
    const model = args.model === null || args.model === undefined ? null : str(args.model);
    const current = getAgentProvider(agentId);
    const base = (args.base || {}) as { provider?: unknown; model?: unknown };
    if (current.provider !== base.provider || (current.model || null) !== (base.model ?? null)) throw new Error(STALE);
    const choice = cachedModelChoices().find((c) => c.provider === provider);
    // Ollama agents use the computer's one model, and a paid step uses the paid model chosen there.
    const providerOnly = PROVIDER_ONLY_AGENTS.includes(agentId) || provider === 'ollama' || provider === 'paid';
    const modelOk = providerOnly ? model === null : model === null ? provider === 'openrouter' : !!choice?.models.includes(model);
    if (!choice || !modelOk) throw new Error(NOT_OFFERED);
    if (choice.paid && current.provider !== provider && args.confirmed !== true) throw new Error(NEEDS_CONFIRM);
    setAgentProvider(agentId, model ? { provider, model } : { provider });
    return { ok: true, latest: settingsMirrorData() };
  },

  'team.run': async (args) => {
    let started: (requestId: string) => void = () => undefined;
    const startedRun = new Promise<{ ok: true; requestId: string }>((resolve) => { started = (requestId) => resolve({ ok: true, requestId }); });
    const run = runTeam(str(args.id), str(args.text), {
      source: 'phone',
      ...runSettings(),
      onProgress: (event: any) => { if (event?.stage === 'request_started' && typeof event.requestId === 'string') started(event.requestId); },
    }).then((r: any) => {
      if (r && typeof r.requestId === 'string' && r.ok !== false) return { ok: true as const, requestId: r.requestId };
      throw new Error(r?.problems?.length ? r.problems.join(' ') : String(r?.reason || 'The team could not start.'));
    });
    return Promise.race([startedRun, run]);
  },

  'connector.setEnabled': async (args) => {
    const id = str(args.id);
    if (!(listConnectors() as Array<{ id: string }>).some((c) => c.id === id)) throw new Error(NO_CONNECTOR);
    const enabled = bool(args.enabled);
    if (isConnectorAuthenticated(id).enabled !== args.base) throw new Error(STALE);
    updateConnectorAuthProfile(id, { enabled });
    return { ok: true, enabled: isConnectorAuthenticated(id).enabled };
  },
};
