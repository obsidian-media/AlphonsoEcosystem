import { durableGet, durableSet } from '../lib/durableStore';

interface ActivityEntry {
  agent: string;
  action: string;
  detail: string;
  ts: number;
}

const ACTIVITY_KEY = 'alphonso_agent_activity_v1';
const MAX_AGENT_ACTIVITY_ENTRIES = 200;

function loadInitialActivity(): ActivityEntry[] {
  try {
    const raw = durableGet(ACTIVITY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export let agentActivityLog: ActivityEntry[] = loadInitialActivity();

export function appendAgentActivity({ agent, action, detail }: { agent: string; action: string; detail?: string }): void {
  agentActivityLog.push({ agent, action, detail: detail || '', ts: Date.now() });
  if (agentActivityLog.length > MAX_AGENT_ACTIVITY_ENTRIES) {
    agentActivityLog.shift();
  }
  durableSet(ACTIVITY_KEY, JSON.stringify(agentActivityLog.slice(-MAX_AGENT_ACTIVITY_ENTRIES)));
}

export function listAgentActivity(): ActivityEntry[] {
  return [...agentActivityLog];
}

export function getAgentActivity(): ActivityEntry[] {
  return [...agentActivityLog];
}

export function clearActivityLog(): void {
  agentActivityLog = [];
  durableSet(ACTIVITY_KEY, JSON.stringify([]));
}