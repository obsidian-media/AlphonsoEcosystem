import { TRUST_STATES } from './trustModel';

export const JOSE_BASE_PACKS = [
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
];
