// Hermes gateway (2026-10-30): the user's own Hermes profiles ("Yours"). The
// backend reads each profile's config.yaml read-only (hermes_find_user_profiles)
// and returns only a few fields; nothing in the user's Hermes folder is written,
// and the profile's .env is never read. Alphonso shows a warning, not a block,
// for settings that skip its approvals.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { saveHermesAgentEndpoint } from '../connectors/hermesAgentConnector';
import { READING_TOOLSETS } from './hermesConstants';

export interface UserProfile {
  name: string;
  folder: string;
  apiServer: { on: boolean; port?: number | null };
  platformsOn: string[];
  toolsetsOn: string[];
  approvalsMode?: string | null;
  readable: boolean;
}

export interface UserProfileView extends UserProfile {
  answering: boolean;
  warnings: string[];
}

export const ACTS_WITHOUT_ASKING = 'This profile can change things without asking.';
export const CANT_READ = "Can't read this profile's settings.";
export const API_SERVER_OFF = "This profile's API server is off. Switch it on in Hermes first.";
export const NO_KEY = "Enter this profile's API server key.";
export const NOT_FOUND = 'That Hermes profile is no longer there.';
/** Said beside the list: settings in a profile's .env are not read. */
export const ENV_NOT_CHECKED = "Alphonso reads each profile's config.yaml only; anything switched on in its .env file isn't checked.";

const PLATFORM_NAMES: Record<string, string> = {
  telegram: 'Telegram', whatsapp: 'WhatsApp', discord: 'Discord', slack: 'Slack', signal: 'Signal',
  email: 'Email', sms: 'SMS', matrix: 'Matrix', mattermost: 'Mattermost', homeassistant: 'Home Assistant', webhook: 'webhook',
};

function platformName(id: string): string {
  return PLATFORM_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

export function ownMessagingWarning(platform: string): string {
  return `Messages to this profile's own ${platformName(platform)} skip Alphonso's approvals.`;
}

/** Hermes's strictest approval setting; with it, terminal commands wait for an answer. */
const STRICTEST_APPROVALS = 'manual';

function actsWithoutAsking(p: UserProfile): boolean {
  // No list means Hermes's own default set, which writes files.
  if (!p.toolsetsOn.length) return true;
  return p.toolsetsOn.some((t) => {
    if ((READING_TOOLSETS as readonly string[]).includes(t)) return false;
    if (t === 'terminal') return p.approvalsMode !== STRICTEST_APPROVALS;
    return true;
  });
}

export function profileWarnings(p: UserProfile): string[] {
  if (!p.readable) return [CANT_READ];
  const warnings = p.platformsOn.map(ownMessagingWarning);
  if (actsWithoutAsking(p)) warnings.push(ACTS_WITHOUT_ASKING);
  return warnings;
}

function profileAddress(p: UserProfile): string | null {
  return p.apiServer.on && p.apiServer.port ? `http://127.0.0.1:${p.apiServer.port}` : null;
}

async function answers(url: string): Promise<boolean> {
  try {
    const r = await invoke<{ ok: boolean }>('connector_hermes_agent_request', { url: `${url}/health`, method: 'GET', headers: {}, body: null, timeoutMs: 3000 });
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

async function readProfiles(): Promise<UserProfile[]> {
  if (!isTauri()) return [];
  try {
    return (await invoke<UserProfile[]>('hermes_find_user_profiles')) || [];
  } catch {
    return [];
  }
}

export async function findUserProfiles(): Promise<UserProfileView[]> {
  const profiles = await readProfiles();
  return Promise.all(profiles.map(async (p) => {
    const url = profileAddress(p);
    return { ...p, answering: url ? await answers(url) : false, warnings: profileWarnings(p) };
  }));
}

const CONNECTED_KEY = 'alphonso_hermes_user_profiles_v1';

function readConnected(): Record<string, { name: string; folder: string }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONNECTED_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Which of the user's profiles serves this agent (for starting it), if any. */
export function userProfileFor(agent: string): { name: string; folder: string } | null {
  return readConnected()[agent] || null;
}

/** Points the agent at one of the user's profiles with the key the user typed. */
export async function connectUserProfile(name: string, agent: string, key: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const profile = (await readProfiles()).find((p) => p.name === name);
  if (!profile) return { ok: false, reason: NOT_FOUND };
  if (!profile.readable) return { ok: false, reason: CANT_READ };
  const url = profileAddress(profile);
  if (!url) return { ok: false, reason: API_SERVER_OFF };
  if (!key.trim()) return { ok: false, reason: NO_KEY };
  saveHermesAgentEndpoint(agent, url, key.trim());
  try {
    localStorage.setItem(CONNECTED_KEY, JSON.stringify({ ...readConnected(), [agent]: { name: profile.name, folder: profile.folder } }));
  } catch {
    // The connection still works; only starting it from Alphonso is lost.
  }
  return { ok: true };
}
