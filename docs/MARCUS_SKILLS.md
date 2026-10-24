# Marcus Agent — Skill Packs

**Version**: 2.10.0 (on `main`; the pack lists were last changed on the date below)
**Last Updated**: 2026-07-19
**Total Skill Packs**: 16 (15 owned by Marcus + 1 shared). Security audit and risk detection were removed 2026-10-23: security is Sentinel's, risk review Maria's.

## Overview

Marcus is the **Distribution & Release Manager** — responsible for release readiness, deployment execution and distribution workflows, after Maria (governance and risk) has reviewed the work. (Title corrected 2026-10-21; the governance and audit role is Maria's.) He is the only agent that may publish or send, always after approval, and the one scheduler for posts (YouTube, Instagram, Facebook). He has 15 skill packs of his own that cover the full release lifecycle: validation, execution, notification, and reporting.

## Skill Pack Inventory

### Existing Packs (4)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.workflow.executing-plans` | Executing Plans | Step-by-step execution with checkpoints |
| `pack.github.releases` | GitHub Releases | GitHub release creation |
| `pack.slack.notifications` | Slack Notifications | Slack team notifications |
| `pack.marcus-distribution-execution` | Distribution Execution | Core distribution workflow |

### Release Management Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.marcus-github-releases` | GitHub Releases | `distribution.github`, `approved_dispatch`, `engagement.track` | Create a GitHub release with changelog and build artifacts |
| `pack.marcus-changelog-generation` | Changelog Generation | `distribution.changelog`, `approved_dispatch`, `engagement.track` | Generate changelog from commit history for a release |
| `pack.marcus-version-management` | Version Management | `distribution.versioning`, `approved_dispatch`, `performance.track` | Manage semantic versioning for release candidates |
| `pack.marcus-release-readiness` | Release Readiness | `distribution.readiness`, `performance.check`, `approved_dispatch` | Run release readiness checklist before version promotion |

### Compliance Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.marcus-compliance-distribution` | Compliance Distribution | `distribution.compliance`, `performance.audit`, `approved_dispatch` | Verify license compliance before distributing packages |
| `pack.marcus-approval-gatekeeping` | Approval Gatekeeping | `distribution.gate`, `approved_dispatch`, `performance.verify` | Enforce approval gates before production deployment |

### Deployment Packs (3)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.marcus-deployment-execution` | Deployment Execution | `distribution.deploy`, `approved_dispatch`, `performance.verify` | Execute staged deployment to production |
| `pack.marcus-rollback-execution` | Rollback Execution | `distribution.rollback`, `approved_dispatch`, `performance.verify` | Execute rollback to previous stable version |
| `pack.marcus-integration-validation` | Integration Validation | `distribution.validation`, `performance.integration`, `approved_dispatch` | Validate connector integrations before release |

### Notification & Reporting Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.marcus-slack-notifications` | Slack Notifications | `distribution.slack`, `engagement.notify`, `approved_dispatch` | Post release announcement to Slack with summary |
| `pack.marcus-notification-routing` | Notification Routing | `distribution.routing`, `engagement.notify`, `approved_dispatch` | Route release notifications to appropriate channels |
| `pack.marcus-release-reporting` | Release Reporting | `distribution.reporting`, `performance.report`, `approved_dispatch` | Generate post-release metrics report |
| `pack.marcus-team-communication` | Team Communication | `distribution.communication`, `engagement.notify`, `approved_dispatch` | Send release status updates to stakeholders |

### Asset Packs (1)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.marcus-asset-distribution` | Asset Distribution | `distribution.assets`, `approved_dispatch`, `performance.track` | Upload build artifacts to distribution channels |

## Permission Model

All Marcus skill pack permissions use the agent's allowed prefixes:

- `distribution.*` — Distribution and deployment actions
- `engagement.*` — Notification and tracking
- `performance.*` — Audit, verification, and reporting
- `approved_*` — Gated execution requiring explicit approval

## Testing

- **Unit tests**: `src/test/marcusSkillPacks.test.js`
- **Integration tests**: `src/test/marcusSkillIntegration.test.js`

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.ts` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/marcus/marcusProfile.js` | Agent profile with skillPackIds |
| `src/agents/marcus/marcusPermissions.js` | Agent permissions |

