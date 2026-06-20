# Workflow Agent Matrix

## Core Agent Participation

- Jose: orchestrator, routing, merge/confirm, governance coordination
- Alphonso: local operator execution/verification/packaging
- Miya: creative strategy/script/storyboard/creative packaging
- Hector: research/citations/source scan (research-only boundary)
- Maria: governance/audit/risk/approval review
- Marcus: approved distribution/execution paths
- Echo: memory historian and archival
- Sentinel: security and automation safety checks
- Nova: scoring, analysis, prioritization

## Contract Enforcement Source

Agent workflow action boundaries are enforced via:

- `src/services/agentContractService.js`

This defines allowed and blocked action prefixes per agent and is checked before packet execution paths.

## Workflow Capability/Restriction Summary

- Hector cannot execute terminal/filesystem/posting/purchase actions.
- Miya cannot execute system commands or unapproved publishing.
- Jose orchestrates and cannot bypass high-risk execution restrictions.
- Marcus executes distribution only under approved paths.
- Maria and Sentinel govern risk/safety and do not perform destructive execution.
