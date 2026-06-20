import { ALPHONSO_PROFILE } from './alphonso/alphonsoProfile';
import { HECTOR_PROFILE } from './hector/hectorProfile';
import { JOSE_PROFILE } from './jose/joseProfile';
import { MARIA_PROFILE } from './maria/mariaProfile';
import { MARCUS_PROFILE } from './marcus/marcusProfile';
import { MIYA_PROFILE } from './miya/miyaProfile';
import { ECHO_PROFILE } from './echo/echoProfile';
import { SENTINEL_PROFILE } from './sentinel/sentinelProfile';
import { NOVA_PROFILE } from './nova/novaProfile';

export const CORE_AGENT_REGISTRY = [
  JOSE_PROFILE,
  ALPHONSO_PROFILE,
  MIYA_PROFILE,
  HECTOR_PROFILE,
  MARIA_PROFILE,
  MARCUS_PROFILE,
  ECHO_PROFILE,
  SENTINEL_PROFILE,
  NOVA_PROFILE
];

export function listAgentProfiles() {
  return CORE_AGENT_REGISTRY.slice();
}

export function getAgentProfile(agentId) {
  return CORE_AGENT_REGISTRY.find((agent) => agent.id === agentId) || null;
}
