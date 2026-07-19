# Jose Agent — Skill Packs

**Version**: 2.6.0
**Last Updated**: 2026-07-17
**Total Skill Packs**: 22 (6 existing + 16 new)

## Overview

Jose is the **Master Orchestrator / Hermes** — the highest-authority agent responsible for planning, decomposing, routing, gating approvals, and synthesizing cross-agent outputs. He is "born with" 22 specialized skill packs that cover the full spectrum of orchestration: planning, coordination, governance, monitoring, and optimization.

## Skill Pack Inventory

### Existing Packs (6)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.jose-professional-orchestration` | Professional Orchestration | Task routing, approval gating, cross-agent synthesis |
| `pack.jose-task-routing` | Task Routing | Route tasks to correct agents |
| `pack.jose-approval-gating` | Approval Gating | Gate high-risk actions |
| `pack.jose-cross-agent-synthesis` | Cross-Agent Synthesis | Merge multi-agent outputs |
| `pack.jose-pipeline-governance` | Pipeline Governance | Budget/loop guard enforcement |
| `pack.workflow.executing-plans` | Executing Plans | Execute plans step-by-step |

### Planning & Strategy Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-workflow-design` | Workflow Design | `workflows.design`, `workflows.plan`, `workflows.decompose` | Design a multi-agent workflow for content production |
| `pack.jose-strategic-planning` | Strategic Planning | `workflows.strategic`, `workflows.long_term`, `workflows.roadmap` | Create a strategic roadmap for product development |
| `pack.jose-dependency-mapping` | Dependency Mapping | `workflows.dependency`, `workflows.mapping`, `workflows.sequence` | Map task dependencies for a project |

### Execution & Coordination Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-agent-coordination` | Agent Coordination | `task_routing.coordinate`, `task_routing.delegate`, `task_routing.monitor` | Coordinate parallel tasks across multiple agents |
| `pack.jose-parallel-orchestration` | Parallel Orchestration | `task_routing.parallel`, `task_routing.concurrent`, `execution_tracking.parallel` | Run independent tasks in parallel |
| `pack.jose-task-prioritization` | Task Prioritization | `task_routing.prioritize`, `task_routing.sequence`, `task_routing.urgent` | Prioritize tasks based on risk and value |

### Governance & Quality Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-risk-assessment` | Risk Assessment | `approval_gating.risk`, `approval_gating.assess`, `approval_gating.classify` | Assess risk level of a deployment task |
| `pack.jose-quality-gates` | Quality Gates | `approval_gating.quality`, `approval_gating.verify`, `approval_gating.validate` | Verify task output meets quality standards |
| `pack.jose-compliance-checks` | Compliance Checks | `approval_gating.compliance`, `approval_gating.policy`, `approval_gating.audit` | Verify compliance with security policies |

### Monitoring & Reporting Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-progress-tracking` | Progress Tracking | `execution_tracking.progress`, `execution_tracking.monitor`, `execution_tracking.status` | Track progress of multi-agent workflows |
| `pack.jose-status-reporting` | Status Reporting | `execution_tracking.report`, `execution_tracking.summary`, `execution_tracking.dashboard` | Generate executive status report |
| `pack.jose-performance-metrics` | Performance Metrics | `execution_tracking.metrics`, `execution_tracking.performance`, `execution_tracking.analytics` | Track agent performance metrics |

### Optimization & Learning Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-workflow-optimization` | Workflow Optimization | `workflows.optimize`, `workflows.improve`, `workflows.streamline` | Optimize workflow for faster execution |
| `pack.jose-bottleneck-detection` | Bottleneck Detection | `execution_tracking.bottleneck`, `execution_tracking.blocker`, `execution_tracking.delay` | Identify bottlenecks in task execution |
| `pack.jose-continuous-improvement` | Continuous Improvement | `workflows.learn`, `workflows.adapt`, `workflows.evolve` | Learn from orchestration patterns |

### Communication Packs (1)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.jose-stakeholder-communication` | Stakeholder Communication | `agent_report.stakeholder`, `agent_report.status`, `agent_report.progress` | Report workflow status to stakeholders |

## Permission Model

All Jose skill pack permissions use the agent's allowed prefixes:

- `task_routing.*` — Task routing and delegation
- `approval_gating.*` — Approval and governance
- `execution_tracking.*` — Progress and performance monitoring
- `workflows.*` — Workflow design and optimization
- `agent_report.*` — Communication and reporting

### Per-Pack Scope Overrides

Each of the 16 new packs has a scope override in `agentContractService.ts` that restricts its permissions to the exact set defined in its manifest. This prevents permission overlap between similar packs.

## Workflow Guidance

Each pack includes structured guidance with:
- `guidance` — 1-2 sentence description of the workflow
- `steps` — 4-6 actionable steps
- `exampleTasks` — 2-3 concrete examples

Example from `pack.jose-workflow-design`:
```javascript
{
  guidance: 'Design orchestration workflows that decompose complex tasks into agent-specific subtasks with clear handoffs.',
  steps: ['Analyze task complexity', 'Identify agent capabilities', 'Design workflow steps', 'Define handoff points', 'Validate workflow'],
  exampleTasks: [
    'Design a multi-agent workflow for content production',
    'Plan the decomposition strategy for a complex feature',
    'Create a workflow template for recurring tasks'
  ]
}
```

## Integration Points

### Agent Contract System

All packs are validated against Jose's execution contract:
```typescript
[AGENTS.JOSE]: {
  role: 'orchestrator',
  allowedActionPrefixes: ['orchestration_', 'agent_report', 'research_review', 'remote_message_route', 'creative_package_review'],
  blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'purchase']
}
```

### Skill Pack Service

Packs are registered in `skillPackService.js` and loaded via `loadAgentSkillGuidance('jose')`. The guidance system returns:
- `activeSkills` — list of pack IDs
- `guidance` — structured guidance objects
- `recommendedSteps` — deduplicated step list (capped at 8)

### Jose Command Router

Jose uses his skill packs to understand capabilities when routing tasks. The `skillFocus` field provides a human-readable summary of all orchestration capabilities.

## Testing

- **Unit tests**: `src/test/joseSkillPacks.test.js` — validates manifest structure, permissions, and example tasks
- **Integration tests**: `src/test/joseSkillIntegration.test.js` — validates contract validation, guidance loading, and profile integration

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.js` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/jose/joseProfile.js` | Agent profile with skillPackIds |
| `src/agents/jose/josePermissions.js` | Agent permissions |
| `src/test/joseSkillPacks.test.js` | Unit tests |
| `src/test/joseSkillIntegration.test.js` | Integration tests |
