import { TRUST_STATES } from './trustModel';

export const SENTINEL_BASE_PACKS = [
  {
    id: 'pack.sentinel-connector-risk',
    name: 'Sentinel Connector Risk Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.connector', 'risk.assessment', 'audit.findings'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Assess risk level of a new outbound connector before activation',
      'Audit connector permission scope against policy',
      'Flag connectors with excessive data access'
    ]
  },
  {
    id: 'pack.sentinel-secret-hygiene',
    name: 'Sentinel Secret Hygiene',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.secrets', 'audit.scan', 'risk.exposure'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Scan codebase for exposed API keys or tokens',
      'Audit environment variable handling for secret leakage',
      'Verify secrets are not committed to version control'
    ]
  },
  {
    id: 'pack.sentinel-permission-audit',
    name: 'Sentinel Permission Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['permission.audit', 'security.permissions', 'audit.findings'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit agent permission boundaries for policy compliance',
      'Review permission grants for least-privilege violations',
      'Track permission changes across versions'
    ]
  },
  {
    id: 'pack.sentinel-automation-safety',
    name: 'Sentinel Automation Safety',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.automation', 'risk.safety', 'audit.automation'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit automation workflows for unsafe execution patterns',
      'Review automated actions for missing approval gates',
      'Flag self-reinforcing automation loops'
    ]
  },
  {
    id: 'pack.sentinel-policy-compliance',
    name: 'Sentinel Policy Compliance',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.policy', 'audit.compliance', 'risk.violation'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify system behavior matches defined security policies',
      'Audit policy enforcement points for gaps',
      'Track policy violation incidents'
    ]
  },
  {
    id: 'pack.sentinel-threat-detection',
    name: 'Sentinel Threat Detection',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.threat', 'risk.detection', 'audit.threat'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Monitor for anomalous agent behavior patterns',
      'Detect potential injection or prompt manipulation attempts',
      'Flag unexpected outbound data flows'
    ]
  },
  {
    id: 'pack.sentinel-csp-audit',
    name: 'Sentinel CSP Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.csp', 'audit.policy', 'risk.injection'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit Content Security Policy configuration',
      'Verify CSP headers prevent XSS and injection',
      'Review CSP deviations for security impact'
    ]
  },
  {
    id: 'pack.sentinel-dependency-audit',
    name: 'Sentinel Dependency Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.dependencies', 'audit.packages', 'risk.supply'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit npm dependencies for known vulnerabilities',
      'Review dependency supply chain risks',
      'Flag outdated packages with security patches'
    ]
  },
  {
    id: 'pack.sentinel-connector-gating',
    name: 'Sentinel Connector Gating',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.gating', 'permission.connector', 'audit.gate'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify connector dispatch goes through policy gate',
      'Audit connector allowlist/denylist enforcement',
      'Review connector activation approval chain'
    ]
  },
  {
    id: 'pack.sentinel-runtime-monitoring',
    name: 'Sentinel Runtime Monitoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.runtime', 'audit.monitoring', 'risk.runtime'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Monitor runtime environment for security anomalies',
      'Track unexpected process or network activity',
      'Audit runtime configuration for security settings'
    ]
  },
  {
    id: 'pack.sentinel-approval-enforcement',
    name: 'Sentinel Approval Enforcement',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.approval', 'permission.enforcement', 'audit.approval'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify high-risk actions require explicit approval',
      'Audit approval gate bypass attempts',
      'Enforce approval requirements for external actions'
    ]
  },
  {
    id: 'pack.sentinel-data-protection',
    name: 'Sentinel Data Protection',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.data', 'audit.data', 'risk.data_leak'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit data handling for PII exposure risks',
      'Verify encryption at rest and in transit',
      'Review data retention compliance'
    ]
  },
  {
    id: 'pack.sentinel-injection-scan',
    name: 'Sentinel Injection Scan',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.injection', 'risk.injection', 'audit.input'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Scan for SQL, XSS, and command injection vulnerabilities',
      'Review input validation and sanitization',
      'Audit parameterized query usage'
    ]
  },
  {
    id: 'pack.sentinel-auth-audit',
    name: 'Sentinel Auth Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.auth', 'audit.authentication', 'risk.credential'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit authentication flow for security weaknesses',
      'Review credential storage and rotation practices',
      'Verify session management security'
    ]
  },
  {
    id: 'pack.sentinel-risk-scoring',
    name: 'Sentinel Risk Scoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['risk.scoring', 'security.classification', 'audit.risk'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Assign risk scores to identified security findings',
      'Classify vulnerabilities by severity and exploitability',
      'Prioritize remediation based on risk scoring'
    ]
  },
  {
    id: 'pack.sentinel-security-reporting',
    name: 'Sentinel Security Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.reporting', 'audit.report', 'risk.summary'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate security posture reports for stakeholders',
      'Summarize audit findings with remediation guidance',
      'Track security metrics over time'
    ]
  },
  {
    id: 'pack.nova-opportunity-analysis',
    name: 'Nova Opportunity Analysis Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.score', 'analysis.trend', 'prioritization.rank', 'strategy.recommend'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Nova new packs ──────────────────────────────────────────────────
];
