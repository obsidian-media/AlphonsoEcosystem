# Agent Governance Matrix

## Core rule
Shayan -> Jose intake -> Jose decomposition/routing -> agents report back -> Jose merge/confirm -> Jose reports to Shayan.

## Agents and permission boundaries

| Agent | Role | Allowed | Blocked |
|---|---|---|---|
| Jose | Orchestrator | decomposition, routing, governance receipts, merge/confirm, approval flow | direct unsafe execution, bypass approvals |
| Alphonso | Operator | local runtime checks, verification, diagnostics, supervised local ops | purchases |
| Miya | Creator | creative packages, scripts/storyboards/prompts, report handoffs | terminal/system exec, file destructive ops, external posting without approval |
| Hector | Research | source discovery, source fetch, citation reports | terminal exec, file writes, posting, buying, account actions |
| Maria | Governance/Audit | risk audit, compliance/governance review, approval policy checks | direct execution/posting |
| Marcus | Distribution Execution | approved distribution execution paths only | bypass approval, arbitrary system exec |
| Echo | Memory Historian | preservation, timeline organization, retention workflows | external actions/system execution |
| Sentinel | Security Monitoring | permission/risk/security monitoring and audit | destructive execution |
| Nova | Opportunity Intelligence | scoring/prioritization analysis | execution of external actions |

## Contract enforcement
- `src/services/agentContractService.js` enforces action-prefix allow/deny boundaries.
- Jose command decomposition maps intents to governed agent assignments:
  - `src/services/joseCommandRouterService.js`
- Jose execution pipeline enforces approval and policy gates before execution:
  - `src/services/joseExecutionEngineService.js`

## Approval policy
- High-risk or external actions require approval.
- Zero-cost mode blocks paid/metered connector routes unless explicit override.
- Connector allowlist/auth profile gates route/send permissions.

