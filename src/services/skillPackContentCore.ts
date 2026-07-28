import { TRUST_STATES } from './trustModel';

export const CORE_BASE_PACKS = [
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
    id: 'pack.hector-market-research',
    name: 'Hector Market Research Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['market_research', 'source_verification', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.hector-competitive-analysis',
    name: 'Hector Competitive Analysis Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['competitive_scan', 'market_research', 'campaign_planning'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.hector-source-verification',
    name: 'Hector Source Verification Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['source_verification', 'citation_gathering', 'confidence_scoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.hector-rss-monitoring',
    name: 'Hector RSS Monitoring Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['feed_monitoring', 'source_verification'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Hector new packs ──────────────────────────────────────────────────
  {
    id: 'pack.hector-api-documentation-research',
    name: 'Hector API Documentation Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'source_verification', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research REST API documentation standards and best practices',
      'Compile OpenAPI/Swagger specification guidelines for a target API',
      'Survey authentication patterns across major API providers'
    ]
  },
  {
    id: 'pack.hector-compliance-research',
    name: 'Hector Compliance Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'source_verification', 'confidence_scoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research GDPR compliance requirements for data collection features',
      'Survey SOC 2 audit preparation steps and documentation needs',
      'Investigate industry-specific regulatory constraints for a new market'
    ]
  },
  {
    id: 'pack.hector-trend-analysis',
    name: 'Hector Trend Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['market_research', 'competitive_scan', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze emerging technology trends in the AI assistant space',
      'Track industry adoption curves for competing frameworks',
      'Identify seasonal patterns in developer tool usage'
    ]
  },
  {
    id: 'pack.hector-code-pattern-research',
    name: 'Hector Code Pattern Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'competitive_scan', 'source_verification'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research common architectural patterns for Tauri v2 desktop applications',
      'Survey React state management approaches used in similar projects',
      'Discover testing strategies employed by peer open-source projects'
    ]
  },
  {
    id: 'pack.hector-api-integration-research',
    name: 'Hector API Integration Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'source_verification', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research OAuth2 flow options for a new third-party connector',
      'Survey webhook delivery patterns and retry strategies across providers',
      'Investigate rate limiting approaches for outbound API integrations'
    ]
  },
  {
    id: 'pack.hector-security-research',
    name: 'Hector Security Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'source_verification', 'confidence_scoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research OWASP top 10 vulnerabilities relevant to desktop applications',
      'Survey CSP configuration best practices for Tauri/WebView2 apps',
      'Investigate secure credential storage patterns for local-first software'
    ]
  },
  {
    id: 'pack.hector-technical-architecture-research',
    name: 'Hector Technical Architecture Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'competitive_scan', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research microservices vs monolith tradeoffs for AI companion architectures',
      'Survey local-first data sync patterns used by similar desktop apps',
      'Investigate plugin runtime isolation strategies for extensible platforms'
    ]
  },
  {
    id: 'pack.hector-open-source-analysis',
    name: 'Hector Open Source Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['competitive_scan', 'source_verification', 'confidence_scoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze GitHub repository health metrics for potential dependencies',
      'Evaluate open-source license compatibility for bundling into the app',
      'Compare community activity and maintenance status across competing libraries'
    ]
  },
  {
    id: 'pack.hector-market-intelligence',
    name: 'Hector Market Intelligence',
    version: '1.0.0',
    enabled: true,
    permissions: ['market_research', 'competitive_scan', 'content_strategy'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research competitor pricing models and feature positioning',
      'Survey developer community sentiment around AI assistant tools',
      'Identify underserved market segments for product differentiation'
    ]
  },
  {
    id: 'pack.hector-data-gathering',
    name: 'Hector Data Gathering',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'citation_gathering', 'confidence_scoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Collect structured data points from public sources for a research brief',
      'Gather version, license, and download metrics for library comparisons',
      'Compile contact and metadata from public project pages'
    ]
  },
  {
    id: 'pack.hector-content-research',
    name: 'Hector Content Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['content_strategy', 'market_research', 'source_verification'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Research content formats and topics performing well in the target niche',
      'Survey SEO keyword opportunities for developer-focused content',
      'Analyze competitor content calendars and publishing cadence'
    ]
  },
  {
    id: 'pack.hector-documentation-audit',
    name: 'Hector Documentation Audit',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'source_verification', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Audit existing project documentation for accuracy and completeness',
      'Survey documentation tooling options (Docusaurus, GitBook, MkDocs)',
      'Review onboarding docs against current codebase structure'
    ]
  },
  {
    id: 'pack.hector-survey-design',
    name: 'Hector Survey Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'market_research', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design research survey questions for user needs discovery',
      'Structure interview guides for stakeholder requirement gathering',
      'Create competitive benchmarking survey frameworks'
    ]
  },
  {
    id: 'pack.hector-source-curation',
    name: 'Hector Source Curation',
    version: '1.0.0',
    enabled: true,
    permissions: ['source_verification', 'citation_gathering', 'feed_monitoring'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Curate and rank authoritative sources for a research topic',
      'Maintain a verified source library for recurring research themes',
      'Filter and prioritize RSS feed items by relevance and credibility'
    ]
  },
  {
    id: 'pack.hector-confidence-scoring',
    name: 'Hector Confidence Scoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['confidence_scoring', 'source_verification', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Score research claim confidence based on source count and quality',
      'Assign evidence strength ratings to competing hypotheses',
      'Flag claims that lack sufficient supporting citations'
    ]
  },
  {
    id: 'pack.hector-research-briefing',
    name: 'Hector Research Briefing',
    version: '1.0.0',
    enabled: true,
    permissions: ['research', 'content_strategy', 'citation_gathering'],
    category: 'agent_skill',
    ownerAgent: 'hector',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Compile a morning research briefing from curated RSS feeds',
      'Produce an executive summary of overnight industry developments',
      'Prepare a daily source digest for team review'
    ]
  },
];
