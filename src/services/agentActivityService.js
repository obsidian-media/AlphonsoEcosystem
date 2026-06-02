const MAX_AGENT_ACTIVITY_ENTRIES = 200;

export const agentActivityLog = [];

export function appendAgentActivity({ agent, action, detail }) {
  agentActivityLog.push({ agent, action, detail: detail || '', ts: Date.now() });
  if (agentActivityLog.length > MAX_AGENT_ACTIVITY_ENTRIES) {
    agentActivityLog.shift();
  }
}

export function listAgentActivity() {
  return [...agentActivityLog];
}
