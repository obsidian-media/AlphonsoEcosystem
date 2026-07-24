import { TRUST_STATES, timestampMs } from './trustModel';
import { validateSkillPackAgainstContract } from './agentContractService';

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
    id: 'pack.jose-task-routing',
    name: 'Jose Task Routing Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['task_routing', 'execution_tracking'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.jose-approval-gating',
    name: 'Jose Approval Gating Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['approval_gating', 'execution_tracking'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.jose-cross-agent-synthesis',
    name: 'Jose Cross-Agent Synthesis Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['cross_agent_synthesis', 'task_routing'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.jose-pipeline-governance',
    name: 'Jose Pipeline Governance Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['execution_tracking', 'approval_gating'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.jose-workflow-design',
    name: 'Jose Workflow Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.design', 'workflows.plan', 'workflows.decompose'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design a multi-agent workflow for content production',
      'Plan the decomposition strategy for a complex feature',
      'Create a workflow template for recurring tasks'
    ]
  },
  {
    id: 'pack.jose-strategic-planning',
    name: 'Jose Strategic Planning',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.strategic', 'workflows.long_term', 'workflows.roadmap'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Create a strategic roadmap for product development',
      'Plan long-term agent coordination strategy',
      'Design a phased rollout plan'
    ]
  },
  {
    id: 'pack.jose-dependency-mapping',
    name: 'Jose Dependency Mapping',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.dependency', 'workflows.mapping', 'workflows.sequence'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Map task dependencies for a project',
      'Identify critical path in task sequence',
      'Resolve circular dependencies'
    ]
  },
  {
    id: 'pack.jose-agent-coordination',
    name: 'Jose Agent Coordination',
    version: '1.0.0',
    enabled: true,
    permissions: ['task_routing.coordinate', 'task_routing.delegate', 'task_routing.monitor'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Coordinate parallel tasks across multiple agents',
      'Delegate research to Hector and creative to Miya',
      'Monitor agent progress and adjust routing'
    ]
  },
  {
    id: 'pack.jose-parallel-orchestration',
    name: 'Jose Parallel Orchestration',
    version: '1.0.0',
    enabled: true,
    permissions: ['task_routing.parallel', 'task_routing.concurrent', 'execution_tracking.parallel'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Run independent tasks in parallel',
      'Manage concurrent agent execution',
      'Merge parallel outputs into coherent result'
    ]
  },
  {
    id: 'pack.jose-task-prioritization',
    name: 'Jose Task Prioritization',
    version: '1.0.0',
    enabled: true,
    permissions: ['task_routing.prioritize', 'task_routing.sequence', 'task_routing.urgent'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Prioritize tasks based on risk and value',
      'Sequence tasks for optimal throughput',
      'Handle urgent requests with escalation'
    ]
  },
  {
    id: 'pack.jose-risk-assessment',
    name: 'Jose Risk Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['approval_gating.risk', 'approval_gating.assess', 'approval_gating.classify'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Assess risk level of a deployment task',
      'Classify actions by risk category',
      'Apply appropriate approval gates'
    ]
  },
  {
    id: 'pack.jose-quality-gates',
    name: 'Jose Quality Gates',
    version: '1.0.0',
    enabled: true,
    permissions: ['approval_gating.quality', 'approval_gating.verify', 'approval_gating.validate'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify task output meets quality standards',
      'Validate deliverables before handoff',
      'Enforce quality gates in pipeline'
    ]
  },
  {
    id: 'pack.jose-compliance-checks',
    name: 'Jose Compliance Checks',
    version: '1.0.0',
    enabled: true,
    permissions: ['approval_gating.compliance', 'approval_gating.policy', 'approval_gating.audit'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Verify compliance with security policies',
      'Audit agent actions for policy violations',
      'Enforce data handling requirements'
    ]
  },
  {
    id: 'pack.jose-progress-tracking',
    name: 'Jose Progress Tracking',
    version: '1.0.0',
    enabled: true,
    permissions: ['execution_tracking.progress', 'execution_tracking.monitor', 'execution_tracking.status'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Track progress of multi-agent workflows',
      'Monitor task completion rates',
      'Generate progress status updates'
    ]
  },
  {
    id: 'pack.jose-status-reporting',
    name: 'Jose Status Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['execution_tracking.report', 'execution_tracking.summary', 'execution_tracking.dashboard'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate executive status report',
      'Summarize workflow completion status',
      'Create dashboard for orchestration metrics'
    ]
  },
  {
    id: 'pack.jose-performance-metrics',
    name: 'Jose Performance Metrics',
    version: '1.0.0',
    enabled: true,
    permissions: ['execution_tracking.metrics', 'execution_tracking.performance', 'execution_tracking.analytics'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Track agent performance metrics',
      'Analyze orchestration efficiency',
      'Identify performance bottlenecks'
    ]
  },
  {
    id: 'pack.jose-workflow-optimization',
    name: 'Jose Workflow Optimization',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.optimize', 'workflows.improve', 'workflows.streamline'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Optimize workflow for faster execution',
      'Streamline agent handoff process',
      'Reduce unnecessary approval gates'
    ]
  },
  {
    id: 'pack.jose-bottleneck-detection',
    name: 'Jose Bottleneck Detection',
    version: '1.0.0',
    enabled: true,
    permissions: ['execution_tracking.bottleneck', 'execution_tracking.blocker', 'execution_tracking.delay'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify bottlenecks in task execution',
      'Detect blocked agents and resolve',
      'Minimize delays in workflow'
    ]
  },
  {
    id: 'pack.jose-continuous-improvement',
    name: 'Jose Continuous Improvement',
    version: '1.0.0',
    enabled: true,
    permissions: ['workflows.learn', 'workflows.adapt', 'workflows.evolve'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Learn from orchestration patterns',
      'Adapt routing based on agent performance',
      'Evolve workflows based on outcomes'
    ]
  },
  {
    id: 'pack.jose-stakeholder-communication',
    name: 'Jose Stakeholder Communication',
    version: '1.0.0',
    enabled: true,
    permissions: ['agent_report.stakeholder', 'agent_report.status', 'agent_report.progress'],
    category: 'agent_skill',
    ownerAgent: 'jose',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Report workflow status to stakeholders',
      'Communicate progress updates',
      'Escalate issues to appropriate parties'
    ]
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
    id: 'pack.miya-creative-image',
    name: 'Miya Creative Image Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['media.generate', 'image.compose', 'creative.preview'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.miya-ui-ux-design',
    name: 'Miya UI/UX Design Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.ui_direction', 'creative.ux_flow', 'creative.wireframe'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.miya-brand-identity',
    name: 'Miya Brand Identity Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.brand_direction', 'creative.style_guide'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED
  },
  {
    id: 'pack.miya-motion-graphics',
    name: 'Miya Motion Graphics Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['media.generate', 'video.motion', 'creative.animation'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Miya new packs ──────────────────────────────────────────────────
  {
    id: 'pack.miya-typography-system',
    name: 'Miya Typography System',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.typography', 'creative.style_guide', 'creative.design_system'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Define a typography hierarchy for the application UI',
      'Select font pairings for marketing and product interfaces',
      'Document type scale and responsive sizing rules'
    ]
  },
  {
    id: 'pack.miya-color-palette',
    name: 'Miya Color Palette',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.color', 'creative.style_guide', 'creative.brand_direction'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design a color palette for a new product feature',
      'Create accessible color contrast pairs for WCAG compliance',
      'Define semantic color tokens for light and dark themes'
    ]
  },
  {
    id: 'pack.miya-content-strategy',
    name: 'Miya Content Strategy',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.content_strategy', 'creative.copywriting', 'creative.messaging'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Develop a content strategy for a product launch campaign',
      'Define messaging hierarchy for landing page sections',
      'Plan content pillars for social media presence'
    ]
  },
  {
    id: 'pack.miya-video-storyboarding',
    name: 'Miya Video Storyboarding',
    version: '1.0.0',
    enabled: true,
    permissions: ['video.storyboard', 'creative.direction', 'video.shot_list'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Create a storyboard for a product demo video',
      'Design shot-by-shot sequences for a promotional clip',
      'Plan B-roll and transition sequences for a tutorial'
    ]
  },
  {
    id: 'pack.miya-social-media-design',
    name: 'Miya Social Media Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.social', 'image.compose', 'creative.campaign'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design social media post templates for a product launch',
      'Create platform-specific image dimensions and layouts',
      'Plan a visual content calendar for social channels'
    ]
  },
  {
    id: 'pack.miya-editorial-design',
    name: 'Miya Editorial Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.editorial', 'creative.layout', 'creative.typography'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design a blog post layout with consistent visual hierarchy',
      'Create editorial templates for documentation pages',
      'Plan long-form content presentation with pull quotes and sidebars'
    ]
  },
  {
    id: 'pack.miya-animation-design',
    name: 'Miya Animation Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.animation', 'video.motion', 'creative.interaction'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design micro-interaction animations for button states',
      'Plan page transition animations for navigation flows',
      'Create loading animation concepts for system feedback'
    ]
  },
  {
    id: 'pack.miya-illustration-style',
    name: 'Miya Illustration Style',
    version: '1.0.0',
    enabled: true,
    permissions: ['image.illustration', 'creative.style_guide', 'creative.direction'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Define an illustration style guide for the product',
      'Design icon system with consistent stroke and fill rules',
      'Create illustration briefs for marketing assets'
    ]
  },
  {
    id: 'pack.miya-video-editing',
    name: 'Miya Video Editing',
    version: '1.0.0',
    enabled: true,
    permissions: ['video.editing', 'video.transitions', 'creative.post_production'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Plan video editing workflow for a tutorial series',
      'Design transition styles between scene segments',
      'Create post-production checklist for Runway-generated clips'
    ]
  },
  {
    id: 'pack.miya-landing-page',
    name: 'Miya Landing Page',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.landing_page', 'creative.ui_direction', 'creative.campaign'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design landing page wireframe with conversion-focused layout',
      'Plan hero section visual hierarchy and CTA placement',
      'Create above-the-fold content strategy for product pages'
    ]
  },
  {
    id: 'pack.miya-dashboard-design',
    name: 'Miya Dashboard Design',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.dashboard', 'creative.ui_direction', 'creative.data_visualization'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design a dashboard layout with data visualization hierarchy',
      'Plan widget placement and information density for admin views',
      'Create responsive grid system for dashboard components'
    ]
  },
  {
    id: 'pack.miya-brand-guidelines',
    name: 'Miya Brand Guidelines',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.brand_guidelines', 'creative.style_guide', 'creative.brand_direction'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Compile brand guidelines document with logo usage rules',
      'Define brand voice and tone guidelines across touchpoints',
      'Create brand asset library organization structure'
    ]
  },
  {
    id: 'pack.miya-icon-system',
    name: 'Miya Icon System',
    version: '1.0.0',
    enabled: true,
    permissions: ['image.icon', 'creative.style_guide', 'creative.design_system'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Design a consistent icon system with grid and sizing rules',
      'Create icon variants for different UI contexts (outlined, filled)',
      'Document icon naming conventions and usage guidelines'
    ]
  },
  {
    id: 'pack.miya-design-system',
    name: 'Miya Design System',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.design_system', 'creative.component_library', 'creative.style_guide'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Define a component library structure for design system',
      'Document design tokens and their usage patterns',
      'Plan design system versioning and adoption strategy'
    ]
  },
  {
    id: 'pack.miya-user-research',
    name: 'Miya User Research',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.user_research', 'creative.usability', 'creative.persona'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Plan user research sessions for design validation',
      'Create user personas from research findings',
      'Design usability testing protocols for new features'
    ]
  },
  {
    id: 'pack.miya-motion-system',
    name: 'Miya Motion System',
    version: '1.0.0',
    enabled: true,
    permissions: ['creative.motion_system', 'creative.animation', 'creative.interaction'],
    category: 'agent_skill',
    ownerAgent: 'miya',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Define a motion design system with timing and easing tokens',
      'Create animation guidelines for page and component transitions',
      'Document motion principles for accessibility and reduced motion'
    ]
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
  },
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
  {
    id: 'pack.echo-decision-capture',
    name: 'Echo Decision Capture',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.decisions', 'knowledge.context', 'timeline.decisions'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Capture architectural decisions with rationale and context',
      'Record design choice alternatives that were considered',
      'Archive decision outcomes for future reference'
    ]
  },
  {
    id: 'pack.echo-retention-classification',
    name: 'Echo Retention Classification',
    version: '1.0.0',
    enabled: true,
    permissions: ['retention.classify', 'retention.policies', 'memory.categories'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Classify memory entries by retention priority and expiration',
      'Apply retention policies to old conversation contexts',
      'Categorize memories by project, agent, and importance'
    ]
  },
  {
    id: 'pack.echo-confidence-normalization',
    name: 'Echo Confidence Normalization',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.confidence', 'knowledge.quality', 'retention.score'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Normalize confidence scores across different memory sources',
      'Adjust memory reliability ratings based on corroboration',
      'Flag low-confidence memories for review or deletion'
    ]
  },
  {
    id: 'pack.echo-knowledge-indexing',
    name: 'Echo Knowledge Indexing',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.index', 'memory.retrieve', 'timeline.search'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build and maintain searchable knowledge indices',
      'Index decision records for fast retrieval',
      'Create cross-reference links between related memories'
    ]
  },
  {
    id: 'pack.echo-historical-context',
    name: 'Echo Historical Context',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.context', 'timeline.history', 'memory.context'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Retrieve historical context for current task decisions',
      'Reconstruct prior conversation context for continuity',
      'Surface relevant past decisions for current work'
    ]
  },
  {
    id: 'pack.echo-audit-trail',
    name: 'Echo Audit Trail',
    version: '1.0.0',
    enabled: true,
    permissions: ['timeline.audit', 'memory.trail', 'knowledge.trace'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Maintain audit trail of all agent actions and decisions',
      'Track who did what and when across sessions',
      'Generate audit reports for compliance review'
    ]
  },
  {
    id: 'pack.echo-memory-synthesis-advanced',
    name: 'Echo Memory Synthesis Advanced',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.synthesize', 'knowledge.merge', 'timeline.merge'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Synthesize memories from multiple agents into unified context',
      'Merge duplicate memory entries while preserving nuances',
      'Create summary memories from detailed conversation logs'
    ]
  },
  {
    id: 'pack.echo-context-retrieval',
    name: 'Echo Context Retrieval',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.retrieve', 'knowledge.search', 'timeline.query'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Retrieve relevant memories for current task context',
      'Search historical data for similar past situations',
      'Query memory store with semantic similarity matching'
    ]
  },
  {
    id: 'pack.echo-memory-pruning',
    name: 'Echo Memory Pruning',
    version: '1.0.0',
    enabled: true,
    permissions: ['retention.prune', 'memory.cleanup', 'retention.archive'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Prune stale memories that exceed retention policies',
      'Archive old memories to cold storage before deletion',
      'Clean up duplicate or low-value memory entries'
    ]
  },
  {
    id: 'pack.echo-session-continuity',
    name: 'Echo Session Continuity',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.session', 'knowledge.continuity', 'timeline.session'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Save session state for cross-session continuity',
      'Restore context from previous sessions',
      'Track session boundaries and key events'
    ]
  },
  {
    id: 'pack.echo-memory-validation',
    name: 'Echo Memory Validation',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.validate', 'knowledge.verify', 'retention.quality'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Validate memory entries for completeness and accuracy',
      'Verify cross-references between related memories',
      'Check memory metadata for consistency'
    ]
  },
  {
    id: 'pack.echo-timeline-construction',
    name: 'Echo Timeline Construction',
    version: '1.0.0',
    enabled: true,
    permissions: ['timeline.construct', 'memory.timeline', 'knowledge.temporal'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Construct chronological timelines of project events',
      'Map decision chains across multiple sessions',
      'Build temporal indices for time-range queries'
    ]
  },
  {
    id: 'pack.echo-knowledge-graph',
    name: 'Echo Knowledge Graph',
    version: '1.0.0',
    enabled: true,
    permissions: ['knowledge.graph', 'memory.relate', 'knowledge.edges'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build knowledge graphs linking related memories and decisions',
      'Identify relationships between concepts across memory entries',
      'Maintain edge weights based on co-occurrence strength'
    ]
  },
  {
    id: 'pack.echo-memory-reporting',
    name: 'Echo Memory Reporting',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.report', 'retention.summary', 'knowledge.stats'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate memory usage and retention reports',
      'Summarize memory health across categories',
      'Report on knowledge coverage gaps'
    ]
  },
  {
    id: 'pack.echo-preference-learning',
    name: 'Echo Preference Learning',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.preferences', 'knowledge.user', 'retention.personal'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Learn and store user preferences from interactions',
      'Track preference changes over time',
      'Surface relevant preferences in context'
    ]
  },
  {
    id: 'pack.echo-decision-diff',
    name: 'Echo Decision Diff',
    version: '1.0.0',
    enabled: true,
    permissions: ['memory.diff', 'knowledge.compare', 'timeline.changes'],
    category: 'agent_skill',
    ownerAgent: 'echo',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Diff current decisions against previous versions',
      'Identify what changed between decision revisions',
      'Track decision evolution over time'
    ]
  },
  {
    id: 'pack.sentinel-vuln-scan',
    name: 'Sentinel Vulnerability Scan Skill',
    version: '1.0.0',
    enabled: true,
    permissions: ['security.scan', 'risk.classification', 'permission.review', 'audit.findings'],
    category: 'agent_skill',
    ownerAgent: 'sentinel',
    trust: TRUST_STATES.VERIFIED
  },
  // ── Sentinel new packs ──────────────────────────────────────────────
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
  {
    id: 'pack.nova-market-analysis',
    name: 'Nova Market Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.market', 'opportunity.segment', 'strategy.positioning'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze market size and growth potential for a new feature',
      'Segment target audience by value and adoption likelihood',
      'Assess competitive positioning opportunities'
    ]
  },
  {
    id: 'pack.nova-prioritization-matrix',
    name: 'Nova Prioritization Matrix',
    version: '1.0.0',
    enabled: true,
    permissions: ['prioritization.matrix', 'opportunity.rank', 'analysis.impact'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Build impact vs effort prioritization matrix for backlog',
      'Rank features by strategic alignment and user value',
      'Create weighted scoring model for initiative selection'
    ]
  },
  {
    id: 'pack.nova-risk-reward',
    name: 'Nova Risk-Reward Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.risk', 'analysis.reward', 'strategy.balance'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Evaluate risk-to-reward ratio for a new initiative',
      'Assess downside scenarios and mitigation options',
      'Balance risk appetite with growth potential'
    ]
  },
  {
    id: 'pack.nova-timing-analysis',
    name: 'Nova Timing Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.timing', 'analysis.window', 'strategy.sequencing'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify optimal launch windows for feature releases',
      'Assess market timing for competitive advantage',
      'Evaluate seasonal patterns affecting adoption'
    ]
  },
  {
    id: 'pack.nova-effort-estimation',
    name: 'Nova Effort Estimation',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.effort', 'analysis.complexity', 'prioritization.resource'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Estimate engineering effort for feature implementation',
      'Assess resource requirements across teams',
      'Compare effort estimates against value projections'
    ]
  },
  {
    id: 'pack.nova-strategic-alignment',
    name: 'Nova Strategic Alignment',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.alignment', 'opportunity.strategic', 'analysis.goals'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Evaluate feature alignment with product strategy',
      'Score initiatives against company OKRs',
      'Identify high-alignment quick wins'
    ]
  },
  {
    id: 'pack.nova-growth-analysis',
    name: 'Nova Growth Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.growth', 'opportunity.growth', 'strategy.scaling'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze growth potential for user acquisition features',
      'Project adoption curves for new capabilities',
      'Identify scaling opportunities and bottlenecks'
    ]
  },
  {
    id: 'pack.nova-competitive-intelligence',
    name: 'Nova Competitive Intelligence',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.competitive', 'opportunity.gap', 'strategy.differentiation'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Identify feature gaps relative to competitors',
      'Assess differentiation opportunities in the market',
      'Track competitor capability evolution'
    ]
  },
  {
    id: 'pack.nova-value-scoring',
    name: 'Nova Value Scoring',
    version: '1.0.0',
    enabled: true,
    permissions: ['opportunity.value', 'prioritization.score', 'analysis.worth'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Score feature proposals by expected user value',
      'Quantify business value of potential initiatives',
      'Compare value scores across competing priorities'
    ]
  },
  {
    id: 'pack.nova-resource-optimization',
    name: 'Nova Resource Optimization',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.resource', 'analysis.allocation', 'prioritization.capacity'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Optimize resource allocation across competing initiatives',
      'Identify underutilized capacity for high-value work',
      'Recommend resource shifts for maximum impact'
    ]
  },
  {
    id: 'pack.nova-scenario-modeling',
    name: 'Nova Scenario Modeling',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.scenario', 'opportunity.projection', 'strategy.modeling'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Model best-case and worst-case outcomes for initiatives',
      'Create scenario projections for feature launches',
      'Compare scenario outcomes to guide decisions'
    ]
  },
  {
    id: 'pack.nova-decision-support',
    name: 'Nova Decision Support',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.decision', 'analysis.support', 'prioritization.recommendation'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Provide data-driven decision support for feature selection',
      'Recommend go/no-go with supporting evidence',
      'Present tradeoff analysis for stakeholder review'
    ]
  },
  {
    id: 'pack.nova-capability-assessment',
    name: 'Nova Capability Assessment',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.capability', 'opportunity.readiness', 'strategy.maturity'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Assess team capability readiness for new initiatives',
      'Evaluate technical maturity for feature complexity',
      'Identify capability gaps requiring investment'
    ]
  },
  {
    id: 'pack.nova-trend-forecasting',
    name: 'Nova Trend Forecasting',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.forecast', 'opportunity.trend', 'strategy.projection'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Forecast technology adoption trends relevant to product',
      'Project market shifts affecting feature strategy',
      'Identify emerging opportunities from trend data'
    ]
  },
  {
    id: 'pack.nova-portfolio-analysis',
    name: 'Nova Portfolio Analysis',
    version: '1.0.0',
    enabled: true,
    permissions: ['analysis.portfolio', 'prioritization.balance', 'strategy.portfolio'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Analyze initiative portfolio for balance and risk distribution',
      'Recommend portfolio adjustments for optimal mix',
      'Track portfolio health metrics over time'
    ]
  },
  {
    id: 'pack.nova-recommendation-engine',
    name: 'Nova Recommendation Engine',
    version: '1.0.0',
    enabled: true,
    permissions: ['strategy.recommend', 'prioritization.engine', 'analysis.suggestion'],
    category: 'agent_skill',
    ownerAgent: 'nova',
    trust: TRUST_STATES.VERIFIED,
    exampleTasks: [
      'Generate prioritized recommendations from opportunity data',
      'Suggest next-best actions based on scoring models',
      'Provide automated ranking updates as data changes'
    ]
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
  },
  'pack.miya-creative-image': {
    guidance: 'Compose still-image creative direction and previews. Do not claim a generated asset exists unless the media engine is actually connected.',
    steps: ['Clarify visual intent', 'Draft composition notes', 'Generate preview', 'Flag if engine unconnected']
  },
  'pack.miya-ui-ux-design': {
    guidance: 'Produce implementable UI/UX direction: information architecture, component maps, and flow notes engineering can build directly from.',
    steps: ['Map information architecture', 'Define component structure', 'Draft flow notes', 'Check against design system']
  },
  'pack.miya-brand-identity': {
    guidance: 'Define brand direction and style-guide notes. Route any production brand change through approval per Miya\'s contract.',
    steps: ['Clarify brand intent', 'Draft style guide notes', 'Flag production-change approval requirement']
  },
  'pack.miya-motion-graphics': {
    guidance: 'Direct motion/animation treatment for generated media. Distinct from static video draft — covers timing, easing, and transition notes.',
    steps: ['Define motion intent', 'Draft timing/easing notes', 'Generate motion preview']
  },
  // Miya new packs - workflow guidance
  'pack.miya-typography-system': {
    guidance: 'Define typography hierarchy, font pairings, and type scale rules for consistent text rendering across the product.',
    steps: ['Audit existing text usage', 'Select primary and secondary typefaces', 'Define type scale and responsive rules', 'Document usage guidelines for each context']
  },
  'pack.miya-color-palette': {
    guidance: 'Design accessible, semantic color systems with tokens for light and dark themes that meet WCAG contrast requirements.',
    steps: ['Define brand color anchors', 'Create semantic color tokens', 'Verify contrast ratios', 'Document theme switching behavior']
  },
  'pack.miya-content-strategy': {
    guidance: 'Develop messaging frameworks, content pillars, and editorial calendars aligned with product and marketing goals.',
    steps: ['Define target audience segments', 'Identify messaging pillars', 'Plan content cadence and channels', 'Create style and voice guidelines']
  },
  'pack.miya-video-storyboarding': {
    guidance: 'Create shot-by-shot visual plans for video content before production, covering framing, transitions, and timing.',
    steps: ['Define video objective and audience', 'Sketch key frames and sequences', 'Plan transitions and B-roll', 'Attach timing estimates per shot']
  },
  'pack.miya-social-media-design': {
    guidance: 'Design platform-specific visual templates and content plans for social media presence.',
    steps: ['Survey platform-specific dimensions', 'Design reusable post templates', 'Plan visual content calendar', 'Document brand consistency rules']
  },
  'pack.miya-editorial-design': {
    guidance: 'Design long-form content layouts with consistent visual hierarchy for blogs, docs, and articles.',
    steps: ['Define content structure patterns', 'Design layout with heading hierarchy', 'Plan pull quotes and visual breaks', 'Document responsive behavior']
  },
  'pack.miya-animation-design': {
    guidance: 'Design micro-interactions and motion treatments for UI elements that provide feedback and guide users.',
    steps: ['Identify interaction points needing motion', 'Define animation timing and easing', 'Create state transition specs', 'Document accessibility considerations']
  },
  'pack.miya-illustration-style': {
    guidance: 'Define illustration and iconography style guidelines that maintain visual consistency across product and marketing.',
    steps: ['Define illustration style parameters', 'Create icon grid and sizing rules', 'Document stroke and color conventions', 'Produce style guide reference sheets']
  },
  'pack.miya-video-editing': {
    guidance: 'Plan post-production workflows for video content including cutting, transitions, and final output formats.',
    steps: ['Define editing workflow stages', 'Plan transition and cut styles', 'Document output format requirements', 'Create post-production checklist']
  },
  'pack.miya-landing-page': {
    guidance: 'Design conversion-focused landing page layouts with clear visual hierarchy and strategic CTA placement.',
    steps: ['Define conversion goals and audience', 'Design above-the-fold hero section', 'Plan content flow and CTA placement', 'Create responsive layout specifications']
  },
  'pack.miya-dashboard-design': {
    guidance: 'Design data-dense dashboard layouts with clear information hierarchy and responsive grid systems.',
    steps: ['Audit data visualization needs', 'Design layout grid and widget system', 'Plan information density rules', 'Create responsive breakpoint behavior']
  },
  'pack.miya-brand-guidelines': {
    guidance: 'Compile comprehensive brand guidelines covering logo usage, voice, tone, and visual standards.',
    steps: ['Document logo usage and clear space rules', 'Define brand voice and tone principles', 'Create color and typography standards', 'Organize brand asset library']
  },
  'pack.miya-icon-system': {
    guidance: 'Design a consistent icon system with grid rules, sizing scales, and contextual variants.',
    steps: ['Define icon grid and optical sizing', 'Create outlined and filled variants', 'Document naming and usage conventions', 'Plan icon set expansion strategy']
  },
  'pack.miya-design-system': {
    guidance: 'Define and maintain a component-based design system with tokens, patterns, and documentation.',
    steps: ['Inventory existing UI patterns', 'Define design tokens and primitives', 'Document component specifications', 'Plan design system adoption roadmap']
  },
  'pack.miya-user-research': {
    guidance: 'Plan and execute user research to validate design decisions with real user insights.',
    steps: ['Define research questions and goals', 'Select research methods and participants', 'Conduct sessions and collect data', 'Synthesize findings into design recommendations']
  },
  'pack.miya-motion-system': {
    guidance: 'Define a systematic motion language with timing tokens and accessibility considerations.',
    steps: ['Define motion principles and goals', 'Create timing and easing token library', 'Document component-level motion specs', 'Plan reduced-motion fallbacks']
  },
  'pack.hector-market-research': {
    guidance: 'Research market signals with source-backed structure. Always attach a citation to a claim.',
    steps: ['Define research question', 'Gather sources', 'Attach citations', 'Summarize with confidence label']
  },
  'pack.hector-competitive-analysis': {
    guidance: 'Scan competitor positioning and structure findings for Jose/Marcus handoff.',
    steps: ['Identify competitors', 'Scan public positioning', 'Structure comparison', 'Flag confidence gaps']
  },
  'pack.hector-source-verification': {
    guidance: 'Score source confidence before a claim is used downstream. Mirrors sourceConfidenceService.js.',
    steps: ['Identify source', 'Score confidence', 'Flag low-confidence sources', 'Attach score to report']
  },
  'pack.hector-rss-monitoring': {
    guidance: 'Use the curated RSS feed catalog as a failover research channel when direct search is unavailable.',
    steps: ['Check RSS feed catalog', 'Fetch and parse items', 'Cross-check against direct sources']
  },
  // Hector new packs - workflow guidance
  'pack.hector-api-documentation-research': {
    guidance: 'Research official API documentation to extract endpoints, auth flows, rate limits, and schema details for integration planning.',
    steps: ['Locate official API docs', 'Extract endpoint inventory', 'Document auth and rate-limit rules', 'Flag gaps requiring vendor contact', 'Attach source URLs and confidence scores']
  },
  'pack.hector-compliance-research': {
    guidance: 'Investigate regulatory and compliance requirements relevant to a feature or market before implementation begins.',
    steps: ['Identify applicable regulations', 'Research compliance obligations', 'Survey peer implementations', 'Document required controls', 'Flag high-risk gaps for Maria review']
  },
  'pack.hector-trend-analysis': {
    guidance: 'Track and analyze industry trends to inform product strategy and competitive positioning.',
    steps: ['Define trend scope and timeframe', 'Gather data from multiple sources', 'Identify patterns and inflection points', 'Assess impact on current project', 'Cite all sources with confidence labels']
  },
  'pack.hector-code-pattern-research': {
    guidance: 'Research established code patterns and architectural approaches to guide implementation decisions.',
    steps: ['Define the pattern category', 'Survey open-source implementations', 'Compare approaches by tradeoffs', 'Recommend pattern with rationale', 'Attach source links and confidence']
  },
  'pack.hector-api-integration-research': {
    guidance: 'Research third-party API integration patterns, auth mechanisms, and reliability strategies before building connectors.',
    steps: ['Identify integration requirements', 'Research auth flow options', 'Survey retry and error handling patterns', 'Document rate limits and quotas', 'Recommend integration approach']
  },
  'pack.hector-security-research': {
    guidance: 'Investigate security best practices and vulnerability patterns relevant to the current attack surface.',
    steps: ['Map current attack surface', 'Research known vulnerability classes', 'Survey mitigation patterns', 'Document security controls needed', 'Flag critical findings for Sentinel']
  },
  'pack.hector-technical-architecture-research': {
    guidance: 'Research architectural patterns and system design approaches to inform major technical decisions.',
    steps: ['Define architectural decision scope', 'Survey peer architectures', 'Compare tradeoffs across options', 'Document constraints and requirements', 'Recommend architecture with evidence']
  },
  'pack.hector-open-source-analysis': {
    guidance: 'Evaluate open-source projects for health, license compatibility, and suitability as dependencies.',
    steps: ['Identify candidate projects', 'Check license compatibility', 'Assess maintenance activity and community', 'Evaluate code quality indicators', 'Produce dependency recommendation']
  },
  'pack.hector-market-intelligence': {
    guidance: 'Gather competitive intelligence and market data to support product positioning and strategy.',
    steps: ['Define intelligence objectives', 'Collect competitor data points', 'Analyze positioning and pricing', 'Identify market gaps', 'Package findings for Jose/Miya handoff']
  },
  'pack.hector-data-gathering': {
    guidance: 'Collect structured data from public sources to support research briefs and analysis tasks.',
    steps: ['Define data collection scope', 'Identify authoritative sources', 'Extract and normalize data points', 'Validate against multiple sources', 'Structure output for downstream use']
  },
  'pack.hector-content-research': {
    guidance: 'Research content strategy opportunities including topics, formats, and distribution channels.',
    steps: ['Survey target audience content preferences', 'Analyze competitor content strategies', 'Identify keyword and topic opportunities', 'Recommend content formats and cadence', 'Cite sources for all recommendations']
  },
  'pack.hector-documentation-audit': {
    guidance: 'Audit existing documentation for accuracy, completeness, and alignment with current codebase state.',
    steps: ['Inventory existing documentation', 'Cross-reference against codebase', 'Identify outdated or missing sections', 'Recommend documentation improvements', 'Prioritize updates by impact']
  },
  'pack.hector-survey-design': {
    guidance: 'Design structured research instruments for gathering primary data from users or stakeholders.',
    steps: ['Define research objectives', 'Draft question sets aligned to goals', 'Structure interview or survey flow', 'Plan analysis framework', 'Review for bias and clarity']
  },
  'pack.hector-source-curation': {
    guidance: 'Curate, rank, and maintain authoritative source libraries for recurring research themes.',
    steps: ['Identify high-quality source candidates', 'Verify source reliability and recency', 'Rank by authority and relevance', 'Organize into reusable collections', 'Schedule periodic re-verification']
  },
  'pack.hector-confidence-scoring': {
    guidance: 'Apply structured confidence scoring to research claims based on source quality and evidence strength.',
    steps: ['Identify claim to score', 'Count supporting sources', 'Assess source authority level', 'Assign confidence rating', 'Flag low-confidence claims for additional research']
  },
  'pack.hector-research-briefing': {
    guidance: 'Compile daily or periodic research briefings from curated sources for team consumption.',
    steps: ['Pull latest items from curated feeds', 'Filter by relevance and priority', 'Summarize key developments', 'Attach source links and timestamps', 'Deliver briefing to Jose for distribution']
  },
  // Marcus new packs - workflow guidance
  'pack.marcus-github-releases': {
    guidance: 'Create and manage GitHub releases with changelogs, artifact uploads, and version tagging.',
    steps: ['Generate changelog from commits', 'Create tagged release on GitHub', 'Upload build artifacts', 'Verify release assets are accessible']
  },
  'pack.marcus-slack-notifications': {
    guidance: 'Send structured release and deployment notifications to team Slack channels.',
    steps: ['Format release summary', 'Select target channels', 'Post announcement with links', 'Track delivery and acknowledgment']
  },
  'pack.marcus-release-readiness': {
    guidance: 'Validate all release gates pass before version promotion to production.',
    steps: ['Run readiness checklist', 'Verify test suite passes', 'Check security audit clear', 'Generate readiness report']
  },
  'pack.marcus-security-audit': {
    guidance: 'Audit build artifacts and dependencies for security vulnerabilities before distribution.',
    steps: ['Run dependency audit', 'Scan build artifacts', 'Verify signing integrity', 'Document findings and remediations']
  },
  'pack.marcus-risk-detection': {
    guidance: 'Identify and assess deployment risks in release candidates before distribution.',
    steps: ['Analyze change scope', 'Identify breaking changes', 'Assess impact on consumers', 'Flag high-risk items for review']
  },
  'pack.marcus-integration-validation': {
    guidance: 'Validate connector and API integrations function correctly against release candidate.',
    steps: ['Run integration test suite', 'Verify API contracts', 'Test connector dispatch paths', 'Document validation results']
  },
  'pack.marcus-deployment-execution': {
    guidance: 'Execute staged deployment with verification checkpoints and rollback capability.',
    steps: ['Prepare deployment artifacts', 'Execute staged rollout', 'Run health checks', 'Verify or rollback deployment']
  },
  'pack.marcus-changelog-generation': {
    guidance: 'Generate categorized changelogs from commit history for release documentation.',
    steps: ['Pull commit history since last release', 'Categorize changes by type', 'Format with breaking/feature/fix sections', 'Attach to release']
  },
  'pack.marcus-asset-distribution': {
    guidance: 'Distribute build artifacts to release channels with integrity verification.',
    steps: ['Collect build artifacts', 'Verify checksums and signatures', 'Upload to distribution channels', 'Track distribution completion']
  },
  'pack.marcus-notification-routing': {
    guidance: 'Route release notifications to appropriate channels based on impact and audience.',
    steps: ['Assess release impact level', 'Select notification channels', 'Format targeted messages', 'Dispatch and track delivery']
  },
  'pack.marcus-approval-gatekeeping': {
    guidance: 'Enforce approval gates before any production distribution action proceeds.',
    steps: ['Verify approval status', 'Check governance clearance', 'Block if conditions unmet', 'Proceed only on explicit approval']
  },
  'pack.marcus-version-management': {
    guidance: 'Manage semantic versioning and version consistency across all package manifests.',
    steps: ['Determine version bump type', 'Update version references', 'Tag release commit', 'Verify version consistency']
  },
  'pack.marcus-rollback-execution': {
    guidance: 'Execute rollback to previous stable version when critical issues are detected.',
    steps: ['Identify rollback target', 'Execute rollback procedure', 'Verify service health', 'Notify team with root cause']
  },
  'pack.marcus-release-reporting': {
    guidance: 'Generate post-release reports covering distribution success, metrics, and lessons learned.',
    steps: ['Collect release metrics', 'Analyze distribution outcomes', 'Document issues and resolutions', 'Deliver report to stakeholders']
  },
  'pack.marcus-compliance-distribution': {
    guidance: 'Verify license and regulatory compliance before distributing packages externally.',
    steps: ['Audit dependency licenses', 'Verify export control compliance', 'Check regulatory requirements', 'Document compliance status']
  },
  'pack.marcus-team-communication': {
    guidance: 'Coordinate deployment windows and communicate status updates to team stakeholders.',
    steps: ['Schedule deployment window', 'Notify team leads', 'Post status updates', 'Summarize outcomes post-deployment']
  },
  // Echo new packs - workflow guidance
  'pack.echo-decision-capture': {
    guidance: 'Record decisions with full rationale, alternatives considered, and outcome context for future reference.',
    steps: ['Identify decision point', 'Record chosen option and rationale', 'Document alternatives rejected', 'Archive with context tags']
  },
  'pack.echo-retention-classification': {
    guidance: 'Classify memory entries by retention priority, expiration rules, and importance for lifecycle management.',
    steps: ['Assess memory importance', 'Apply retention policy', 'Set expiration rules', 'Categorize by agent and project']
  },
  'pack.echo-confidence-normalization': {
    guidance: 'Normalize and calibrate confidence scores across memory sources for consistent reliability assessment.',
    steps: ['Collect confidence scores', 'Normalize across sources', 'Adjust for corroboration', 'Flag low-confidence entries']
  },
  'pack.echo-knowledge-indexing': {
    guidance: 'Build and maintain searchable indices over memory entries for fast semantic retrieval.',
    steps: ['Extract key concepts', 'Build index structure', 'Create cross-references', 'Maintain index freshness']
  },
  'pack.echo-historical-context': {
    guidance: 'Surface relevant historical context to support current decision-making and maintain continuity.',
    steps: ['Analyze current context', 'Search historical records', 'Rank relevance', 'Present contextual background']
  },
  'pack.echo-audit-trail': {
    guidance: 'Maintain comprehensive audit trails of agent actions, decisions, and their outcomes.',
    steps: ['Log agent actions', 'Record decision timestamps', 'Track outcome results', 'Generate audit reports']
  },
  'pack.echo-memory-synthesis-advanced': {
    guidance: 'Advanced memory synthesis combining multiple sources into unified, deduplicated knowledge entries.',
    steps: ['Collect related memories', 'Identify overlaps and conflicts', 'Merge with conflict resolution', 'Validate synthesized output']
  },
  'pack.echo-context-retrieval': {
    guidance: 'Retrieve semantically relevant memories to enrich current task context and decision-making.',
    steps: ['Parse current context', 'Query memory store', 'Rank by relevance', 'Present supporting memories']
  },
  'pack.echo-memory-pruning': {
    guidance: 'Clean up stale, duplicate, or low-value memories to maintain store health and retrieval performance.',
    steps: ['Identify stale entries', 'Check retention policies', 'Archive or delete', 'Verify store integrity']
  },
  'pack.echo-session-continuity': {
    guidance: 'Preserve and restore session state to enable seamless cross-session work continuity.',
    steps: ['Save session snapshot', 'Capture key state changes', 'Restore on session start', 'Track session boundaries']
  },
  'pack.echo-memory-validation': {
    guidance: 'Validate memory entries for completeness, accuracy, and consistency across the knowledge base.',
    steps: ['Check entry completeness', 'Verify cross-references', 'Validate metadata', 'Flag inconsistencies']
  },
  'pack.echo-timeline-construction': {
    guidance: 'Build chronological timelines of project events, decisions, and milestones.',
    steps: ['Collect timestamped events', 'Order chronologically', 'Identify milestones', 'Create navigable timeline']
  },
  'pack.echo-knowledge-graph': {
    guidance: 'Construct knowledge graphs linking related memories, decisions, and concepts.',
    steps: ['Identify entities', 'Map relationships', 'Assign edge weights', 'Maintain graph structure']
  },
  'pack.echo-memory-reporting': {
    guidance: 'Generate reports on memory health, usage patterns, and knowledge coverage.',
    steps: ['Collect memory metrics', 'Analyze usage patterns', 'Identify coverage gaps', 'Generate summary report']
  },
  'pack.echo-preference-learning': {
    guidance: 'Learn, store, and surface user preferences from interaction patterns over time.',
    steps: ['Observe interaction patterns', 'Extract preference signals', 'Store with confidence', 'Surface in context']
  },
  'pack.echo-decision-diff': {
    guidance: 'Track and diff decision changes across revisions to understand evolution of choices.',
    steps: ['Capture decision version', 'Compare with previous', 'Highlight changes', 'Document change rationale']
  },
  'pack.jose-task-routing': {
    guidance: 'Route decomposed work to the correct agent based on its execution contract, not convenience.',
    steps: ['Decompose task', 'Match to agent contract', 'Route', 'Track execution']
  },
  'pack.jose-approval-gating': {
    guidance: 'Never let a high-risk action bypass approval. Gate before execution, not after.',
    steps: ['Classify risk', 'Create approval gate', 'Wait for decision', 'Proceed only on approval']
  },
  'pack.jose-cross-agent-synthesis': {
    guidance: 'Merge multiple agents\' outputs into one coherent, supervised response without dropping caveats.',
    steps: ['Collect agent outputs', 'Reconcile conflicts', 'Preserve caveats', 'Synthesize final response']
  },
  'pack.jose-pipeline-governance': {
    guidance: 'Enforce the pipeline loop-guard: hard-stop on budget breach (max assignments / max wall-clock) rather than letting a run continue unbounded.',
    steps: ['Track assignment count', 'Track wall-clock time', 'Hard-stop on breach', 'Write budget_exceeded receipt']
  },
  'pack.jose-workflow-design': {
    guidance: 'Design orchestration workflows that decompose complex tasks into agent-specific subtasks with clear handoffs.',
    steps: ['Analyze task complexity', 'Identify agent capabilities', 'Design workflow steps', 'Define handoff points', 'Validate workflow']
  },
  'pack.jose-strategic-planning': {
    guidance: 'Create long-term strategic plans that align agent capabilities with project goals and timelines.',
    steps: ['Define strategic objectives', 'Map resource requirements', 'Create phased roadmap', 'Set milestones', 'Review and adjust']
  },
  'pack.jose-dependency-mapping': {
    guidance: 'Map task dependencies to identify critical paths and prevent circular dependencies.',
    steps: ['Identify all tasks', 'Map dependencies', 'Find critical path', 'Resolve conflicts', 'Document sequence']
  },
  'pack.jose-agent-coordination': {
    guidance: 'Coordinate multiple agents working on related tasks to ensure coherent outputs and minimal conflicts.',
    steps: ['Identify agent roles', 'Assign parallel tasks', 'Monitor progress', 'Resolve conflicts', 'Synthesize outputs']
  },
  'pack.jose-parallel-orchestration': {
    guidance: 'Manage parallel execution of independent tasks to maximize throughput while maintaining quality.',
    steps: ['Identify independent tasks', 'Assign to agents', 'Monitor parallel progress', 'Handle failures', 'Merge results']
  },
  'pack.jose-task-prioritization': {
    guidance: 'Prioritize tasks based on risk, value, and urgency to optimize resource allocation.',
    steps: ['Assess task importance', 'Evaluate risk levels', 'Determine urgency', 'Sequence tasks', 'Communicate priorities']
  },
  'pack.jose-risk-assessment': {
    guidance: 'Evaluate risk levels for each task and apply appropriate approval gates based on classification.',
    steps: ['Identify risk factors', 'Classify risk level', 'Apply approval gates', 'Document decisions', 'Monitor outcomes']
  },
  'pack.jose-quality-gates': {
    guidance: 'Ensure task outputs meet quality standards before allowing progression to next workflow stage.',
    steps: ['Define quality criteria', 'Verify deliverables', 'Check completeness', 'Validate standards', 'Approve or reject']
  },
  'pack.jose-compliance-checks': {
    guidance: 'Verify all agent actions comply with security policies, data handling requirements, and audit standards.',
    steps: ['Identify applicable policies', 'Audit agent actions', 'Check compliance', 'Document findings', 'Enforce corrections']
  },
  'pack.jose-progress-tracking': {
    guidance: 'Monitor task completion rates and workflow progress to identify issues early.',
    steps: ['Define progress metrics', 'Track completion', 'Identify delays', 'Report status', 'Adjust plans']
  },
  'pack.jose-status-reporting': {
    guidance: 'Generate clear status reports for stakeholders showing workflow progress and any blockers.',
    steps: ['Collect status updates', 'Summarize progress', 'Highlight blockers', 'Format report', 'Distribute to stakeholders']
  },
  'pack.jose-performance-metrics': {
    guidance: 'Track orchestration metrics to identify optimization opportunities and improve efficiency.',
    steps: ['Define metrics', 'Collect data', 'Analyze patterns', 'Identify improvements', 'Implement changes']
  },
  'pack.jose-workflow-optimization': {
    guidance: 'Continuously improve workflows by identifying bottlenecks and streamlining processes.',
    steps: ['Analyze current workflow', 'Identify inefficiencies', 'Design improvements', 'Test changes', 'Deploy optimizations']
  },
  'pack.jose-bottleneck-detection': {
    guidance: 'Identify and resolve bottlenecks that slow down task execution or block agent progress.',
    steps: ['Monitor execution flow', 'Identify delays', 'Diagnose root causes', 'Implement fixes', 'Verify improvement']
  },
  'pack.jose-continuous-improvement': {
    guidance: 'Learn from orchestration outcomes to improve future routing, planning, and coordination decisions.',
    steps: ['Review outcomes', 'Identify patterns', 'Extract lessons', 'Update routing rules', 'Test improvements']
  },
  'pack.jose-stakeholder-communication': {
    guidance: 'Provide clear, timely communication to stakeholders about workflow progress and any issues.',
    steps: ['Identify stakeholders', 'Determine communication needs', 'Format updates', 'Deliver reports', 'Handle feedback']
  },
  'pack.maria-requirements-analysis': {
    guidance: 'Analyze and organize project requirements to ensure clarity, completeness, and traceability.',
    steps: ['Gather requirements', 'Analyze completeness', 'Identify gaps', 'Organize by priority', 'Document findings']
  },
  'pack.maria-risk-classification': {
    guidance: 'Classify risks by severity and likelihood to enable targeted mitigation and resource allocation.',
    steps: ['Identify risk factors', 'Assess severity', 'Evaluate likelihood', 'Classify risk level', 'Recommend mitigations']
  },
  'pack.maria-compliance-auditing': {
    guidance: 'Audit compliance with security policies, data handling requirements, and regulatory standards.',
    steps: ['Identify applicable policies', 'Audit current state', 'Verify compliance', 'Document findings', 'Enforce corrections']
  },
  'pack.maria-approval-workflow': {
    guidance: 'Design and manage approval workflows that ensure proper governance without slowing down progress.',
    steps: ['Identify approval needs', 'Design workflow', 'Implement gates', 'Track approvals', 'Optimize process']
  },
  'pack.maria-evidence-collection': {
    guidance: 'Collect, verify, and document evidence to support audit findings and compliance claims.',
    steps: ['Identify evidence needs', 'Collect evidence', 'Verify authenticity', 'Document chain', 'Archive securely']
  },
  'pack.maria-claim-verification': {
    guidance: 'Verify claims made by agents or users to ensure accuracy and prevent misinformation.',
    steps: ['Identify claims', 'Gather supporting data', 'Verify accuracy', 'Document verification', 'Flag discrepancies']
  },
  'pack.maria-policy-enforcement': {
    guidance: 'Enforce organizational policies consistently across all workflows and agent actions.',
    steps: ['Identify applicable policies', 'Monitor compliance', 'Detect violations', 'Enforce consequences', 'Document actions']
  },
  'pack.maria-audit-trail': {
    guidance: 'Maintain comprehensive audit trails for all critical actions and decisions.',
    steps: ['Identify critical actions', 'Record events', 'Verify completeness', 'Archive securely', 'Enable retrieval']
  },
  'pack.maria-trust-audit': {
    guidance: 'Audit trust levels and trust model consistency across system components.',
    steps: ['Assess trust levels', 'Verify trust claims', 'Identify inconsistencies', 'Recommend adjustments', 'Document findings']
  },
  'pack.maria-state-verification': {
    guidance: 'Verify system state consistency and integrity across services and workflows.',
    steps: ['Identify state points', 'Verify consistency', 'Detect anomalies', 'Document findings', 'Recommend fixes']
  },
  'pack.maria-brand-safety': {
    guidance: 'Ensure brand consistency and safety compliance in all outputs and communications.',
    steps: ['Define brand guidelines', 'Audit outputs', 'Check compliance', 'Flag violations', 'Enforce standards']
  },
  'pack.maria-content-moderation': {
    guidance: 'Moderate content for policy compliance, quality, and appropriateness before publication.',
    steps: ['Review content', 'Check policies', 'Flag violations', 'Recommend changes', 'Approve or reject']
  },
  'pack.maria-quality-assurance': {
    guidance: 'Ensure quality standards are met across all deliverables and workflows.',
    steps: ['Define quality criteria', 'Audit deliverables', 'Verify standards', 'Document findings', 'Enforce quality gates']
  },
  'pack.maria-documentation-review': {
    guidance: 'Review documentation for accuracy, completeness, and adherence to standards.',
    steps: ['Review content', 'Check accuracy', 'Verify completeness', 'Flag issues', 'Approve or request changes']
  },
  'pack.maria-stakeholder-reporting': {
    guidance: 'Generate clear governance and compliance reports for stakeholders.',
    steps: ['Collect findings', 'Analyze data', 'Format report', 'Deliver to stakeholders', 'Handle questions']
  },
  'pack.maria-incident-response': {
    guidance: 'Respond to governance incidents and violations with appropriate corrective actions.',
    steps: ['Identify incident', 'Assess severity', 'Coordinate response', 'Document resolution', 'Implement improvements']
  },
  'pack.coding.full-stack': {
    guidance: 'Implement full-stack features with TypeScript frontend and Rust backend. Write tests alongside code.',
    steps: ['Understand requirements', 'Plan architecture', 'Implement backend', 'Implement frontend', 'Write tests', 'Verify build']
  },
  'pack.coding.tdd': {
    guidance: 'Write tests first, implement minimally to pass, then refactor. Never skip the red-green-refactor cycle.',
    steps: ['Write failing test', 'Implement minimally', 'Verify test passes', 'Refactor', 'Repeat']
  },
  'pack.alphonso-typescript-mastery': {
    guidance: 'Write strict TypeScript with proper types. Avoid `any`. Use generics and utility types. Convert .js to .ts when possible.',
    steps: ['Enable strict mode', 'Define interfaces', 'Add type annotations', 'Eliminate `any`', 'Verify typecheck']
  },
  'pack.alphonso-rust-operations': {
    guidance: 'Write idiomatic Rust for Tauri v2. Use async/await with tokio. Handle errors with Result types.',
    steps: ['Understand Tauri patterns', 'Define command signature', 'Implement async logic', 'Add error handling', 'Write tests']
  },
  'pack.alphonso-react-patterns': {
    guidance: 'Use modern React patterns: hooks, memoization, virtualization. Avoid unnecessary re-renders.',
    steps: ['Identify component need', 'Design hook interface', 'Implement with memo', 'Add virtualization if list', 'Test']
  },
  'pack.alphonso-python-voice': {
    guidance: 'Write FastAPI endpoints with async handlers. Use pytest for testing. Follow PEP 8.',
    steps: ['Define endpoint schema', 'Implement async handler', 'Add validation', 'Write pytest tests', 'Verify']
  },
  'pack.alphonso-code-review': {
    guidance: 'Review code for quality, security, and maintainability. Provide actionable suggestions.',
    steps: ['Read changes', 'Check patterns', 'Validate types', 'Scan for secrets', 'Write review']
  },
  'pack.alphonso-build-verification': {
    guidance: 'Run full build verification before release. Check all gates: build, test, lint, typecheck.',
    steps: ['Run build', 'Run tests', 'Run lint', 'Run typecheck', 'Fix failures', 'Verify clean']
  },
  'pack.alphonso-refactoring': {
    guidance: 'Refactor safely: extract functions, simplify logic, optimize hot paths. Never change behavior.',
    steps: ['Identify smell', 'Extract function', 'Simplify logic', 'Verify tests pass', 'Repeat']
  },
  'pack.debugging.root-cause': {
    guidance: 'Debug systematically: observe symptoms, form hypothesis, test hypothesis, verify fix.',
    steps: ['Observe symptoms', 'Form hypothesis', 'Test hypothesis', 'Verify fix', 'Document root cause']
  },
  'pack.alphonso-runtime-diagnostics': {
    guidance: 'Monitor runtime health, diagnose issues, profile performance, optimize bottlenecks.',
    steps: ['Collect metrics', 'Identify anomaly', 'Profile hotspot', 'Optimize', 'Verify improvement']
  },
  'pack.alphonso-security-audit': {
    guidance: 'Scan for vulnerabilities, review security patterns, harden code, check for secrets.',
    steps: ['Scan dependencies', 'Review auth patterns', 'Check for secrets', 'Harden weak points', 'Verify']
  },
  'pack.github.integration': {
    guidance: 'Search GitHub for patterns, create issues, manage PRs, analyze repositories.',
    steps: ['Define search', 'Execute query', 'Analyze results', 'Create issue/PR', 'Verify']
  },
  'pack.alphonso-performance-optimization': {
    guidance: 'Profile performance, run benchmarks, analyze memory, optimize bundle size.',
    steps: ['Profile hot path', 'Benchmark baseline', 'Analyze memory', 'Optimize', 'Verify improvement']
  },
  'pack.alphonso-api-integration': {
    guidance: 'Build REST/GraphQL clients with proper error handling and testing.',
    steps: ['Define endpoint', 'Implement client', 'Add error handling', 'Write tests', 'Document']
  },
  'pack.alphonso-error-handling': {
    guidance: 'Add error boundaries, structured logging, recovery logic, and monitoring.',
    steps: ['Identify error points', 'Add boundaries', 'Implement logging', 'Add recovery', 'Monitor']
  },
  // Sentinel new packs - workflow guidance
  'pack.sentinel-connector-risk': {
    guidance: 'Assess risk level of outbound connectors before activation by auditing permissions and data scope.',
    steps: ['Identify connector scope', 'Audit permission grants', 'Assess data exposure risk', 'Assign risk rating', 'Document findings']
  },
  'pack.sentinel-secret-hygiene': {
    guidance: 'Scan for exposed secrets, API keys, and tokens across codebase and configuration.',
    steps: ['Scan for secret patterns', 'Check environment handling', 'Audit version control', 'Verify secret rotation', 'Report findings']
  },
  'pack.sentinel-permission-audit': {
    guidance: 'Audit agent and system permission boundaries for least-privilege compliance.',
    steps: ['Inventory permissions', 'Check against policy', 'Identify over-grants', 'Recommend revocations', 'Track changes']
  },
  'pack.sentinel-automation-safety': {
    guidance: 'Review automation workflows for unsafe patterns, missing gates, and self-reinforcing loops.',
    steps: ['Map automation flows', 'Identify safety gates', 'Check approval requirements', 'Flag unsafe patterns', 'Recommend fixes']
  },
  'pack.sentinel-policy-compliance': {
    guidance: 'Verify system behavior matches defined security policies and audit for enforcement gaps.',
    steps: ['Identify applicable policies', 'Check enforcement points', 'Audit compliance gaps', 'Track violations', 'Report status']
  },
  'pack.sentinel-threat-detection': {
    guidance: 'Monitor for anomalous behavior patterns, injection attempts, and unexpected data flows.',
    steps: ['Define threat indicators', 'Monitor agent behavior', 'Detect anomalies', 'Investigate alerts', 'Document incidents']
  },
  'pack.sentinel-csp-audit': {
    guidance: 'Audit Content Security Policy configuration to prevent XSS and injection attacks.',
    steps: ['Review CSP headers', 'Check directive completeness', 'Verify nonce/hash usage', 'Test for bypasses', 'Document gaps']
  },
  'pack.sentinel-dependency-audit': {
    guidance: 'Audit npm and system dependencies for known vulnerabilities and supply chain risks.',
    steps: ['Run dependency audit', 'Check for known CVEs', 'Review dependency age', 'Verify update availability', 'Document risks']
  },
  'pack.sentinel-connector-gating': {
    guidance: 'Verify connector dispatch goes through policy gate and activation approvals are enforced.',
    steps: ['Check gate configuration', 'Verify dispatch routing', 'Audit activation chain', 'Test bypass resistance', 'Report compliance']
  },
  'pack.sentinel-runtime-monitoring': {
    guidance: 'Monitor runtime environment for security anomalies, unexpected processes, and config drift.',
    steps: ['Define monitoring baseline', 'Track runtime changes', 'Detect anomalies', 'Investigate deviations', 'Alert on critical findings']
  },
  'pack.sentinel-approval-enforcement': {
    guidance: 'Verify high-risk actions require explicit approval and audit bypass attempts.',
    steps: ['Identify high-risk actions', 'Verify gate enforcement', 'Check bypass attempts', 'Audit approval records', 'Recommend improvements']
  },
  'pack.sentinel-data-protection': {
    guidance: 'Audit data handling for PII exposure, encryption compliance, and retention policy adherence.',
    steps: ['Map data flows', 'Check encryption status', 'Audit PII handling', 'Verify retention compliance', 'Document gaps']
  },
  'pack.sentinel-injection-scan': {
    guidance: 'Scan for SQL, XSS, and command injection vulnerabilities in input handling code.',
    steps: ['Map input entry points', 'Check parameterization', 'Audit sanitization', 'Test injection vectors', 'Document vulnerabilities']
  },
  'pack.sentinel-auth-audit': {
    guidance: 'Audit authentication and session management for security weaknesses.',
    steps: ['Review auth flow', 'Check credential storage', 'Audit session management', 'Verify token security', 'Document findings']
  },
  'pack.sentinel-risk-scoring': {
    guidance: 'Assign risk scores to security findings based on severity and exploitability.',
    steps: ['Assess finding severity', 'Check exploitability', 'Calculate risk score', 'Prioritize remediation', 'Track score trends']
  },
  'pack.sentinel-security-reporting': {
    guidance: 'Generate security posture reports with findings, risk scores, and remediation guidance.',
    steps: ['Collect audit findings', 'Calculate aggregate scores', 'Generate report', 'Provide remediation steps', 'Track resolution']
  },
  // Nova new packs - workflow guidance
  'pack.nova-market-analysis': {
    guidance: 'Analyze market size, segments, and competitive positioning to identify growth opportunities.',
    steps: ['Define market scope', 'Gather market data', 'Segment by value', 'Assess positioning', 'Recommend focus areas']
  },
  'pack.nova-prioritization-matrix': {
    guidance: 'Build weighted impact-vs-effort matrices to rank initiatives and features.',
    steps: ['Define scoring criteria', 'Score each initiative', 'Plot matrix', 'Identify quick wins', 'Recommend priority order']
  },
  'pack.nova-risk-reward': {
    guidance: 'Evaluate risk-to-reward ratios to balance growth potential against downside scenarios.',
    steps: ['Identify key risks', 'Estimate reward potential', 'Calculate risk-reward ratio', 'Compare alternatives', 'Recommend balanced approach']
  },
  'pack.nova-timing-analysis': {
    guidance: 'Identify optimal launch windows by analyzing market timing, seasonality, and competitive dynamics.',
    steps: ['Map timing factors', 'Identify windows', 'Assess competitive timing', 'Evaluate market readiness', 'Recommend launch timing']
  },
  'pack.nova-effort-estimation': {
    guidance: 'Estimate engineering and resource effort for initiatives to inform prioritization.',
    steps: ['Scope initiative complexity', 'Estimate effort by team', 'Compare against value', 'Identify dependencies', 'Provide confidence range']
  },
  'pack.nova-strategic-alignment': {
    guidance: 'Evaluate initiative alignment with product strategy and company OKRs.',
    steps: ['Map to strategic goals', 'Score alignment level', 'Identify high-alignment work', 'Flag misaligned initiatives', 'Recommend strategic focus']
  },
  'pack.nova-growth-analysis': {
    guidance: 'Analyze growth potential, adoption curves, and scaling opportunities.',
    steps: ['Define growth metrics', 'Analyze adoption drivers', 'Project growth curves', 'Identify scaling bottlenecks', 'Recommend growth levers']
  },
  'pack.nova-competitive-intelligence': {
    guidance: 'Identify feature gaps and differentiation opportunities relative to competitors.',
    steps: ['Map competitor capabilities', 'Identify gaps', 'Assess differentiation value', 'Track competitor moves', 'Recommend positioning']
  },
  'pack.nova-value-scoring': {
    guidance: 'Score initiatives by expected user and business value for objective comparison.',
    steps: ['Define value dimensions', 'Score each initiative', 'Aggregate value scores', 'Compare across portfolio', 'Recommend high-value work']
  },
  'pack.nova-resource-optimization': {
    guidance: 'Optimize resource allocation across competing initiatives for maximum impact.',
    steps: ['Map current allocation', 'Identify underutilized capacity', 'Reallocate to high-value work', 'Track impact of shifts', 'Recommend optimizations']
  },
  'pack.nova-scenario-modeling': {
    guidance: 'Model best-case, worst-case, and expected outcomes for strategic decisions.',
    steps: ['Define scenarios', 'Estimate outcomes per scenario', 'Calculate expected value', 'Compare scenarios', 'Recommend scenario planning']
  },
  'pack.nova-decision-support': {
    guidance: 'Provide data-driven decision support with evidence and tradeoff analysis.',
    steps: ['Gather decision criteria', 'Analyze options', 'Present tradeoffs', 'Recommend with evidence', 'Support stakeholder review']
  },
  'pack.nova-capability-assessment': {
    guidance: 'Assess team and technical capability readiness for proposed initiatives.',
    steps: ['Inventory capabilities', 'Assess readiness level', 'Identify gaps', 'Recommend investment areas', 'Track capability growth']
  },
  'pack.nova-trend-forecasting': {
    guidance: 'Forecast technology and market trends to inform long-term strategic planning.',
    steps: ['Identify relevant trends', 'Gather trend data', 'Project impact on product', 'Assess timing of relevance', 'Recommend strategic positioning']
  },
  'pack.nova-portfolio-analysis': {
    guidance: 'Analyze initiative portfolio for balance, risk distribution, and optimal mix.',
    steps: ['Map current portfolio', 'Analyze balance metrics', 'Identify concentration risks', 'Recommend portfolio adjustments', 'Track portfolio health']
  },
  'pack.nova-recommendation-engine': {
    guidance: 'Generate automated prioritized recommendations from opportunity scoring data.',
    steps: ['Collect scoring inputs', 'Apply weighting model', 'Generate ranked list', 'Update as data changes', 'Deliver recommendations']
  }
};

// Shared packs are intentionally reusable. Profiles declare which ones they
// receive; they are not owned by a single agent in the registry.
const SHARED_AGENT_SKILL_PACK_IDS = {
  jose: ['pack.workflow.executing-plans'],
  hector: ['pack.workflow.executing-plans'],
  marcus: ['pack.workflow.executing-plans']
};

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

// ── Skill pack "last invoked at" tracking (for coach engine's detectUnusedSurfaceArea) ──
const SKILL_PACK_INVOCATION_KEY = 'alphonso_skill_pack_invocation_v1';

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
