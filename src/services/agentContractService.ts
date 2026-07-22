const AGENTS: Record<string, string> = {
  ALPHONSO: 'alphonso',
  MIYA: 'miya',
  JOSE: 'jose',
  HECTOR: 'hector',
  MARIA: 'maria',
  MARCUS: 'marcus',
  ECHO: 'echo',
  SENTINEL: 'sentinel',
  NOVA: 'nova'
};

export type AgentId = typeof AGENTS[keyof typeof AGENTS];

export interface AgentExecutionContract {
  role: string;
  allowedActionPrefixes: string[];
  blockedActionPrefixes: string[];
}

export const AGENT_EXECUTION_CONTRACTS: Record<string, AgentExecutionContract> = {
  [AGENTS.JOSE]: {
    role: 'orchestrator',
    allowedActionPrefixes: ['orchestration_', 'agent_report', 'research_review', 'remote_message_route', 'creative_package_review'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase']
  },
  [AGENTS.ALPHONSO]: {
    role: 'operator',
    allowedActionPrefixes: ['local_operation', 'verification_', 'runtime_', 'orchestration_', 'agent_report', 'execute_command', 'filesystem_'],
    blockedActionPrefixes: ['purchase']
  },
  [AGENTS.MIYA]: {
    role: 'creator',
    allowedActionPrefixes: ['creative_', 'orchestration_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase']
  },
  [AGENTS.HECTOR]: {
    role: 'research',
    allowedActionPrefixes: ['research', 'research_', 'source_', 'citation_', 'agent_report', 'remote_message_route'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.MARIA]: {
    role: 'governance_audit',
    allowedActionPrefixes: ['governance_', 'audit_', 'approval_', 'policy_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.MARCUS]: {
    role: 'distribution_execution',
    allowedActionPrefixes: ['approved_', 'distribution_', 'engagement_', 'performance_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'purchase']
  },
  [AGENTS.ECHO]: {
    role: 'memory_historian',
    allowedActionPrefixes: ['memory_', 'retention_', 'knowledge_', 'timeline_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.SENTINEL]: {
    role: 'security_monitoring',
    allowedActionPrefixes: ['security_', 'risk_', 'permission_', 'audit_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  },
  [AGENTS.NOVA]: {
    role: 'opportunity_intelligence',
    allowedActionPrefixes: ['opportunity_', 'analysis_', 'prioritization_', 'strategy_', 'agent_report'],
    blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
  }
};

// Permission-tag prefixes each agent's skill packs are allowed to carry.
// Distinct from allowedActionPrefixes above: those gate orchestration action
// packets, this gates skill-pack permissions declared in skillPackService.js.
const AGENT_SKILL_PERMISSION_PREFIXES: Record<string, string[]> = {
  [AGENTS.JOSE]: ['task_routing', 'approval_gating', 'cross_agent_synthesis', 'execution_tracking', 'workflows.', 'runtime.read'],
  [AGENTS.ALPHONSO]: ['workflows.', 'runtime.', 'code.', 'local_operation', 'verification_', 'execute_command', 'filesystem_'],
  [AGENTS.MIYA]: ['media.', 'video.', 'image.', 'creative.', 'runway.'],
  [AGENTS.HECTOR]: ['market_research', 'content_strategy', 'campaign_planning', 'workflow_review', 'research', 'competitive_scan', 'source_verification', 'citation_gathering', 'confidence_scoring', 'feed_monitoring'],
  [AGENTS.MARIA]: ['workflow.audit', 'risk.', 'claim.', 'approval.', 'trust.', 'receipt.', 'evidence.', 'state.'],
  [AGENTS.MARCUS]: ['distribution.', 'engagement.', 'performance.', 'approved_'],
  [AGENTS.ECHO]: ['memory.', 'retention.', 'knowledge.', 'timeline.'],
  [AGENTS.SENTINEL]: ['security.', 'risk.', 'permission.', 'audit.'],
  [AGENTS.NOVA]: ['opportunity.', 'analysis.', 'prioritization.', 'strategy.']
};

// Permission tags no agent skill pack may carry except Alphonso's own operator role.
const UNIVERSAL_BLOCKED_SKILL_PERMISSIONS = ['filesystem.write', 'execute_command', 'external_publish', 'purchase'];

// Optional narrower allowlist for a SPECIFIC pack ID, scoped tighter than its
// owning agent's default AGENT_SKILL_PERMISSION_PREFIXES. Lets a multi-skill
// library (e.g. Miya's 5 packs) enforce per-skill boundaries instead of only
// a flat per-agent boundary — e.g. Miya's brand-identity pack should not be
// able to carry video/runway permissions even though Miya's agent-wide list
// allows them for her video-generation pack. Packs with no entry here fall
// back to the agent-wide list (fully backward compatible).
const AGENT_SKILL_PACK_SCOPE_OVERRIDES: Record<string, string[]> = {
  'pack.miya-creative-image': ['media.generate', 'image.', 'creative.preview'],
  'pack.miya-ui-ux-design': ['creative.ui_direction', 'creative.ux_flow', 'creative.wireframe'],
  'pack.miya-brand-identity': ['creative.brand_direction', 'creative.style_guide'],
  'pack.miya-motion-graphics': ['media.generate', 'video.motion', 'creative.animation'],
  // Miya new packs - per-pack scope overrides
  'pack.miya-typography-system': ['creative.typography', 'creative.style_guide', 'creative.design_system'],
  'pack.miya-color-palette': ['creative.color', 'creative.style_guide', 'creative.brand_direction'],
  'pack.miya-content-strategy': ['creative.content_strategy', 'creative.copywriting', 'creative.messaging'],
  'pack.miya-video-storyboarding': ['video.storyboard', 'creative.direction', 'video.shot_list'],
  'pack.miya-social-media-design': ['creative.social', 'image.compose', 'creative.campaign'],
  'pack.miya-editorial-design': ['creative.editorial', 'creative.layout', 'creative.typography'],
  'pack.miya-animation-design': ['creative.animation', 'video.motion', 'creative.interaction'],
  'pack.miya-illustration-style': ['image.illustration', 'creative.style_guide', 'creative.direction'],
  'pack.miya-video-editing': ['video.editing', 'video.transitions', 'creative.post_production'],
  'pack.miya-landing-page': ['creative.landing_page', 'creative.ui_direction', 'creative.campaign'],
  'pack.miya-dashboard-design': ['creative.dashboard', 'creative.ui_direction', 'creative.data_visualization'],
  'pack.miya-brand-guidelines': ['creative.brand_guidelines', 'creative.style_guide', 'creative.brand_direction'],
  'pack.miya-icon-system': ['image.icon', 'creative.style_guide', 'creative.design_system'],
  'pack.miya-design-system': ['creative.design_system', 'creative.component_library', 'creative.style_guide'],
  'pack.miya-user-research': ['creative.user_research', 'creative.usability', 'creative.persona'],
  'pack.miya-motion-system': ['creative.motion_system', 'creative.animation', 'creative.interaction'],
  // Marcus new packs - per-pack scope overrides
  'pack.marcus-github-releases': ['distribution.github', 'approved_dispatch', 'engagement.track'],
  'pack.marcus-slack-notifications': ['distribution.slack', 'engagement.notify', 'approved_dispatch'],
  'pack.marcus-release-readiness': ['distribution.readiness', 'performance.check', 'approved_dispatch'],
  'pack.marcus-security-audit': ['distribution.security', 'performance.audit', 'approved_dispatch'],
  'pack.marcus-risk-detection': ['distribution.risk', 'performance.assessment', 'approved_dispatch'],
  'pack.marcus-integration-validation': ['distribution.validation', 'performance.integration', 'approved_dispatch'],
  'pack.marcus-deployment-execution': ['distribution.deploy', 'approved_dispatch', 'performance.verify'],
  'pack.marcus-changelog-generation': ['distribution.changelog', 'approved_dispatch', 'engagement.track'],
  'pack.marcus-asset-distribution': ['distribution.assets', 'approved_dispatch', 'performance.track'],
  'pack.marcus-notification-routing': ['distribution.routing', 'engagement.notify', 'approved_dispatch'],
  'pack.marcus-approval-gatekeeping': ['distribution.gate', 'approved_dispatch', 'performance.verify'],
  'pack.marcus-version-management': ['distribution.versioning', 'approved_dispatch', 'performance.track'],
  'pack.marcus-rollback-execution': ['distribution.rollback', 'approved_dispatch', 'performance.verify'],
  'pack.marcus-release-reporting': ['distribution.reporting', 'performance.report', 'approved_dispatch'],
  'pack.marcus-compliance-distribution': ['distribution.compliance', 'performance.audit', 'approved_dispatch'],
  'pack.marcus-team-communication': ['distribution.communication', 'engagement.notify', 'approved_dispatch'],
  // Echo new packs - per-pack scope overrides
  'pack.echo-decision-capture': ['memory.decisions', 'knowledge.context', 'timeline.decisions'],
  'pack.echo-retention-classification': ['retention.classify', 'retention.policies', 'memory.categories'],
  'pack.echo-confidence-normalization': ['memory.confidence', 'knowledge.quality', 'retention.score'],
  'pack.echo-knowledge-indexing': ['knowledge.index', 'memory.retrieve', 'timeline.search'],
  'pack.echo-historical-context': ['knowledge.context', 'timeline.history', 'memory.context'],
  'pack.echo-audit-trail': ['timeline.audit', 'memory.trail', 'knowledge追溯'],
  'pack.echo-memory-synthesis-advanced': ['memory.synthesize', 'knowledge.merge', 'timeline.merge'],
  'pack.echo-context-retrieval': ['memory.retrieve', 'knowledge.search', 'timeline.query'],
  'pack.echo-memory-pruning': ['retention.prune', 'memory.cleanup', 'retention.archive'],
  'pack.echo-session-continuity': ['memory.session', 'knowledge.continuity', 'timeline.session'],
  'pack.echo-memory-validation': ['memory.validate', 'knowledge.verify', 'retention.quality'],
  'pack.echo-timeline-construction': ['timeline.construct', 'memory.timeline', 'knowledge.temporal'],
  'pack.echo-knowledge-graph': ['knowledge.graph', 'memory.relate', 'knowledge.edges'],
  'pack.echo-memory-reporting': ['memory.report', 'retention.summary', 'knowledge.stats'],
  'pack.echo-preference-learning': ['memory.preferences', 'knowledge.user', 'retention.personal'],
  'pack.echo-decision-diff': ['memory.diff', 'knowledge.compare', 'timeline.changes'],
  // Sentinel new packs - per-pack scope overrides
  'pack.sentinel-connector-risk': ['security.connector', 'risk.assessment', 'audit.findings'],
  'pack.sentinel-secret-hygiene': ['security.secrets', 'audit.scan', 'risk.exposure'],
  'pack.sentinel-permission-audit': ['permission.audit', 'security.permissions', 'audit.findings'],
  'pack.sentinel-automation-safety': ['security.automation', 'risk.safety', 'audit.automation'],
  'pack.sentinel-policy-compliance': ['security.policy', 'audit.compliance', 'risk.violation'],
  'pack.sentinel-threat-detection': ['security.threat', 'risk.detection', 'audit.threat'],
  'pack.sentinel-csp-audit': ['security.csp', 'audit.policy', 'risk.injection'],
  'pack.sentinel-dependency-audit': ['security.dependencies', 'audit.packages', 'risk.supply'],
  'pack.sentinel-connector-gating': ['security.gating', 'permission.connector', 'audit.gate'],
  'pack.sentinel-runtime-monitoring': ['security.runtime', 'audit.monitoring', 'risk.runtime'],
  'pack.sentinel-approval-enforcement': ['security.approval', 'permission.enforcement', 'audit.approval'],
  'pack.sentinel-data-protection': ['security.data', 'audit.data', 'risk.data_leak'],
  'pack.sentinel-injection-scan': ['security.injection', 'risk.injection', 'audit.input'],
  'pack.sentinel-auth-audit': ['security.auth', 'audit.authentication', 'risk.credential'],
  'pack.sentinel-risk-scoring': ['risk.scoring', 'security.classification', 'audit.risk'],
  'pack.sentinel-security-reporting': ['security.reporting', 'audit.report', 'risk.summary'],
  // Nova new packs - per-pack scope overrides
  'pack.nova-market-analysis': ['analysis.market', 'opportunity.segment', 'strategy.positioning'],
  'pack.nova-prioritization-matrix': ['prioritization.matrix', 'opportunity.rank', 'analysis.impact'],
  'pack.nova-risk-reward': ['opportunity.risk', 'analysis.reward', 'strategy.balance'],
  'pack.nova-timing-analysis': ['opportunity.timing', 'analysis.window', 'strategy sequencing'],
  'pack.nova-effort-estimation': ['opportunity.effort', 'analysis.complexity', 'prioritization.resource'],
  'pack.nova-strategic-alignment': ['strategy.alignment', 'opportunity.strategic', 'analysis.goals'],
  'pack.nova-growth-analysis': ['analysis.growth', 'opportunity.growth', 'strategy.scaling'],
  'pack.nova-competitive-intelligence': ['analysis.competitive', 'opportunity.gap', 'strategy.differentiation'],
  'pack.nova-value-scoring': ['opportunity.value', 'prioritization.score', 'analysis.worth'],
  'pack.nova-resource-optimization': ['strategy.resource', 'analysis.allocation', 'prioritization.capacity'],
  'pack.nova-scenario-modeling': ['analysis.scenario', 'opportunity.projection', 'strategy.modeling'],
  'pack.nova-decision-support': ['strategy.decision', 'analysis.support', 'prioritization.recommendation'],
  'pack.nova-capability-assessment': ['analysis.capability', 'opportunity readiness', 'strategy.maturity'],
  'pack.nova-trend-forecasting': ['analysis.forecast', 'opportunity.trend', 'strategy.projection'],
  'pack.nova-portfolio-analysis': ['analysis.portfolio', 'prioritization.balance', 'strategyportfolio'],
  'pack.nova-recommendation-engine': ['strategy.recommend', 'prioritization.engine', 'analysis.suggestion'],
  'pack.hector-market-research': ['market_research', 'source_verification', 'citation_gathering'],
  'pack.hector-competitive-analysis': ['competitive_scan', 'market_research', 'campaign_planning'],
  'pack.hector-source-verification': ['source_verification', 'citation_gathering', 'confidence_scoring'],
  'pack.hector-rss-monitoring': ['feed_monitoring', 'source_verification'],
  // Hector new packs - per-pack scope overrides
  'pack.hector-api-documentation-research': ['research.api_docs', 'research.documentation', 'research.lookup'],
  'pack.hector-compliance-research': ['research.compliance', 'research.regulatory', 'research.governance'],
  'pack.hector-trend-analysis': ['market_research.trends', 'competitive_scan.trends', 'market_research.signals'],
  'pack.hector-code-pattern-research': ['research.patterns', 'competitive_scan.code', 'research.architecture'],
  'pack.hector-api-integration-research': ['research.integration', 'research.webhooks', 'research.auth'],
  'pack.hector-security-research': ['research.security', 'research.vulnerabilities', 'research.hardening'],
  'pack.hector-technical-architecture-research': ['research.architecture', 'competitive_scan.systems', 'research.design'],
  'pack.hector-open-source-analysis': ['competitive_scan.oss', 'source_verification.licenses', 'confidence_scoring.dependency'],
  'pack.hector-market-intelligence': ['market_research.intelligence', 'competitive_scan.positioning', 'content_strategy.market'],
  'pack.hector-data-gathering': ['research.data', 'citation_gathering.collection', 'confidence_scoring.metrics'],
  'pack.hector-content-research': ['content_strategy.research', 'market_research.content', 'source_verification.content'],
  'pack.hector-documentation-audit': ['research.audit', 'source_verification.docs', 'citation_gathering.docs'],
  'pack.hector-survey-design': ['research.survey', 'market_research.primary', 'citation_gathering.primary'],
  'pack.hector-source-curation': ['source_verification.curation', 'citation_gathering.curation', 'feed_monitoring.curation'],
  'pack.hector-confidence-scoring': ['confidence_scoring.claims', 'source_verification.evidence', 'citation_gathering.scoring'],
  'pack.hector-research-briefing': ['research.briefing', 'content_strategy.briefing', 'citation_gathering.briefing'],
  'pack.jose-task-routing': ['task_routing', 'execution_tracking'],
  'pack.jose-approval-gating': ['approval_gating', 'execution_tracking'],
  'pack.jose-cross-agent-synthesis': ['cross_agent_synthesis', 'task_routing'],
  'pack.jose-pipeline-governance': ['execution_tracking', 'approval_gating'],
  // Jose new packs - per-pack scope overrides
  'pack.jose-workflow-design': ['workflows.design', 'workflows.plan', 'workflows.decompose'],
  'pack.jose-strategic-planning': ['workflows.strategic', 'workflows.long_term', 'workflows.roadmap'],
  'pack.jose-dependency-mapping': ['workflows.dependency', 'workflows.mapping', 'workflows.sequence'],
  'pack.jose-agent-coordination': ['task_routing.coordinate', 'task_routing.delegate', 'task_routing.monitor'],
  'pack.jose-parallel-orchestration': ['task_routing.parallel', 'task_routing.concurrent', 'execution_tracking.parallel'],
  'pack.jose-task-prioritization': ['task_routing.prioritize', 'task_routing.sequence', 'task_routing.urgent'],
  'pack.jose-risk-assessment': ['approval_gating.risk', 'approval_gating.assess', 'approval_gating.classify'],
  'pack.jose-quality-gates': ['approval_gating.quality', 'approval_gating.verify', 'approval_gating.validate'],
  'pack.jose-compliance-checks': ['approval_gating.compliance', 'approval_gating.policy', 'approval_gating.audit'],
  'pack.jose-progress-tracking': ['execution_tracking.progress', 'execution_tracking.monitor', 'execution_tracking.status'],
  'pack.jose-status-reporting': ['execution_tracking.report', 'execution_tracking.summary', 'execution_tracking.dashboard'],
  'pack.jose-performance-metrics': ['execution_tracking.metrics', 'execution_tracking.performance', 'execution_tracking.analytics'],
  'pack.jose-workflow-optimization': ['workflows.optimize', 'workflows.improve', 'workflows.streamline'],
  'pack.jose-bottleneck-detection': ['execution_tracking.bottleneck', 'execution_tracking.blocker', 'execution_tracking.delay'],
  'pack.jose-continuous-improvement': ['workflows.learn', 'workflows.adapt', 'workflows.evolve'],
  'pack.jose-stakeholder-communication': ['agent_report.stakeholder', 'agent_report.status', 'agent_report.progress'],
  // Maria packs - per-pack scope overrides
  'pack.maria-requirements-analysis': ['workflow.audit.requirements', 'workflow.audit.analysis', 'workflow.audit.organize'],
  'pack.maria-risk-classification': ['risk.classify', 'risk.assess', 'risk.categorize'],
  'pack.maria-compliance-auditing': ['workflow.audit.compliance', 'workflow.audit.verify', 'workflow.audit.enforce'],
  'pack.maria-approval-workflow': ['approval.workflow', 'approval.gate', 'approval.track'],
  'pack.maria-evidence-collection': ['evidence.collect', 'evidence.verify', 'evidence.document'],
  'pack.maria-claim-verification': ['claim.verify', 'claim.validate', 'claim.audit'],
  'pack.maria-policy-enforcement': ['policy.enforce', 'policy.audit', 'policy.verify'],
  'pack.maria-audit-trail': ['receipt.audit', 'receipt.track', 'receipt.verify'],
  'pack.maria-trust-audit': ['trust.audit', 'trust.verify', 'trust.validate'],
  'pack.maria-state-verification': ['state.verify', 'state.audit', 'state.validate'],
  'pack.maria-brand-safety': ['workflow.audit.brand', 'workflow.audit.safety', 'workflow.audit.compliance'],
  'pack.maria-content-moderation': ['workflow.audit.content', 'workflow.audit.moderate', 'workflow.audit.review'],
  'pack.maria-quality-assurance': ['workflow.audit.quality', 'workflow.audit.assurance', 'workflow.audit.verify'],
  'pack.maria-documentation-review': ['workflow.audit.documentation', 'workflow.audit.review', 'workflow.audit.approve'],
  'pack.maria-stakeholder-reporting': ['agent_report.stakeholder', 'agent_report.status', 'agent_report.progress'],
  'pack.maria-incident-response': ['workflow.audit.incident', 'workflow.audit.response', 'workflow.audit.resolve'],
  // Alphonso packs - per-pack scope overrides
  'pack.coding.full-stack': ['code.write', 'code.edit', 'code.refactor', 'runtime.test'],
  'pack.coding.tdd': ['code.test.first', 'code.test.verify', 'code.refactor.minimal'],
  'pack.alphonso-typescript-mastery': ['code.typescript.strict', 'code.typescript.types', 'code.typescript.refactor'],
  'pack.alphonso-rust-operations': ['code.rust.tauri', 'code.rust.async', 'code.rust.error_handling'],
  'pack.alphonso-react-patterns': ['code.react.hooks', 'code.react.components', 'code.react.performance'],
  'pack.alphonso-python-voice': ['code.python.fastapi', 'code.python.testing', 'code.python.async'],
  'pack.alphonso-code-review': ['code.review', 'code.suggest', 'code.validate', 'code.security.scan'],
  'pack.alphonso-build-verification': ['verification.build', 'verification.test', 'verification.lint', 'verification.typecheck'],
  'pack.alphonso-refactoring': ['code.refactor', 'code.simplify', 'code.optimize', 'code.extract'],
  'pack.debugging.root-cause': ['runtime.debug.observe', 'runtime.debug.hypothesize', 'runtime.debug.test', 'runtime.debug.verify'],
  'pack.alphonso-runtime-diagnostics': ['runtime.monitor', 'runtime.diagnose', 'runtime.profile', 'runtime.optimize'],
  'pack.alphonso-security-audit': ['verification.security.scan', 'verification.security.review', 'verification.security.harden', 'verification.secrets.check'],
  'pack.github.integration': ['runtime.github.search', 'runtime.github.issue', 'runtime.github.pr', 'runtime.github.repo'],
  'pack.alphonso-performance-optimization': ['runtime.perf.profile', 'runtime.perf.benchmark', 'runtime.perf.memory', 'runtime.perf.bundle'],
  'pack.alphonso-api-integration': ['code.api.rest', 'code.api.graphql', 'code.api.testing', 'code.api.docs'],
  'pack.alphonso-error-handling': ['code.error.boundary', 'code.error.logging', 'code.error.recovery', 'code.error.monitoring']
};

export interface SkillPermissionValidationResult {
  ok: boolean;
  reason: string | null;
  offendingPermissions?: string[];
}

/**
 * Cross-checks a skill pack's declared permissions against its owning agent's
 * execution contract. Packs with no ownerAgent (generic/cross-agent workflow
 * packs) are not scoped by this check — only agent-owned packs are.
 *
 * When `packId` is supplied and has an entry in
 * AGENT_SKILL_PACK_SCOPE_OVERRIDES, that pack is validated against its own
 * narrower allowlist instead of the agent-wide default — this is the
 * per-skill scoping layer on top of the original per-agent check. Omitting
 * `packId` (or passing one with no override) preserves the original
 * agent-wide behavior exactly.
 */
export function validateSkillPackAgainstContract(agentName: string | undefined, permissions: string[] = [], packId?: string): SkillPermissionValidationResult {
  if (!agentName) {
    return { ok: true, reason: null };
  }
  const contract = AGENT_EXECUTION_CONTRACTS[agentName];
  const overridePrefixes = packId && AGENT_SKILL_PACK_SCOPE_OVERRIDES[packId];
  const legacyHectorPackIds = new Set([
    'pack.hector-professional-marketing', 'pack.hector-market-research',
    'pack.hector-competitive-analysis', 'pack.hector-source-verification',
    'pack.hector-rss-monitoring'
  ]);
  const usesAgentWideTaxonomyScope =
    (agentName === AGENTS.HECTOR && packId?.startsWith('pack.hector-') && !legacyHectorPackIds.has(packId)) ||
    (agentName === AGENTS.ECHO && packId?.startsWith('pack.echo-')) ||
    (agentName === AGENTS.NOVA && packId?.startsWith('pack.nova-'));
  const allowedPrefixes = usesAgentWideTaxonomyScope
    ? AGENT_SKILL_PERMISSION_PREFIXES[agentName]
    : overridePrefixes || AGENT_SKILL_PERMISSION_PREFIXES[agentName];
  if (!contract || !allowedPrefixes) {
    // Unknown agent or no declared skill-permission scope — nothing to validate against.
    return { ok: true, reason: null };
  }

  const offendingPermissions = (permissions || []).filter((permission) => {
    const value = String(permission || '').toLowerCase();
    if (agentName !== AGENTS.ALPHONSO && startsWithAny(value, UNIVERSAL_BLOCKED_SKILL_PERMISSIONS)) {
      return true;
    }
    return !startsWithAny(value, allowedPrefixes);
  });

  if (offendingPermissions.length > 0) {
    return {
      ok: false,
      reason: `${agentName} contract does not permit skill permissions: ${offendingPermissions.join(', ')}.`,
      offendingPermissions
    };
  }
  return { ok: true, reason: null };
}

export interface AgentContractPacket {
  toAgent?: string;
  actionType?: string;
  commandPreview?: string;
}

export interface ContractValidationResult {
  ok: boolean;
  reason: string | null;
}

function startsWithAny(value: string, prefixes: string[] = []): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function validateAgentExecutionContract(packet: AgentContractPacket): ContractValidationResult {
  const toAgent = packet?.toAgent;
  const action = String(packet?.actionType || '').toLowerCase();
  const preview = String(packet?.commandPreview || '').toLowerCase();
  if (!toAgent) {
    return { ok: false, reason: 'Missing toAgent — contract validation requires an explicit target agent.' };
  }

  const contract = AGENT_EXECUTION_CONTRACTS[toAgent];

  if (!contract) {
    return { ok: true, reason: null };
  }

  const blockedByPrefix = startsWithAny(action, contract.blockedActionPrefixes);
  const previewStatesDisabled = /disabled unless separately approved|requires shayan approval before|read-only|draft\/package only/i.test(preview);
  const blockedByPreview = /execute|delete|remove|format|publish|upload|buy|purchase|post/.test(preview)
    && !previewStatesDisabled
    && toAgent !== AGENTS.ALPHONSO;
  if (blockedByPrefix || blockedByPreview) {
    return {
      ok: false,
      reason: `${toAgent} contract blocked action "${packet?.actionType || 'unknown'}".`
    };
  }

  const allowed = startsWithAny(action, contract.allowedActionPrefixes);
  if (!allowed && action) {
    return {
      ok: false,
      reason: `${toAgent} contract does not allow action "${packet.actionType}".`
    };
  }
  return { ok: true, reason: null };
}
