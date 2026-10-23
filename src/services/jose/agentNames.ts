// The agents' display names, in one place (phase 5).
export const AGENT_NAMES: Record<string, string> = {
  alphonso: 'Alphonso', jose: 'Jose', miya: 'Miya', hector: 'Hector', maria: 'Maria',
  marcus: 'Marcus', echo: 'Echo', sentinel: 'Sentinel', nova: 'Nova',
};

export const agentName = (agent: string): string => AGENT_NAMES[agent] || agent;
