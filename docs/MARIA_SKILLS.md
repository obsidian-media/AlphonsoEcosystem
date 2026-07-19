# Maria Agent — Skill Packs

**Version**: 2.6.0
**Last Updated**: 2026-07-17
**Total Skill Packs**: 18 (2 existing + 16 new)

## Overview

Maria is the **Governance Auditor** — responsible for requirements analysis, risk classification, compliance auditing, and approval governance. She is "born with" 18 specialized skill packs that cover the full spectrum of governance: requirements, risk, compliance, evidence, trust, and incident response.

## Skill Pack Inventory

### Existing Packs (2)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.maria-audit-governance` | Audit Governance | Workflow audit, risk classification, claim verification |
| `pack.maria-trust-verification` | Trust Verification | Trust validation, receipt validation, evidence review |

### Requirements & Planning Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-requirements-analysis` | Requirements Analysis | `workflow.audit.requirements`, `workflow.audit.analysis`, `workflow.audit.organize` | Analyze project requirements and identify gaps |
| `pack.maria-risk-classification` | Risk Classification | `risk.classify`, `risk.assess`, `risk.categorize` | Classify project risks by severity and likelihood |

### Compliance & Governance Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-compliance-auditing` | Compliance Auditing | `workflow.audit.compliance`, `workflow.audit.verify`, `workflow.audit.enforce` | Audit compliance with security policies |
| `pack.maria-approval-workflow` | Approval Workflow | `approval.workflow`, `approval.gate`, `approval.track` | Design approval workflows for high-risk actions |
| `pack.maria-policy-enforcement` | Policy Enforcement | `policy.enforce`, `policy.audit`, `policy.verify` | Enforce organizational policies across workflows |

### Evidence & Trust Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-evidence-collection` | Evidence Collection | `evidence.collect`, `evidence.verify`, `evidence.document` | Collect evidence for audit findings |
| `pack.maria-claim-verification` | Claim Verification | `claim.verify`, `claim.validate`, `claim.audit` | Verify claims made by agents or users |
| `pack.maria-trust-audit` | Trust Audit | `trust.audit`, `trust.verify`, `trust.validate` | Audit trust levels across system components |

### Audit & State Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-audit-trail` | Audit Trail | `receipt.audit`, `receipt.track`, `receipt.verify` | Maintain audit trail for critical actions |
| `pack.maria-state-verification` | State Verification | `state.verify`, `state.audit`, `state.validate` | Verify system state consistency |

### Content & Brand Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-brand-safety` | Brand Safety | `workflow.audit.brand`, `workflow.audit.safety`, `workflow.audit.compliance` | Ensure brand consistency in all outputs |
| `pack.maria-content-moderation` | Content Moderation | `workflow.audit.content`, `workflow.audit.moderate`, `workflow.audit.review` | Moderate content for policy compliance |
| `pack.maria-quality-assurance` | Quality Assurance | `workflow.audit.quality`, `workflow.audit.assurance`, `workflow.audit.verify` | Ensure quality standards in deliverables |

### Documentation & Reporting Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-documentation-review` | Documentation Review | `workflow.audit.documentation`, `workflow.audit.review`, `workflow.audit.approve` | Review documentation for accuracy |
| `pack.maria-stakeholder-reporting` | Stakeholder Reporting | `agent_report.stakeholder`, `agent_report.status`, `agent_report.progress` | Generate governance status reports |

### Incident Response Packs (1)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.maria-incident-response` | Incident Response | `workflow.audit.incident`, `workflow.audit.response`, `workflow.audit.resolve` | Respond to governance incidents |

## Permission Model

All Maria skill pack permissions use the agent's allowed prefixes:

- `workflow.audit.*` — Workflow auditing and compliance
- `risk.*` — Risk assessment and classification
- `claim.*` — Claim verification and validation
- `approval.*` — Approval workflow management
- `trust.*` — Trust level auditing
- `receipt.*` — Audit trail management
- `evidence.*` — Evidence collection and verification
- `state.*` — State verification
- `agent_report.*` — Stakeholder reporting

### Per-Pack Scope Overrides

Each of the 16 new packs has a scope override in `agentContractService.ts` that restricts its permissions to the exact set defined in its manifest.

## Workflow Guidance

Each pack includes structured guidance with:
- `guidance` — 1-2 sentence description of the workflow
- `steps` — 4-6 actionable steps
- `exampleTasks` — 2-3 concrete examples

## Integration Points

### Agent Contract System

All packs are validated against Maria's execution contract:
```typescript
[AGENTS.MARIA]: {
  role: 'governance_audit',
  allowedActionPrefixes: ['governance_', 'audit_', 'approval_', 'policy_', 'agent_report'],
  blockedActionPrefixes: ['execute_command', 'filesystem_write', 'external_publish', 'upload', 'post', 'purchase']
}
```

## Testing

- **Unit tests**: `src/test/mariaSkillPacks.test.js`
- **Integration tests**: `src/test/mariaSkillIntegration.test.js`

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.js` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/maria/mariaProfile.js` | Agent profile with skillPackIds |
| `src/agents/maria/mariaPermissions.js` | Agent permissions |
| `src/test/mariaSkillPacks.test.js` | Unit tests |
| `src/test/mariaSkillIntegration.test.js` | Integration tests |
