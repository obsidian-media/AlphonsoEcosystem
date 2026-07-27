import { TRUST_STATES } from './trustModel';

export const MARCUS_BASE_PACKS = [
  {
    id: 'pack.marcus-github-releases',
    name: 'Marcus GitHub Releases',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.github', 'approved_dispatch', 'engagement.track'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Create a GitHub release with changelog and build artifacts',
      'Upload signed binaries to a tagged release',
      'List recent releases for version audit'
    ]
  },
  {
    id: 'pack.marcus-slack-notifications',
    name: 'Marcus Slack Notifications',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.slack', 'engagement.notify', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Post release announcement to Slack with summary and links',
      'Notify team channels about deployment status',
      'Send rollback notification with incident details'
    ]
  },
  {
    id: 'pack.marcus-release-readiness',
    name: 'Marcus Release Readiness',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.readiness', 'performance.check', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Run release readiness checklist before version promotion',
      'Verify all gates pass before publishing',
      'Generate release readiness report for stakeholder review'
    ]
  },
  {
    id: 'pack.marcus-security-audit',
    name: 'Marcus Security Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.security', 'performance.audit', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit build artifacts for security vulnerabilities',
      'Verify dependency audit passes before release',
      'Check signing and integrity of distributed packages'
    ]
  },
  {
    id: 'pack.marcus-risk-detection',
    name: 'Marcus Risk Detection',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.risk', 'performance.assessment', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify deployment risks in release candidate',
      'Assess breaking change impact on downstream consumers',
      'Flag version compatibility issues before distribution'
    ]
  },
  {
    id: 'pack.marcus-integration-validation',
    name: 'Marcus Integration Validation',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.validation', 'performance.integration', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Validate connector integrations before release',
      'Run integration test suite against release candidate',
      'Verify API contract compatibility across versions'
    ]
  },
  {
    id: 'pack.marcus-deployment-execution',
    name: 'Marcus Deployment Execution',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.deploy', 'approved_dispatch', 'performance.verify'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Execute staged deployment to production',
      'Run deployment verification checklist post-release',
      'Trigger rollback if health checks fail'
    ]
  },
  {
    id: 'pack.marcus-changelog-generation',
    name: 'Marcus Changelog Generation',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.changelog', 'approved_dispatch', 'engagement.track'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate changelog from commit history for a release',
      'Format changelog with categorized breaking changes',
      'Attach changelog to GitHub release automatically'
    ]
  },
  {
    id: 'pack.marcus-asset-distribution',
    name: 'Marcus Asset Distribution',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.assets', 'approved_dispatch', 'performance.track'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Upload build artifacts to release and distribution channels',
      'Verify asset checksums and signatures',
      'Track download metrics for distributed assets'
    ]
  },
  {
    id: 'pack.marcus-notification-routing',
    name: 'Marcus Notification Routing',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.routing', 'engagement.notify', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Route release notifications to appropriate team channels',
      'Send targeted alerts based on deployment impact',
      'Manage notification escalation for critical releases'
    ]
  },
  {
    id: 'pack.marcus-approval-gatekeeping',
    name: 'Marcus Approval Gatekeeping',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.gate', 'approved_dispatch', 'performance.verify'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Enforce approval gates before production deployment',
      'Verify Maria governance clearance before release',
      'Block distribution if approval conditions are not met'
    ]
  },
  {
    id: 'pack.marcus-version-management',
    name: 'Marcus Version Management',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.versioning', 'approved_dispatch', 'performance.track'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Manage semantic versioning for release candidates',
      'Tag and archive previous versions during promotion',
      'Verify version consistency across package manifests'
    ]
  },
  {
    id: 'pack.marcus-rollback-execution',
    name: 'Marcus Rollback Execution',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.rollback', 'approved_dispatch', 'performance.verify'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Execute rollback to previous stable version',
      'Verify rollback integrity and service health',
      'Notify team of rollback with root cause summary'
    ]
  },
  {
    id: 'pack.marcus-release-reporting',
    name: 'Marcus Release Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.reporting', 'performance.report', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate post-release metrics report',
      'Summarize distribution success and failure points',
      'Track release adoption and rollback rates'
    ]
  },
  {
    id: 'pack.marcus-compliance-distribution',
    name: 'Marcus Compliance Distribution',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.compliance', 'performance.audit', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify license compliance before distributing packages',
      'Ensure export control requirements are met',
      'Audit distribution for regulatory compliance'
    ]
  },
  {
    id: 'pack.marcus-team-communication',
    name: 'Marcus Team Communication',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.communication', 'engagement.notify', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Send release status updates to stakeholders',
      'Coordinate deployment windows with team leads',
      'Post post-mortem summaries after incident resolution'
    ]
  },
  {
    id: 'pack.echo-memory-synthesis',
    name: 'Echo Memory Synthesis Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.synthesize', 'retention.classify', 'knowledge.timeline', 'timeline.summarize'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Echo new packs ──────────────────────────────────────────────────
];
