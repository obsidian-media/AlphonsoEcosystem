# Agent Skill-Pack Permission Matrix

**Generated file — do not hand-edit.**

Regenerate with `node scripts/generate-skill-permission-matrix.mjs` after
changing `src/services/skillPackService.js` or
`src/services/agentContractService.ts`. Correctness (every pack owned,
documented, and within its own contract) is enforced independently by
`src/test/services/skillPackContractMatrix.test.ts`, which runs under
`npm test` and therefore gates CI — this doc is the human-readable view of
the same source of truth, not a separate claim.

Source of truth: `src/services/skillPackService.js` (packs) +
`src/services/agentContractService.ts` (contracts + per-pack scope overrides).

**Shared status.** A pack is either exclusive (owned by exactly one agent,
scoped by that agent's contract) or shared (usable by any agent, category
`agent_workflow`, no `ownerAgent`, unscoped by
`validateSkillPackAgainstContract` by design). See the two sections below.

**Blocked prefixes.** Every pack (except Alphonso's) is always subject to
the universal blocklist (`filesystem.write`, `execute_command`,
`external_publish`, `purchase`) regardless of its allowlist. A pack can
additionally carry its own narrower denylist in
`AGENT_SKILL_PACK_BLOCKED_OVERRIDES`, applied even to Alphonso, shown per
pack below when present.

Total exclusive `agent_skill` category packs: **167**
Total shared `agent_workflow` category packs: **20**

## Exclusive packs (owned by one agent)

### alphonso

Role: `operator`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.alphonso-api-integration` | API Integration | per-pack override | `code.api.rest`, `code.api.graphql`, `code.api.testing`, `code.api.docs` | — |
| `pack.alphonso-build-verification` | Build Verification | per-pack override | `verification.build`, `verification.test`, `verification.lint`, `verification.typecheck` | — |
| `pack.alphonso-code-review` | Code Review | per-pack override | `code.review`, `code.suggest`, `code.validate`, `code.security.scan` | — |
| `pack.alphonso-error-handling` | Error Handling | per-pack override | `code.error.boundary`, `code.error.logging`, `code.error.recovery`, `code.error.monitoring` | — |
| `pack.alphonso-performance-optimization` | Performance Optimization | per-pack override | `runtime.perf.profile`, `runtime.perf.benchmark`, `runtime.perf.memory`, `runtime.perf.bundle` | — |
| `pack.alphonso-python-voice` | Python Voice Systems | per-pack override | `code.python.fastapi`, `code.python.testing`, `code.python.async` | — |
| `pack.alphonso-react-patterns` | React Patterns | per-pack override | `code.react.hooks`, `code.react.components`, `code.react.performance` | — |
| `pack.alphonso-refactoring` | Refactoring | per-pack override | `code.refactor`, `code.simplify`, `code.optimize`, `code.extract` | — |
| `pack.alphonso-runtime-diagnostics` | Runtime Diagnostics | per-pack override | `runtime.monitor`, `runtime.diagnose`, `runtime.profile`, `runtime.optimize` | — |
| `pack.alphonso-runtime-operations` | Alphonso Runtime Operations Skill | agent-wide default | `runtime.read`, `runtime.manage`, `workflows.read`, `verification_before_completion`, `local_operation` | — |
| `pack.alphonso-rust-operations` | Rust Operations | per-pack override | `code.rust.tauri`, `code.rust.async`, `code.rust.error_handling` | — |
| `pack.alphonso-security-audit` | Security Audit | per-pack override | `verification.security.scan`, `verification.security.review`, `verification.security.harden`, `verification.secrets.check` | — |
| `pack.alphonso-typescript-mastery` | TypeScript Mastery | per-pack override | `code.typescript.strict`, `code.typescript.types`, `code.typescript.refactor` | — |
| `pack.codex-professional-coding` | OpenAI Codex Professional Coding Skill | agent-wide default | `workflows.read`, `workflows.write`, `runtime.read`, `code.review`, `code.plan` | — |
| `pack.coding.full-stack` | Full-Stack Coding | per-pack override | `code.write`, `code.edit`, `code.refactor`, `runtime.test` | — |
| `pack.coding.tdd` | Test-Driven Development | per-pack override | `code.test.first`, `code.test.verify`, `code.refactor.minimal` | — |
| `pack.debugging.root-cause` | Root-Cause Debugging | per-pack override | `runtime.debug.observe`, `runtime.debug.hypothesize`, `runtime.debug.test`, `runtime.debug.verify` | — |
| `pack.github.integration` | GitHub Integration | per-pack override | `runtime.github.search`, `runtime.github.issue`, `runtime.github.pr`, `runtime.github.repo` | — |

### echo

Role: `memory_historian`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.echo-audit-trail` | Echo Audit Trail | per-pack override | `timeline.audit`, `memory.trail`, `knowledge.trace` | — |
| `pack.echo-confidence-normalization` | Echo Confidence Normalization | per-pack override | `memory.confidence`, `knowledge.quality`, `retention.score` | — |
| `pack.echo-context-retrieval` | Echo Context Retrieval | per-pack override | `memory.retrieve`, `knowledge.search`, `timeline.query` | — |
| `pack.echo-decision-capture` | Echo Decision Capture | per-pack override | `memory.decisions`, `knowledge.context`, `timeline.decisions` | — |
| `pack.echo-decision-diff` | Echo Decision Diff | per-pack override | `memory.diff`, `knowledge.compare`, `timeline.changes` | — |
| `pack.echo-historical-context` | Echo Historical Context | per-pack override | `knowledge.context`, `timeline.history`, `memory.context` | — |
| `pack.echo-knowledge-graph` | Echo Knowledge Graph | per-pack override | `knowledge.graph`, `memory.relate`, `knowledge.edges` | — |
| `pack.echo-knowledge-indexing` | Echo Knowledge Indexing | per-pack override | `knowledge.index`, `memory.retrieve`, `timeline.search` | — |
| `pack.echo-memory-pruning` | Echo Memory Pruning | per-pack override | `retention.prune`, `memory.cleanup`, `retention.archive` | — |
| `pack.echo-memory-reporting` | Echo Memory Reporting | per-pack override | `memory.report`, `retention.summary`, `knowledge.stats` | — |
| `pack.echo-memory-synthesis` | Echo Memory Synthesis Skill | agent-wide default | `memory.synthesize`, `retention.classify`, `knowledge.timeline`, `timeline.summarize` | — |
| `pack.echo-memory-synthesis-advanced` | Echo Memory Synthesis Advanced | per-pack override | `memory.synthesize`, `knowledge.merge`, `timeline.merge` | — |
| `pack.echo-memory-validation` | Echo Memory Validation | per-pack override | `memory.validate`, `knowledge.verify`, `retention.quality` | — |
| `pack.echo-preference-learning` | Echo Preference Learning | per-pack override | `memory.preferences`, `knowledge.user`, `retention.personal` | — |
| `pack.echo-retention-classification` | Echo Retention Classification | per-pack override | `retention.classify`, `retention.policies`, `memory.categories` | — |
| `pack.echo-session-continuity` | Echo Session Continuity | per-pack override | `memory.session`, `knowledge.continuity`, `timeline.session` | — |
| `pack.echo-timeline-construction` | Echo Timeline Construction | per-pack override | `timeline.construct`, `memory.timeline`, `knowledge.temporal` | — |

### hector

Role: `research`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.hector-api-documentation-research` | Hector API Documentation Research | per-pack override | `research`, `source_verification`, `citation_gathering` | — |
| `pack.hector-api-integration-research` | Hector API Integration Research | per-pack override | `research`, `source_verification`, `citation_gathering` | — |
| `pack.hector-code-pattern-research` | Hector Code Pattern Research | per-pack override | `research`, `competitive_scan`, `source_verification` | — |
| `pack.hector-competitive-analysis` | Hector Competitive Analysis Skill | per-pack override | `competitive_scan`, `market_research`, `campaign_planning` | — |
| `pack.hector-compliance-research` | Hector Compliance Research | per-pack override | `research`, `source_verification`, `confidence_scoring` | — |
| `pack.hector-confidence-scoring` | Hector Confidence Scoring | per-pack override | `confidence_scoring`, `source_verification`, `citation_gathering` | — |
| `pack.hector-content-research` | Hector Content Research | per-pack override | `content_strategy`, `market_research`, `source_verification` | — |
| `pack.hector-data-gathering` | Hector Data Gathering | per-pack override | `research`, `citation_gathering`, `confidence_scoring` | — |
| `pack.hector-documentation-audit` | Hector Documentation Audit | per-pack override | `research`, `source_verification`, `citation_gathering` | — |
| `pack.hector-market-intelligence` | Hector Market Intelligence | per-pack override | `market_research`, `competitive_scan`, `content_strategy` | — |
| `pack.hector-market-research` | Hector Market Research Skill | per-pack override | `market_research`, `source_verification`, `citation_gathering` | — |
| `pack.hector-open-source-analysis` | Hector Open Source Analysis | per-pack override | `competitive_scan`, `source_verification`, `confidence_scoring` | — |
| `pack.hector-professional-marketing` | Hector Professional Marketing Skill | agent-wide default | `market_research`, `content_strategy`, `campaign_planning`, `workflow_review` | — |
| `pack.hector-research-briefing` | Hector Research Briefing | per-pack override | `research`, `content_strategy`, `citation_gathering` | — |
| `pack.hector-rss-monitoring` | Hector RSS Monitoring Skill | per-pack override | `feed_monitoring`, `source_verification` | — |
| `pack.hector-security-research` | Hector Security Research | per-pack override | `research`, `source_verification`, `confidence_scoring` | — |
| `pack.hector-source-curation` | Hector Source Curation | per-pack override | `source_verification`, `citation_gathering`, `feed_monitoring` | — |
| `pack.hector-source-verification` | Hector Source Verification Skill | per-pack override | `source_verification`, `citation_gathering`, `confidence_scoring` | — |
| `pack.hector-survey-design` | Hector Survey Design | per-pack override | `research`, `market_research`, `citation_gathering` | — |
| `pack.hector-technical-architecture-research` | Hector Technical Architecture Research | per-pack override | `research`, `competitive_scan`, `citation_gathering` | — |
| `pack.hector-trend-analysis` | Hector Trend Analysis | per-pack override | `market_research`, `competitive_scan`, `citation_gathering` | — |

### jose

Role: `orchestrator`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.jose-agent-coordination` | Jose Agent Coordination | per-pack override | `task_routing.coordinate`, `task_routing.delegate`, `task_routing.monitor` | — |
| `pack.jose-approval-gating` | Jose Approval Gating Skill | per-pack override | `approval_gating`, `execution_tracking` | — |
| `pack.jose-bottleneck-detection` | Jose Bottleneck Detection | per-pack override | `execution_tracking.bottleneck`, `execution_tracking.blocker`, `execution_tracking.delay` | — |
| `pack.jose-compliance-checks` | Jose Compliance Checks | per-pack override | `approval_gating.compliance`, `approval_gating.policy`, `approval_gating.audit` | — |
| `pack.jose-continuous-improvement` | Jose Continuous Improvement | per-pack override | `workflows.learn`, `workflows.adapt`, `workflows.evolve` | — |
| `pack.jose-cross-agent-synthesis` | Jose Cross-Agent Synthesis Skill | per-pack override | `cross_agent_synthesis`, `task_routing` | — |
| `pack.jose-dependency-mapping` | Jose Dependency Mapping | per-pack override | `workflows.dependency`, `workflows.mapping`, `workflows.sequence` | — |
| `pack.jose-parallel-orchestration` | Jose Parallel Orchestration | per-pack override | `task_routing.parallel`, `task_routing.concurrent`, `execution_tracking.parallel` | — |
| `pack.jose-performance-metrics` | Jose Performance Metrics | per-pack override | `execution_tracking.metrics`, `execution_tracking.performance`, `execution_tracking.analytics` | — |
| `pack.jose-pipeline-governance` | Jose Pipeline Governance Skill | per-pack override | `execution_tracking`, `approval_gating` | — |
| `pack.jose-professional-orchestration` | Jose Professional Orchestration Skill | agent-wide default | `task_routing`, `approval_gating`, `cross_agent_synthesis`, `execution_tracking` | — |
| `pack.jose-progress-tracking` | Jose Progress Tracking | per-pack override | `execution_tracking.progress`, `execution_tracking.monitor`, `execution_tracking.status` | — |
| `pack.jose-quality-gates` | Jose Quality Gates | per-pack override | `approval_gating.quality`, `approval_gating.verify`, `approval_gating.validate` | — |
| `pack.jose-risk-assessment` | Jose Risk Assessment | per-pack override | `approval_gating.risk`, `approval_gating.assess`, `approval_gating.classify` | — |
| `pack.jose-stakeholder-communication` | Jose Stakeholder Communication | per-pack override | `agent_report.stakeholder`, `agent_report.status`, `agent_report.progress` | — |
| `pack.jose-status-reporting` | Jose Status Reporting | per-pack override | `execution_tracking.report`, `execution_tracking.summary`, `execution_tracking.dashboard` | — |
| `pack.jose-strategic-planning` | Jose Strategic Planning | per-pack override | `workflows.strategic`, `workflows.long_term`, `workflows.roadmap` | — |
| `pack.jose-task-prioritization` | Jose Task Prioritization | per-pack override | `task_routing.prioritize`, `task_routing.sequence`, `task_routing.urgent` | — |
| `pack.jose-task-routing` | Jose Task Routing Skill | per-pack override | `task_routing`, `execution_tracking` | — |
| `pack.jose-workflow-design` | Jose Workflow Design | per-pack override | `workflows.design`, `workflows.plan`, `workflows.decompose` | — |
| `pack.jose-workflow-optimization` | Jose Workflow Optimization | per-pack override | `workflows.optimize`, `workflows.improve`, `workflows.streamline` | — |

### marcus

Role: `distribution_execution`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.marcus-approval-gatekeeping` | Marcus Approval Gatekeeping | per-pack override | `distribution.gate`, `approved_dispatch`, `performance.verify` | — |
| `pack.marcus-asset-distribution` | Marcus Asset Distribution | per-pack override | `distribution.assets`, `approved_dispatch`, `performance.track` | — |
| `pack.marcus-changelog-generation` | Marcus Changelog Generation | per-pack override | `distribution.changelog`, `approved_dispatch`, `engagement.track` | — |
| `pack.marcus-compliance-distribution` | Marcus Compliance Distribution | per-pack override | `distribution.compliance`, `performance.audit`, `approved_dispatch` | — |
| `pack.marcus-deployment-execution` | Marcus Deployment Execution | per-pack override | `distribution.deploy`, `approved_dispatch`, `performance.verify` | — |
| `pack.marcus-distribution-execution` | Marcus Distribution Execution Skill | agent-wide default | `distribution.publish`, `distribution.schedule`, `engagement.track`, `performance.report`, `approved_dispatch` | — |
| `pack.marcus-github-releases` | Marcus GitHub Releases | per-pack override | `distribution.github`, `approved_dispatch`, `engagement.track` | — |
| `pack.marcus-integration-validation` | Marcus Integration Validation | per-pack override | `distribution.validation`, `performance.integration`, `approved_dispatch` | — |
| `pack.marcus-notification-routing` | Marcus Notification Routing | per-pack override | `distribution.routing`, `engagement.notify`, `approved_dispatch` | — |
| `pack.marcus-release-readiness` | Marcus Release Readiness | per-pack override | `distribution.readiness`, `performance.check`, `approved_dispatch` | — |
| `pack.marcus-release-reporting` | Marcus Release Reporting | per-pack override | `distribution.reporting`, `performance.report`, `approved_dispatch` | — |
| `pack.marcus-risk-detection` | Marcus Risk Detection | per-pack override | `distribution.risk`, `performance.assessment`, `approved_dispatch` | — |
| `pack.marcus-rollback-execution` | Marcus Rollback Execution | per-pack override | `distribution.rollback`, `approved_dispatch`, `performance.verify` | — |
| `pack.marcus-security-audit` | Marcus Security Audit | per-pack override | `distribution.security`, `performance.audit`, `approved_dispatch` | — |
| `pack.marcus-slack-notifications` | Marcus Slack Notifications | per-pack override | `distribution.slack`, `engagement.notify`, `approved_dispatch` | — |
| `pack.marcus-team-communication` | Marcus Team Communication | per-pack override | `distribution.communication`, `engagement.notify`, `approved_dispatch` | — |
| `pack.marcus-version-management` | Marcus Version Management | per-pack override | `distribution.versioning`, `approved_dispatch`, `performance.track` | — |

### maria

Role: `governance_audit`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.maria-approval-workflow` | Maria Approval Workflow | per-pack override | `approval.workflow`, `approval.gate`, `approval.track` | — |
| `pack.maria-audit-governance` | Maria Audit Governance Skill | agent-wide default | `workflow.audit`, `risk.classification`, `claim.verification`, `approval.integrity` | — |
| `pack.maria-audit-trail` | Maria Audit Trail | per-pack override | `receipt.audit`, `receipt.track`, `receipt.verify` | — |
| `pack.maria-brand-safety` | Maria Brand Safety | per-pack override | `workflow.audit.brand`, `workflow.audit.safety`, `workflow.audit.compliance` | — |
| `pack.maria-claim-verification` | Maria Claim Verification | per-pack override | `claim.verify`, `claim.validate`, `claim.audit` | — |
| `pack.maria-compliance-auditing` | Maria Compliance Auditing | per-pack override | `workflow.audit.compliance`, `workflow.audit.verify`, `workflow.audit.enforce` | — |
| `pack.maria-content-moderation` | Maria Content Moderation | per-pack override | `workflow.audit.content`, `workflow.audit.moderate`, `workflow.audit.review` | — |
| `pack.maria-documentation-review` | Maria Documentation Review | per-pack override | `workflow.audit.documentation`, `workflow.audit.review`, `workflow.audit.approve` | — |
| `pack.maria-evidence-collection` | Maria Evidence Collection | per-pack override | `evidence.collect`, `evidence.verify`, `evidence.document` | — |
| `pack.maria-incident-response` | Maria Incident Response | per-pack override | `workflow.audit.incident`, `workflow.audit.response`, `workflow.audit.resolve` | — |
| `pack.maria-policy-enforcement` | Maria Policy Enforcement | per-pack override | `policy.enforce`, `policy.audit`, `policy.verify` | — |
| `pack.maria-quality-assurance` | Maria Quality Assurance | per-pack override | `workflow.audit.quality`, `workflow.audit.assurance`, `workflow.audit.verify` | — |
| `pack.maria-requirements-analysis` | Maria Requirements Analysis | per-pack override | `workflow.audit.requirements`, `workflow.audit.analysis`, `workflow.audit.organize` | — |
| `pack.maria-risk-classification` | Maria Risk Classification | per-pack override | `risk.classify`, `risk.assess`, `risk.categorize` | — |
| `pack.maria-stakeholder-reporting` | Maria Stakeholder Reporting | per-pack override | `agent_report.stakeholder`, `agent_report.status`, `agent_report.progress` | — |
| `pack.maria-state-verification` | Maria State Verification | per-pack override | `state.verify`, `state.audit`, `state.validate` | — |
| `pack.maria-trust-audit` | Maria Trust Audit | per-pack override | `trust.audit`, `trust.verify`, `trust.validate` | — |
| `pack.maria-trust-verification` | Maria Trust Verification Skill | agent-wide default | `trust.validation`, `receipt.validation`, `evidence.review`, `state.confirmation` | — |

### miya

Role: `creator`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.miya-animation-design` | Miya Animation Design | per-pack override | `creative.animation`, `video.motion`, `creative.interaction` | — |
| `pack.miya-brand-guidelines` | Miya Brand Guidelines | per-pack override | `creative.brand_guidelines`, `creative.style_guide`, `creative.brand_direction` | — |
| `pack.miya-brand-identity` | Miya Brand Identity Skill | per-pack override | `creative.brand_direction`, `creative.style_guide` | — |
| `pack.miya-color-palette` | Miya Color Palette | per-pack override | `creative.color`, `creative.style_guide`, `creative.brand_direction` | — |
| `pack.miya-content-strategy` | Miya Content Strategy | per-pack override | `creative.content_strategy`, `creative.copywriting`, `creative.messaging` | — |
| `pack.miya-creative-image` | Miya Creative Image Skill | per-pack override | `media.generate`, `image.compose`, `creative.preview` | — |
| `pack.miya-dashboard-design` | Miya Dashboard Design | per-pack override | `creative.dashboard`, `creative.ui_direction`, `creative.data_visualization` | — |
| `pack.miya-design-system` | Miya Design System | per-pack override | `creative.design_system`, `creative.component_library`, `creative.style_guide` | — |
| `pack.miya-editorial-design` | Miya Editorial Design | per-pack override | `creative.editorial`, `creative.layout`, `creative.typography` | — |
| `pack.miya-icon-system` | Miya Icon System | per-pack override | `image.icon`, `creative.style_guide`, `creative.design_system` | — |
| `pack.miya-illustration-style` | Miya Illustration Style | per-pack override | `image.illustration`, `creative.style_guide`, `creative.direction` | — |
| `pack.miya-landing-page` | Miya Landing Page | per-pack override | `creative.landing_page`, `creative.ui_direction`, `creative.campaign` | — |
| `pack.miya-motion-graphics` | Miya Motion Graphics Skill | per-pack override | `media.generate`, `video.motion`, `creative.animation` | — |
| `pack.miya-motion-system` | Miya Motion System | per-pack override | `creative.motion_system`, `creative.animation`, `creative.interaction` | — |
| `pack.miya-runway-video-generation` | Miya Runway Video Generation Skill | agent-wide default | `media.generate`, `video.draft`, `creative.preview`, `runway.api` | — |
| `pack.miya-social-media-design` | Miya Social Media Design | per-pack override | `creative.social`, `image.compose`, `creative.campaign` | — |
| `pack.miya-typography-system` | Miya Typography System | per-pack override | `creative.typography`, `creative.style_guide`, `creative.design_system` | — |
| `pack.miya-ui-ux-design` | Miya UI/UX Design Skill | per-pack override | `creative.ui_direction`, `creative.ux_flow`, `creative.wireframe` | — |
| `pack.miya-user-research` | Miya User Research | per-pack override | `creative.user_research`, `creative.usability`, `creative.persona` | — |
| `pack.miya-video-editing` | Miya Video Editing | per-pack override | `video.editing`, `video.transitions`, `creative.post_production` | — |
| `pack.miya-video-storyboarding` | Miya Video Storyboarding | per-pack override | `video.storyboard`, `creative.direction`, `video.shot_list` | — |

### nova

Role: `opportunity_intelligence`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.nova-capability-assessment` | Nova Capability Assessment | per-pack override | `analysis.capability`, `opportunity.readiness`, `strategy.maturity` | — |
| `pack.nova-competitive-intelligence` | Nova Competitive Intelligence | per-pack override | `analysis.competitive`, `opportunity.gap`, `strategy.differentiation` | — |
| `pack.nova-decision-support` | Nova Decision Support | per-pack override | `strategy.decision`, `analysis.support`, `prioritization.recommendation` | — |
| `pack.nova-effort-estimation` | Nova Effort Estimation | per-pack override | `opportunity.effort`, `analysis.complexity`, `prioritization.resource` | — |
| `pack.nova-growth-analysis` | Nova Growth Analysis | per-pack override | `analysis.growth`, `opportunity.growth`, `strategy.scaling` | — |
| `pack.nova-market-analysis` | Nova Market Analysis | per-pack override | `analysis.market`, `opportunity.segment`, `strategy.positioning` | — |
| `pack.nova-opportunity-analysis` | Nova Opportunity Analysis Skill | agent-wide default | `opportunity.score`, `analysis.trend`, `prioritization.rank`, `strategy.recommend` | — |
| `pack.nova-portfolio-analysis` | Nova Portfolio Analysis | per-pack override | `analysis.portfolio`, `prioritization.balance`, `strategy.portfolio` | — |
| `pack.nova-prioritization-matrix` | Nova Prioritization Matrix | per-pack override | `prioritization.matrix`, `opportunity.rank`, `analysis.impact` | — |
| `pack.nova-recommendation-engine` | Nova Recommendation Engine | per-pack override | `strategy.recommend`, `prioritization.engine`, `analysis.suggestion` | — |
| `pack.nova-resource-optimization` | Nova Resource Optimization | per-pack override | `strategy.resource`, `analysis.allocation`, `prioritization.capacity` | — |
| `pack.nova-risk-reward` | Nova Risk-Reward Assessment | per-pack override | `opportunity.risk`, `analysis.reward`, `strategy.balance` | — |
| `pack.nova-scenario-modeling` | Nova Scenario Modeling | per-pack override | `analysis.scenario`, `opportunity.projection`, `strategy.modeling` | — |
| `pack.nova-strategic-alignment` | Nova Strategic Alignment | per-pack override | `strategy.alignment`, `opportunity.strategic`, `analysis.goals` | — |
| `pack.nova-timing-analysis` | Nova Timing Analysis | per-pack override | `opportunity.timing`, `analysis.window`, `strategy.sequencing` | — |
| `pack.nova-trend-forecasting` | Nova Trend Forecasting | per-pack override | `analysis.forecast`, `opportunity.trend`, `strategy.projection` | — |
| `pack.nova-value-scoring` | Nova Value Scoring | per-pack override | `opportunity.value`, `prioritization.score`, `analysis.worth` | — |

### sentinel

Role: `security_monitoring`

| Pack ID | Name | Scope | Permissions | Blocked (per-pack) |
|---|---|---|---|---|
| `pack.sentinel-approval-enforcement` | Sentinel Approval Enforcement | per-pack override | `security.approval`, `permission.enforcement`, `audit.approval` | — |
| `pack.sentinel-auth-audit` | Sentinel Auth Audit | per-pack override | `security.auth`, `audit.authentication`, `risk.credential` | — |
| `pack.sentinel-automation-safety` | Sentinel Automation Safety | per-pack override | `security.automation`, `risk.safety`, `audit.automation` | — |
| `pack.sentinel-connector-gating` | Sentinel Connector Gating | per-pack override | `security.gating`, `permission.connector`, `audit.gate` | — |
| `pack.sentinel-connector-risk` | Sentinel Connector Risk Assessment | per-pack override | `security.connector`, `risk.assessment`, `audit.findings` | — |
| `pack.sentinel-csp-audit` | Sentinel CSP Audit | per-pack override | `security.csp`, `audit.policy`, `risk.injection` | — |
| `pack.sentinel-data-protection` | Sentinel Data Protection | per-pack override | `security.data`, `audit.data`, `risk.data_leak` | — |
| `pack.sentinel-dependency-audit` | Sentinel Dependency Audit | per-pack override | `security.dependencies`, `audit.packages`, `risk.supply` | — |
| `pack.sentinel-injection-scan` | Sentinel Injection Scan | per-pack override | `security.injection`, `risk.injection`, `audit.input` | — |
| `pack.sentinel-permission-audit` | Sentinel Permission Audit | per-pack override | `permission.audit`, `security.permissions`, `audit.findings` | — |
| `pack.sentinel-policy-compliance` | Sentinel Policy Compliance | per-pack override | `security.policy`, `audit.compliance`, `risk.violation` | — |
| `pack.sentinel-risk-scoring` | Sentinel Risk Scoring | per-pack override | `risk.scoring`, `security.classification`, `audit.risk` | — |
| `pack.sentinel-runtime-monitoring` | Sentinel Runtime Monitoring | per-pack override | `security.runtime`, `audit.monitoring`, `risk.runtime` | — |
| `pack.sentinel-secret-hygiene` | Sentinel Secret Hygiene | per-pack override | `security.secrets`, `audit.scan`, `risk.exposure` | — |
| `pack.sentinel-security-reporting` | Sentinel Security Reporting | per-pack override | `security.reporting`, `audit.report`, `risk.summary` | — |
| `pack.sentinel-threat-detection` | Sentinel Threat Detection | per-pack override | `security.threat`, `risk.detection`, `audit.threat` | — |
| `pack.sentinel-vuln-scan` | Sentinel Vulnerability Scan Skill | agent-wide default | `security.scan`, `risk.classification`, `permission.review`, `audit.findings` | — |

## Shared packs (cross-agent, unscoped by contract)

| Pack ID | Name | Permissions |
|---|---|---|
| `pack.workflow.agent-browser` | agent-browser | `browser.navigate`, `browser.click`, `browser.fill`, `browser.extract`, `browser.screenshot` |
| `pack.workflow.brainstorming` | brainstorming | `ideation.organize`, `problem.decompose` |
| `pack.workflow.browser-use` | browser-use | `browser.vision`, `browser.interpret`, `browser.navigate` |
| `pack.workflow.dispatching-parallel-agents` | dispatching-parallel-agents | `parallel.dispatch`, `parallel.coordinate`, `parallel.verify` |
| `pack.workflow.executing-plans` | executing-plans | `execution.steps`, `execution.checkpoints`, `verification.before_completion` |
| `pack.workflow.find-skills` | find-skills | `skills.discover`, `skills.install`, `session.read` |
| `pack.workflow.finishing-a-development-branch` | finishing-a-development-branch | `tests.run`, `commit.write`, `pr.open`, `review.request` |
| `pack.workflow.ralph-loop` | ralph-loop | `autonomy.loop`, `task.persistence`, `task.retry` |
| `pack.workflow.ralph-tui-create-beads` | ralph-tui-create-beads | `tasklist.dependencies`, `autonomy.loop`, `task.track` |
| `pack.workflow.ralph-tui-create-json` | ralph-tui-create-json | `tasklist.json`, `autonomy.loop`, `task.export` |
| `pack.workflow.ralph-tui-prd` | ralph-tui-prd | `tasklist.prd`, `autonomy.loop`, `task.decompose` |
| `pack.workflow.ralph-wiggum` | ralph-wiggum | `autonomy.loop`, `setup.minimal`, `task.retry` |
| `pack.workflow.requesting-code-review` | requesting-code-review | `review.self`, `review.prepare`, `review.request` |
| `pack.workflow.skill-creator` | skill-creator | `skills.create`, `skills.test`, `skills.publish` |
| `pack.workflow.subagent-driven-development` | subagent-driven-development | `subagents.orchestrate`, `task.specialize`, `task.coordinate` |
| `pack.workflow.systematic-debugging` | systematic-debugging | `debug.observe`, `debug.hypothesize`, `debug.test`, `debug.verify` |
| `pack.workflow.test-driven-development` | test-driven-development | `tests.write_first`, `tests.verify`, `refactor.minimal` |
| `pack.workflow.using-git-worktrees` | using-git-worktrees | `git.worktree`, `branch.isolation`, `parallel.workspace` |
| `pack.workflow.verification-before-completion` | verification-before-completion | `verification.require`, `completion.gate`, `release.truth` |
| `pack.workflow.writing-plans` | writing-plans | `planning.decompose`, `planning.sequence`, `planning.checkpoints` |

