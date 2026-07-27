import { timestampMs, TRUST_STATES } from './trustModel';
import { validateSkillPackAgainstContract } from './skillPackPermissions';
import { DEFAULT_PACKS } from './skillPackContent';
import { SHARED_AGENT_SKILL_PACK_IDS, SKILL_WORKFLOW_GUIDANCE } from './skillPackGuidance';

const SKILL_PACK_KEY = 'alphonso_skill_packs_v1';
const SKILL_AUDIT_KEY = 'alphonso_skill_pack_audit_v1';
const SKILL_PACK_INVOCATION_KEY = 'alphonso_skill_pack_invocation_v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function audit(action, packId, details = {}) {
  const rows = read(SKILL_AUDIT_KEY, []);
  rows.push({
    id: `skill-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    packId,
    details,
    timestampMs: timestampMs()
  });
  write(SKILL_AUDIT_KEY, rows.slice(-300));
}

export function listSkillPacks() {
  const packs = read(SKILL_PACK_KEY, []);
  if (packs.length === 0) {
    write(SKILL_PACK_KEY, DEFAULT_PACKS);
    return DEFAULT_PACKS;
  }
  return packs;
}

export function listSkillPackAudit() {
  return read(SKILL_AUDIT_KEY, []);
}

export function validateSkillPackManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') errors.push('Manifest must be an object.');
  if (!manifest?.id) errors.push('Missing manifest id.');
  if (!manifest?.name) errors.push('Missing manifest name.');
  if (!manifest?.version) errors.push('Missing manifest version.');
  if (!Array.isArray(manifest?.permissions)) errors.push('Permissions must be an array.');
  return {
    valid: errors.length === 0,
    errors
  };
}

export function installSkillPack(manifest) {
  const validation = validateSkillPackManifest(manifest);
  if (!validation.valid) {
    return {
      installed: false,
      validation
    };
  }

  const contractCheck = validateSkillPackAgainstContract(manifest.ownerAgent, manifest.permissions, manifest.id);
  if (!contractCheck.ok) {
    audit('install_blocked', manifest.id, { ownerAgent: manifest.ownerAgent, reason: contractCheck.reason });
    return {
      installed: false,
      validation: { valid: false, errors: [contractCheck.reason] }
    };
  }

  const packs = listSkillPacks();
  const next = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: manifest.enabled ?? true,
    permissions: manifest.permissions,
    category: manifest.category || 'custom',
    ownerAgent: manifest.ownerAgent,
    trust: TRUST_STATES.TEMPORARY,
    installedAtMs: timestampMs()
  };
  const merged = [...packs.filter((pack) => pack.id !== next.id), next];
  write(SKILL_PACK_KEY, merged);
  audit('install', next.id, { version: next.version });
  return {
    installed: true,
    pack: next,
    validation
  };
}

export function setSkillPackEnabled(packId, enabled) {
  const existing = listSkillPacks();
  const target = existing.find((pack) => pack.id === packId);

  if (enabled && target?.ownerAgent) {
    const contractCheck = validateSkillPackAgainstContract(target.ownerAgent, target.permissions, target.id);
    if (!contractCheck.ok) {
      audit('enable_blocked', packId, { ownerAgent: target.ownerAgent, reason: contractCheck.reason });
      return existing;
    }
  }

  const packs = existing.map((pack) => (
    pack.id === packId ? { ...pack, enabled } : pack
  ));
  write(SKILL_PACK_KEY, packs);
  audit(enabled ? 'enable' : 'disable', packId);
  return packs;
}

export function uninstallSkillPack(packId) {
  const packs = listSkillPacks().filter((pack) => pack.id !== packId);
  write(SKILL_PACK_KEY, packs);
  audit('uninstall', packId);
  return packs;
}

export function loadAgentSkillGuidance(agentName) {
  const packs = listSkillPacks().filter((p) => p.enabled);
  const sharedIds = new Set(SHARED_AGENT_SKILL_PACK_IDS[agentName] || []);
  const agentPacks = packs.filter((p) => p.ownerAgent === agentName || sharedIds.has(p.id));
  const guidance = [];
  const activeSteps = [];

  for (const pack of agentPacks) {
    const loaded = SKILL_WORKFLOW_GUIDANCE[pack.id];
    if (loaded) {
      guidance.push({ skillId: pack.id, name: pack.name, guidance: loaded.guidance });
      activeSteps.push(...loaded.steps);
    } else if (pack.permissions?.length > 0) {
      guidance.push({ skillId: pack.id, name: pack.name, guidance: `Active permissions: ${pack.permissions.join(', ')}` });
    }
  }

  return {
    agent: agentName,
    activeSkills: agentPacks.map((p) => p.id),
    guidance,
    recommendedSteps: [...new Set(activeSteps)].slice(0, 8)
  };
}

export function recordSkillPackInvocation(packId) {
  const map = getSkillPackInvocationMap();
  map[packId] = Date.now();
  try { localStorage.setItem(SKILL_PACK_INVOCATION_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function getSkillPackLastInvoked(packId) {
  const map = getSkillPackInvocationMap();
  return map[packId] || null;
}

function getSkillPackInvocationMap() {
  try { return JSON.parse(localStorage.getItem(SKILL_PACK_INVOCATION_KEY) || '{}'); } catch { return {}; }
}
