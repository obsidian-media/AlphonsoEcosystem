import { durableGet, durableSet } from '../lib/durableStore';

const ACTIVITY_KEY = 'alphonso_agent_activity_v1';
const MAX_AGENT_ACTIVITY_ENTRIES = 200;

export let agentActivityLog = (() => {
  try {
    const raw = durableGet(ACTIVITY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})();

export function appendAgentActivity({ agent, action, detail }) {
  agentActivityLog.push({ agent, action, detail: detail || '', ts: Date.now() });
  if (agentActivityLog.length > MAX_AGENT_ACTIVITY_ENTRIES) {
    agentActivityLog.shift();
  }
  durableSet(ACTIVITY_KEY, JSON.stringify(agentActivityLog.slice(-MAX_AGENT_ACTIVITY_ENTRIES)));
}

export function listAgentActivity() {
  return [...agentActivityLog];
}

export function getAgentActivity() {
  return [...agentActivityLog];
}

export function clearActivityLog() {
  agentActivityLog = [];
  durableSet(ACTIVITY_KEY, JSON.stringify([]));
}
