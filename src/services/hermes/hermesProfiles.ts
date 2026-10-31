// Hermes gateway (2026-10-30): the Hermes profiles Alphonso sets up, one per
// agent. The backend (hermes_profiles.rs) writes the profile and keeps its key
// in the keychain; the window keeps only the address and a reference to the key
// (profileKeyRef), which the backend swaps for the key when it talks to that
// profile. Design: docs/superpowers/specs/2026-10-30-hermes-gateway-design.md.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getAgentProvider, setAgentProvider, type AgentProviderConfig } from '../modelSelectionService';
import { saveHermesAgentEndpoint } from '../connectors/hermesAgentConnector';
import { getRuntimePolicySettings } from '../policyEnforcementService';
import { getConfiguredOllamaEndpoint, getConfiguredOllamaModel } from '../../lib/ollama';
import { OPENROUTER_CHOOSE_FREE, isOpenRouterConfigured } from '../connectors/openRouterConnector';
import { describeResponsibility } from '../jose/agentPermissionTable';
import { ACTION_INSTRUCTION } from '../jose/joseHandoff';
import { agentName } from '../jose/agentNames';

export type ProfileModel = { kind: 'ollama'; model: string } | { kind: 'openrouter'; model: string };

export interface ProfileInfo {
  agent: string;
  port: number;
  url: string;
  folder: string;
  running: boolean;
}

export type ProfileResult = { ok: true; profile: ProfileInfo } | { ok: false; reason: string };

export const NOT_DESKTOP = 'Hermes profiles work in the desktop app only.';
export const PAID_IN_ZERO_COST = 'That model is paid and Zero-Cost Mode is on.';

/** What the window saves instead of a profile's key. Not a secret. */
const KEY_REF_PREFIX = 'alphonso-profile:';
export function profileKeyRef(agent: string): string {
  return `${KEY_REF_PREFIX}${agent}`;
}
export function isProfileKeyRef(key: string): boolean {
  return key.startsWith(KEY_REF_PREFIX);
}

const PREVIOUS_KEY = 'alphonso_hermes_previous_provider_v1';

function readPrevious(): Record<string, AgentProviderConfig> {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREVIOUS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePrevious(map: Record<string, AgentProviderConfig>): void {
  try {
    localStorage.setItem(PREVIOUS_KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: removing the profile then falls back to Ollama.
  }
}

function isFreeOpenRouterModel(model: string): boolean {
  return model.endsWith(':free') || model === OPENROUTER_CHOOSE_FREE;
}

function backendModel(model: ProfileModel) {
  return model.kind === 'ollama'
    ? { kind: 'ollama', endpoint: getConfiguredOllamaEndpoint(), model: model.model }
    : { kind: 'openrouter', model: model.model };
}

function persona(agent: string) {
  const lines = describeResponsibility(agent);
  const name = agentName(agent);
  return {
    owns: lines?.owns || `${name} works for Alphonso.`,
    never: lines?.never || `${name} never acts without Alphonso's approval.`,
    actionLine: ACTION_INSTRUCTION,
  };
}

function reasonOf(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Hermes didn’t answer.';
}

/** Sets up the agent's profile and, unless useNow is false, makes Hermes its provider. */
export async function setUpProfile(agent: string, opts: { useNow?: boolean; model?: ProfileModel } = {}): Promise<ProfileResult> {
  if (!isTauri()) return { ok: false, reason: NOT_DESKTOP };
  const model = opts.model || { kind: 'ollama', model: getConfiguredOllamaModel() };
  if (model.kind === 'openrouter' && getRuntimePolicySettings().zeroCostMode && !isFreeOpenRouterModel(model.model)) {
    return { ok: false, reason: PAID_IN_ZERO_COST };
  }
  let profile: ProfileInfo;
  try {
    profile = await invoke<ProfileInfo>('hermes_profile_setup', { agent, model: backendModel(model), persona: persona(agent) });
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
  saveHermesAgentEndpoint(agent, profile.url, profileKeyRef(agent));
  if (opts.useNow !== false) {
    const current = getAgentProvider(agent);
    if (current.provider !== 'hermes') writePrevious({ ...readPrevious(), [agent]: current });
    setAgentProvider(agent, { provider: 'hermes' });
  }
  return { ok: true, profile };
}

/** Stops and deletes the agent's profile and gives the agent back its earlier provider. */
export async function removeProfile(agent: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isTauri()) return { ok: false, reason: NOT_DESKTOP };
  try {
    await invoke('hermes_profile_remove', { agent });
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
  saveHermesAgentEndpoint(agent, '', '');
  const previous = readPrevious();
  if (getAgentProvider(agent).provider === 'hermes') {
    setAgentProvider(agent, previous[agent] || { provider: 'ollama' });
  }
  delete previous[agent];
  writePrevious(previous);
  return { ok: true };
}

export async function setProfileModel(agent: string, model: ProfileModel): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isTauri()) return { ok: false, reason: NOT_DESKTOP };
  if (model.kind === 'openrouter' && getRuntimePolicySettings().zeroCostMode && !isFreeOpenRouterModel(model.model)) {
    return { ok: false, reason: PAID_IN_ZERO_COST };
  }
  try {
    await invoke('hermes_profile_set_model', { agent, model: backendModel(model) });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

/** The profiles Alphonso set up. Empty outside the desktop app. */
export async function listOwnProfiles(): Promise<ProfileInfo[]> {
  if (!isTauri()) return [];
  try {
    return (await invoke<ProfileInfo[]>('hermes_profiles_list')) || [];
  } catch {
    return [];
  }
}

/** The models a profile can think with: the one Alphonso uses, then OpenRouter's free choice. */
export async function profileModelChoices(): Promise<ProfileModel[]> {
  const choices: ProfileModel[] = [{ kind: 'ollama', model: getConfiguredOllamaModel() }];
  if (isOpenRouterConfigured()) choices.push({ kind: 'openrouter', model: OPENROUTER_CHOOSE_FREE });
  return choices;
}
