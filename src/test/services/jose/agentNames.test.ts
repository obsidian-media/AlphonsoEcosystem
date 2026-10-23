import { describe, it, expect } from 'vitest';
import { AGENT_NAMES, agentName } from '../../../services/jose/agentNames';
import { AGENT_PERMISSION_TABLE } from '../../../services/jose/agentPermissionTable';

describe('agentNames', () => {
  it('names every agent in the permission table', () => {
    for (const agent of Object.keys(AGENT_PERMISSION_TABLE)) {
      expect(AGENT_NAMES[agent]).toBe(agent.charAt(0).toUpperCase() + agent.slice(1));
    }
    expect(Object.keys(AGENT_NAMES)).toHaveLength(9);
  });

  it('falls back to the id for an unknown agent', () => {
    expect(agentName('nova')).toBe('Nova');
    expect(agentName('someone')).toBe('someone');
  });
});
