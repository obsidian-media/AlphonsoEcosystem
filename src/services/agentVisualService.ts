import alphonsoMascot from '../assets/agents/alphonso/portrait.jpg';
import joseMascot from '../assets/agents/jose/portrait.jpg';
import miyaMascot from '../assets/agents/miya/portrait.jpg';
import hectorMascot from '../assets/agents/hector/portrait.jpg';
import mariaMascot from '../assets/agents/maria/portrait.jpg';
import marcusMascot from '../assets/agents/marcus/portrait.jpg';
import echoMascot from '../assets/agents/echo/portrait.jpg';
import sentinelMascot from '../assets/agents/sentinel/portrait.jpg';
import novaMascot from '../assets/agents/nova/portrait.jpg';
import { getCustomAvatarDataUrl } from './agentAvatarService';

const AGENT_MASCOT_MAP: Record<string, string> = {
  jose: joseMascot,
  alphonso: alphonsoMascot,
  miya: miyaMascot,
  hector: hectorMascot,
  maria: mariaMascot,
  marcus: marcusMascot,
  echo: echoMascot,
  sentinel: sentinelMascot,
  nova: novaMascot
};

export function getAgentMascotPath(agentId: string): string | null {
  const id = String(agentId || '').toLowerCase();
  const custom = getCustomAvatarDataUrl(id);
  if (custom) return custom;
  return AGENT_MASCOT_MAP[id] || null;
}

export function getAgentInitials(nameOrId: string): string {
  const safe = String(nameOrId || '').trim();
  if (!safe) return '?';
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return safe.slice(0, 2).toUpperCase();
}
