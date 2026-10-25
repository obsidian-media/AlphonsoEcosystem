import { TRUST_STATES } from './trustModel';

export const MARIA_BASE_PACKS = [
  {
    id: 'pack.maria-requirements-analysis',
    name: 'Maria Requirements Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.requirements', 'workflow.audit.analysis', 'workflow.audit.organize'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze project requirements and identify gaps',
      'Organize requirements by priority and dependency',
      'Create structured requirement documentation'
    ]
  },
  {
    id: 'pack.maria-risk-classification',
    name: 'Maria Risk Classification',
    version: '1.0.0',
    enabled: true,
    permissions: ['risk.classify', 'risk.assess', 'risk.categorize'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Classify project risks by severity and likelihood',
      'Assess impact of potential issues',
      'Categorize risks for targeted mitigation'
    ]
  },
  {
    id: 'pack.maria-compliance-auditing',
    name: 'Maria Compliance Auditing',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.compliance', 'workflow.audit.verify', 'workflow.audit.enforce'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit compliance with security policies',
      'Verify adherence to data handling requirements',
      'Enforce compliance standards across workflows'
    ]
  },
  {
    id: 'pack.maria-approval-workflow',
    name: 'Maria Approval Workflow',
    version: '1.0.0',
    enabled: true,
    permissions: ['approval.workflow', 'approval.gate', 'approval.track'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design approval workflows for high-risk actions',
      'Gate critical decisions before execution',
      'Track approval status across workflows'
    ]
  },
  {
    id: 'pack.maria-evidence-collection',
    name: 'Maria Evidence Collection',
    version: '1.0.0',
    enabled: true,
    permissions: ['evidence.collect', 'evidence.verify', 'evidence.document'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Collect evidence for audit findings',
      'Verify authenticity of collected evidence',
      'Document evidence chain for compliance'
    ]
  },
  {
    id: 'pack.maria-claim-verification',
    name: 'Maria Claim Verification',
    version: '1.0.0',
    enabled: true,
    permissions: ['claim.verify', 'claim.validate', 'claim.audit'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify claims made by agents or users',
      'Validate accuracy of reported outcomes',
      'Audit claim consistency across reports'
    ]
  },
  {
    id: 'pack.maria-policy-enforcement',
    name: 'Maria Policy Enforcement',
    version: '1.0.0',
    enabled: true,
    permissions: ['policy.enforce', 'policy.audit', 'policy.verify'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Enforce organizational policies across workflows',
      'Audit policy compliance in agent actions',
      'Verify policy adherence before approvals'
    ]
  },
  {
    id: 'pack.maria-audit-trail',
    name: 'Maria Audit Trail',
    version: '1.0.0',
    enabled: true,
    permissions: ['receipt.audit', 'receipt.track', 'receipt.verify'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Maintain audit trail for critical actions',
      'Track receipt generation across workflows',
      'Verify audit trail completeness'
    ]
  },
  {
    id: 'pack.maria-trust-audit',
    name: 'Maria Trust Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['trust.audit', 'trust.verify', 'trust.validate'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit trust levels across system components',
      'Verify trust claims in agent communications',
      'Validate trust model consistency'
    ]
  },
  {
    id: 'pack.maria-state-verification',
    name: 'Maria State Verification',
    version: '1.0.0',
    enabled: true,
    permissions: ['state.verify', 'state.audit', 'state.validate'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify system state consistency',
      'Audit state transitions in workflows',
      'Validate state integrity across services'
    ]
  },
  {
    id: 'pack.maria-brand-safety',
    name: 'Maria Brand Safety',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.brand', 'workflow.audit.safety', 'workflow.audit.compliance'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Ensure brand consistency in all outputs',
      'Audit content for brand safety compliance',
      'Verify brand guidelines adherence'
    ]
  },
  {
    id: 'pack.maria-content-moderation',
    name: 'Maria Content Moderation',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.content', 'workflow.audit.moderate', 'workflow.audit.review'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Moderate content for policy compliance',
      'Review content before publication',
      'Enforce content standards and guidelines'
    ]
  },
  {
    id: 'pack.maria-quality-assurance',
    name: 'Maria Quality Assurance',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.quality', 'workflow.audit.assurance', 'workflow.audit.verify'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Ensure quality standards in deliverables',
      'Audit quality metrics across workflows',
      'Verify quality gates are enforced'
    ]
  },
  {
    id: 'pack.maria-documentation-review',
    name: 'Maria Documentation Review',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.documentation', 'workflow.audit.review', 'workflow.audit.approve'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Review documentation for accuracy and completeness',
      'Audit documentation standards compliance',
      'Approve documentation for release'
    ]
  },
  {
    id: 'pack.maria-stakeholder-reporting',
    name: 'Maria Stakeholder Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['agent_report.stakeholder', 'agent_report.status', 'agent_report.progress'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate governance status reports for stakeholders',
      'Report compliance findings to management',
      'Communicate audit results to relevant parties'
    ]
  },
  {
    id: 'pack.maria-incident-response',
    name: 'Maria Incident Response',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflow.audit.incident', 'workflow.audit.response', 'workflow.audit.resolve'],
    category: 'agent_skill',
    ownerAgent: 'maria',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Respond to governance incidents and violations',
      'Coordinate incident resolution across agents',
      'Document incident response and lessons learned'
    ]
  },
  {
    id: 'pack.alphonso-runtime-operations',
    name: 'Alphonso Runtime Operations Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['runtime.read', 'runtime.manage', 'workflows.read', 'verification_before_completion', 'local_operation'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.coding.full-stack',
    name: 'Full-Stack Coding',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.write', 'code.edit', 'code.refactor', 'runtime.test'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Add a new Tauri command and corresponding React component',
      'Implement a feature spanning frontend React and backend Rust',
      'Create a full-stack feature with API, service, and UI layers'
    ]
  },
  {
    id: 'pack.coding.tdd',
    name: 'Test-Driven Development',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.test.first', 'code.test.verify', 'code.refactor.minimal'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Write tests for the new connector service, then implement',
      'Add failing tests for edge cases before fixing a bug',
      'Create test suite for a new utility function'
    ]
  },
  {
    id: 'pack.alphonso-typescript-mastery',
    name: 'TypeScript Mastery',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.typescript.strict', 'code.typescript.types', 'code.typescript.refactor'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Convert a .js service to .ts with strict typing',
      'Add generic types to a utility function',
      'Eliminate all `any` types from a module'
    ]
  },
  {
    id: 'pack.alphonso-rust-operations',
    name: 'Rust Operations',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.rust.tauri', 'code.rust.async', 'code.rust.error_handling'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Add a new Tauri command for connector dispatch',
      'Implement async tokio handler for external API',
      'Add proper error handling with Result types'
    ]
  },
  {
    id: 'pack.alphonso-react-patterns',
    name: 'React Patterns',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.react.hooks', 'code.react.components', 'code.react.performance'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Optimize a React component with useMemo and virtualization',
      'Create a custom hook for reusable state logic',
      'Refactor class component to functional with hooks'
    ]
  },
  {
    id: 'pack.alphonso-python-voice',
    name: 'Python Voice Systems',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.python.fastapi', 'code.python.testing', 'code.python.async'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Add a new endpoint to the voice backend',
      'Write pytest tests for voice processing logic',
      'Implement async WebSocket handler for voice streaming'
    ]
  },
  {
    id: 'pack.alphonso-code-review',
    name: 'Code Review',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.review', 'code.suggest', 'code.validate', 'code.security.scan'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Review a pull request for code quality and security',
      'Validate type safety across module boundaries',
      'Scan for hardcoded secrets and敏感 data'
    ]
  },
  {
    id: 'pack.alphonso-build-verification',
    name: 'Build Verification',
    version: '1.0.0',
    enabled: true,
    permissions: ['verification.build', 'verification.test', 'verification.lint', 'verification.typecheck'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Run full build verification before release',
      'Verify all tests pass after a refactor',
      'Run lint and typecheck on changed files'
    ]
  },
  {
    id: 'pack.alphonso-refactoring',
    name: 'Refactoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.refactor', 'code.simplify', 'code.optimize', 'code.extract'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Extract duplicate logic into shared utilities',
      'Simplify a complex conditional with early returns',
      'Optimize a hot path by reducing allocations'
    ]
  },
  {
    id: 'pack.debugging.root-cause',
    name: 'Root-Cause Debugging',
    version: '1.0.0',
    enabled: true,
    permissions: ['runtime.debug.observe', 'runtime.debug.hypothesize', 'runtime.debug.test', 'runtime.debug.verify'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Diagnose why a connector fails intermittently',
      'Trace a memory leak through the application',
      'Identify the root cause of a race condition'
    ]
  },
  {
    id: 'pack.alphonso-runtime-diagnostics',
    name: 'Runtime Diagnostics',
    version: '1.0.0',
    enabled: true,
    permissions: ['runtime.monitor', 'runtime.diagnose', 'runtime.profile', 'runtime.optimize'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Profile memory usage during long-running sessions',
      'Diagnose slow startup time in the application',
      'Monitor connector health and latency'
    ]
  },
  {
    id: 'pack.alphonso-security-audit',
    name: 'Security Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['verification.security.scan', 'verification.security.review', 'verification.security.harden', 'verification.secrets.check'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Scan for hardcoded secrets before commit',
      'Review authentication patterns for vulnerabilities',
      'Harden input validation across API endpoints'
    ]
  },
  {
    id: 'pack.github.integration',
    name: 'GitHub Integration',
    version: '1.0.0',
    enabled: true,
    permissions: ['runtime.github.search', 'runtime.github.issue', 'runtime.github.pr', 'runtime.github.repo'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Search GitHub for similar authentication patterns',
      'Create an issue with detailed reproduction steps',
      'Review a pull request with code suggestions'
    ]
  },
  {
    id: 'pack.alphonso-performance-optimization',
    name: 'Performance Optimization',
    version: '1.0.0',
    enabled: true,
    permissions: ['runtime.perf.profile', 'runtime.perf.benchmark', 'runtime.perf.memory', 'runtime.perf.bundle'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze bundle size and suggest optimizations',
      'Profile CPU usage during heavy operations',
      'Optimize memory allocation patterns'
    ]
  },
  {
    id: 'pack.alphonso-api-integration',
    name: 'API Integration',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.api.rest', 'code.api.graphql', 'code.api.testing', 'code.api.docs'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Add a new REST connector with proper error handling',
      'Create a GraphQL client with typed responses',
      'Write integration tests for external APIs'
    ]
  },
  {
    id: 'pack.alphonso-error-handling',
    name: 'Error Handling',
    version: '1.0.0',
    enabled: true,
    permissions: ['code.error.boundary', 'code.error.logging', 'code.error.recovery', 'code.error.monitoring'],
    category: 'agent_skill',
    ownerAgent: 'alphonso',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Add error boundaries to the Settings view',
      'Implement structured logging for API errors',
      'Add retry logic with exponential backoff'
    ]
  },
  {
    id: 'pack.marcus-distribution-execution',
    name: 'Marcus Distribution Execution Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['distribution.publish', 'distribution.schedule', 'engagement.track', 'performance.report', 'approved_dispatch'],
    category: 'agent_skill',
    ownerAgent: 'marcus',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Marcus new packs ──────────────────────────────────────────────────
];
