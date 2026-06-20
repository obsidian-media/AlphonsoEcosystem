import { TRUST_STATES, timestampMs } from './trustModel';

const SKILL_PACK_KEY = 'alphonso_skill_packs_v1';
const SKILL_AUDIT_KEY = 'alphonso_skill_pack_audit_v1';

const BASE_PACKS = [
  {
    id: 'pack.marketing-core',
    name: 'Marketing Pack',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.read', 'memory.write', 'workflows.read'],
    category: 'marketing',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.developer-core',
    name: 'Developer Pack',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.read', 'workflows.write', 'runtime.read'],
    category: 'developer',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.codex-professional-coding',
    name: 'OpenAI Codex Professional Coding Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.read', 'workflows.write', 'runtime.read', 'code.review', 'code.plan'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.hector-professional-marketing',
    name: 'Hector Professional Marketing Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.jose-professional-orchestration',
    name: 'Jose Professional Orchestration Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['task_routing', 'approval_gating', 'cross_agent_synthesis', 'execution_tracking'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.miya-runway-video-generation',
    name: 'Miya Runway Video Generation Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['media.generate', 'video.draft', 'creative.preview', 'runway.api'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    source: 'runwayml/skills',
    sourceSkill: 'rw-generate-video',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.maria-audit-governance',
    name: 'Maria Audit Governance Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit', 'risk.classification', 'claim.verification', 'approval.integrity'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.maria-trust-verification',
    name: 'Maria Trust Verification Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['trust.validation', 'receipt.validation', 'evidence.review', 'state.confirmation'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED
  }
];

const AGENT_WORKFLOW_SKILL_DEFS = [
  {
    id: 'pack.workflow.find-skills',
    name: 'find-skills',
    description: 'Discover and install skills from skills.sh directly inside an agent session.',
    permissions: ['skills.discover', 'skills.install', 'session.read']
  },
  {
    id: 'pack.workflow.agent-browser',
    name: 'agent-browser',
    description: 'Automate browser navigation, clicks, form fills, extraction, and screenshots.',
    permissions: ['browser.navigate', 'browser.click', 'browser.fill', 'browser.extract', 'browser.screenshot']
  },
  {
    id: 'pack.workflow.skill-creator',
    name: 'skill-creator',
    description: 'Create, test, and publish new skills from within the agent environment.',
    permissions: ['skills.create', 'skills.test', 'skills.publish']
  },
  {
    id: 'pack.workflow.brainstorming',
    name: 'brainstorming',
    description: 'Use structured ideation and problem decomposition during task intake.',
    permissions: ['ideation.organize', 'problem.decompose']
  },
  {
    id: 'pack.workflow.browser-use',
    name: 'browser-use',
    description: 'Use visual browser automation when page structure is inconsistent or unknown.',
    permissions: ['browser.vision', 'browser.interpret', 'browser.navigate']
  },
  {
    id: 'pack.workflow.systematic-debugging',
    name: 'systematic-debugging',
    description: 'Debug by hypothesis, test, and verification rather than random edits.',
    permissions: ['debug.observe', 'debug.hypothesize', 'debug.test', 'debug.verify']
  },
  {
    id: 'pack.workflow.writing-plans',
    name: 'writing-plans',
    description: 'Write structured implementation plans before starting complex tasks.',
    permissions: ['planning.decompose', 'planning.sequence', 'planning.checkpoints']
  },
  {
    id: 'pack.workflow.executing-plans',
    name: 'executing-plans',
    description: 'Execute plans step-by-step with checkpoints and verification.',
    permissions: ['execution.steps', 'execution.checkpoints', 'verification.before_completion']
  },
  {
    id: 'pack.workflow.test-driven-development',
    name: 'test-driven-development',
    description: 'Run a TDD loop: fail, implement minimally, verify, and refactor.',
    permissions: ['tests.write_first', 'tests.verify', 'refactor.minimal']
  },
  {
    id: 'pack.workflow.requesting-code-review',
    name: 'requesting-code-review',
    description: 'Prepare code for review with self-review, test coverage, and PR context.',
    permissions: ['review.self', 'review.prepare', 'review.request']
  },
  {
    id: 'pack.workflow.subagent-driven-development',
    name: 'subagent-driven-development',
    description: 'Orchestrate specialized subagents across different parts of a task.',
    permissions: ['subagents.orchestrate', 'task.specialize', 'task.coordinate']
  },
  {
    id: 'pack.workflow.verification-before-completion',
    name: 'verification-before-completion',
    description: 'Force a verification pass before a task can be marked complete.',
    permissions: ['verification.require', 'completion.gate', 'release.truth']
  },
  {
    id: 'pack.workflow.dispatching-parallel-agents',
    name: 'dispatching-parallel-agents',
    description: 'Split work across parallel subagents and coordinate their outputs.',
    permissions: ['parallel.dispatch', 'parallel.coordinate', 'parallel.verify']
  },
  {
    id: 'pack.workflow.using-git-worktrees',
    name: 'using-git-worktrees',
    description: 'Use git worktrees to run parallel sessions on isolated branches.',
    permissions: ['git.worktree', 'branch.isolation', 'parallel.workspace']
  },
  {
    id: 'pack.workflow.finishing-a-development-branch',
    name: 'finishing-a-development-branch',
    description: 'Close branches cleanly with tests, commits, pull requests, and review requests.',
    permissions: ['tests.run', 'commit.write', 'pr.open', 'review.request']
  },
  {
    id: 'pack.workflow.ralph-tui-prd',
    name: 'ralph-tui-prd',
    description: 'Generate a structured prd.json task list for autonomous loop execution.',
    permissions: ['tasklist.prd', 'autonomy.loop', 'task.decompose']
  },
  {
    id: 'pack.workflow.ralph-tui-create-beads',
    name: 'ralph-tui-create-beads',
    description: 'Create dependency-aware Beads tasks for autonomous loop execution.',
    permissions: ['tasklist.dependencies', 'autonomy.loop', 'task.track']
  },
  {
    id: 'pack.workflow.ralph-tui-create-json',
    name: 'ralph-tui-create-json',
    description: 'Create JSON-format task lists for autonomous task execution.',
    permissions: ['tasklist.json', 'autonomy.loop', 'task.export']
  },
  {
    id: 'pack.workflow.ralph-wiggum',
    name: 'ralph-wiggum',
    description: 'Use the simplified autonomous loop technique with minimal setup.',
    permissions: ['autonomy.loop', 'setup.minimal', 'task.retry']
  },
  {
    id: 'pack.workflow.ralph-loop',
    name: 'ralph-loop',
    description: 'Run a sustained autonomous task completion loop with agent mode.',
    permissions: ['autonomy.loop', 'task.persistence', 'task.retry']
  }
];

const AGENT_WORKFLOW_PACKS = AGENT_WORKFLOW_SKILL_DEFS.map((skill) => ({
  id: skill.id,
  name: skill.name,
  version: '1.0.0',
  enabled: true,
  permissions: skill.permissions,
  category: 'agent_workflow',
  topic: 'agent-workflows',
  source: 'skills.sh/topic/agent-workflows',
  description: skill.description,
  trust: TRUST_STATES.VERIFIED
}));

const DEFAULT_PACKS = [...BASE_PACKS, ...AGENT_WORKFLOW_PACKS];

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

  const packs = listSkillPacks();
  const next = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled: manifest.enabled ?? true,
    permissions: manifest.permissions,
    category: manifest.category || 'custom',
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
  const packs = listSkillPacks().map((pack) => (
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

const SKILL_WORKFLOW_GUIDANCE = {
  'pack.codex-professional-coding': {
    guidance: 'Apply code review best practices. Plan before coding. Verify with tests. Use clear variable names and modular structure.',
    steps: ['Analyze requirements', 'Plan architecture', 'Write modular code', 'Add tests', 'Review and refactor']
  },
  'pack.developer-core': {
    guidance: 'Follow standard development workflow: plan, implement, test, verify.',
    steps: ['Understand task', 'Plan approach', 'Implement', 'Test', 'Verify']
  },
  'pack.workflow.writing-plans': {
    guidance: 'Write a structured implementation plan before starting. Break into milestones with checkpoints.',
    steps: ['Decompose into milestones', 'Define checkpoints', 'Sequence dependencies', 'Set acceptance criteria']
  },
  'pack.workflow.executing-plans': {
    guidance: 'Execute step-by-step with verification at each checkpoint. Do not skip verification.',
    steps: ['Execute step 1', 'Verify checkpoint', 'Execute step 2', 'Verify checkpoint', 'Final verification']
  },
  'pack.workflow.test-driven-development': {
    guidance: 'Write tests first, then implement minimally to pass, then refactor.',
    steps: ['Write failing test', 'Implement minimally', 'Verify test passes', 'Refactor', 'Repeat']
  },
  'pack.workflow.systematic-debugging': {
    guidance: 'Debug by hypothesis: observe, hypothesize, test, verify. Do not make random changes.',
    steps: ['Observe symptoms', 'Form hypothesis', 'Test hypothesis', 'Verify fix', 'Document root cause']
  },
  'pack.workflow.brainstorming': {
    guidance: 'Use structured ideation. Generate multiple approaches before committing to one.',
    steps: ['Generate options', 'Evaluate feasibility', 'Select best approach', 'Validate assumptions']
  },
  'pack.workflow.verification-before-completion': {
    guidance: 'Force a verification pass before marking any task complete. Check all criteria.',
    steps: ['Run all tests', 'Verify acceptance criteria', 'Check edge cases', 'Confirm completion']
  },
  'pack.workflow.skill-creator': {
    guidance: 'When creating new skills, define clear permissions, test in isolation, then publish.',
    steps: ['Define skill manifest', 'Implement permissions', 'Test skill', 'Publish to registry']
  }
};

export function loadAgentSkillGuidance(agentName) {
  const packs = listSkillPacks().filter((p) => p.enabled);
  const agentPacks = packs.filter((p) => p.ownerAgent === agentName || p.category === 'agent_workflow');
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
