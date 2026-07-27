export const SKILL_WORKFLOW_GUIDANCE = {
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
export const SHARED_AGENT_SKILL_PACK_IDS = {
  jose: ['pack.workflow.executing-plans'],
  hector: ['pack.workflow.executing-plans'],
  marcus: ['pack.workflow.executing-plans']
};
