# Workflow Agent Matrix

## Core Agent Participation

- Jose: orchestrator — answers or plans every request as steps, routes, reports
- Alphonso: local operator execution/verification/packaging (the only agent that runs code or changes project files)
- Miya: creative strategy/script/storyboard/creative packaging, Miya Studio's content factory
- Hector: research/citations/source scan (research-only boundary)
- Maria: governance, risk and quality review
- Marcus: distribution — the only agent that publishes or sends, after approval
- Echo: memory historian and archival
- Sentinel: security and automation safety checks
- Nova: scoring, analysis, prioritization

## Contract Enforcement Source

Agent workflow action boundaries are one table, `src/services/jose/agentPermissionTable.ts` (task types and effects per agent), checked by Jose's plan check (`src/services/jose/stepGraph.ts`) before anything runs and by `src/services/agentContractService.ts` on each packet. Approval is by effect (`src/services/jose/joseEffects.ts`): spending, publishing or sending, and deleting always ask.

Since Jose redesign phase 6a, an agent-chain workflow (`workflowRegistryService.ts`'s `runWorkflow()`) runs as a Jose request: one step per agent, each needing the one before ("Steps set by a workflow.").

## Workflow Capability/Restriction Summary

- Hector, Maria, Echo, Sentinel and Nova only read and write their own work.
- Miya cannot run commands or publish; her paid media steps may spend, and always ask.
- Jose orchestrates; he may spend only on a paid-model step, which always asks.
- Marcus publishes or sends only after approval.
- Alphonso runs code and changes project files, asking per command according to Settings.
