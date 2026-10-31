// Hermes gateway (2026-10-30): a Hermes profile on this computer is one of the
// resource manager's tools, named `hermes:<agent>`. A step whose agent's
// provider is Hermes at a loopback address needs it (plus Ollama when the
// profile Alphonso set up thinks with Ollama); one at any other address is a
// cloud step and needs nothing here. The resource manager starts it before the
// step (Alphonso's own profile, or the user's connected profile with the
// user's own Hermes), counts it in use while the step runs, and stops one it
// started after it sits idle. A profile the user started themselves is never
// stopped: only processes Alphonso spawned are in its process list.
import { invoke } from '@tauri-apps/api/core';
import { getAgentProvider } from '../modelSelectionService';
import { getHermesAgentEndpoint, getHermesAgentHealth, isLoopbackHermesUrl } from '../connectors/hermesAgentConnector';
import { getConnectorCredential } from '../connectors/connectorAuth';
import { agentName } from '../jose/agentNames';
import { listOwnProfiles } from './hermesProfiles';
import { userProfileFor } from './userProfiles';
import { HERMES_TOOL_PREFIX, hermesToolAgent as agentOf, hermesToolLabel, isHermesTool } from './hermesConstants';

export { hermesLocalModel, saveProfileModel, type SavedProfileModel } from './profileModels';
export { HERMES_TOOL_PREFIX, hermesToolLabel, isHermesTool };

export const HERMES_DIDNT_START = (agent: string): string => `${agentName(agent)}'s Hermes profile didn't start. Open Runtime Hub to see its log.`;

const START_WAIT_MS = 60_000;
const POLL_MS = 1000;

/** The tool a step of this agent needs on this computer, or null (not Hermes, or Hermes elsewhere). */
export function hermesToolFor(agent: string): string | null {
  if (getAgentProvider(agent)?.provider !== 'hermes') return null;
  return isLoopbackHermesUrl(getHermesAgentEndpoint(agent).url) ? `${HERMES_TOOL_PREFIX}${agent}` : null;
}

async function answers(agent: string): Promise<boolean> {
  try {
    return Boolean((await getHermesAgentHealth(agent))?.ok);
  } catch {
    return false;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the agent's profile unless it already answers, then waits for it. */
export async function startHermesTool(
  tool: string,
  opts: { waitMs?: number; pollMs?: number } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const agent = agentOf(tool);
  if (await answers(agent)) return { ok: true };
  try {
    if ((await listOwnProfiles()).some((p) => p.agent === agent)) {
      const key = getConnectorCredential('openrouter', 'OPENROUTER_API_KEY') || null;
      await invoke('hermes_profile_start', { agent, openrouterKey: key });
    } else {
      const user = userProfileFor(agent);
      // Neither Alphonso's nor connected: nothing to start; the step says what is wrong.
      if (!user) return { ok: true };
      await invoke('hermes_user_profile_start', { agent, name: user.name });
    }
  } catch (error) {
    return { ok: false, reason: typeof error === 'string' && error ? error : HERMES_DIDNT_START(agent) };
  }
  const waitMs = opts.waitMs ?? START_WAIT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (await answers(agent)) return { ok: true };
    await wait(pollMs);
  }
  return { ok: false, reason: HERMES_DIDNT_START(agent) };
}

/** Stops a profile Alphonso started. */
export async function stopHermesTool(tool: string): Promise<{ ok: boolean }> {
  try {
    await invoke('hermes_profile_stop', { agent: agentOf(tool) });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
