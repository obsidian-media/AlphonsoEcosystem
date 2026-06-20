# Workflow Operations Registry

This registry defines operational workflow families for Alphonso Ecosystem.

## Implemented Workflow Families

1. `wf-startup-product-development`
2. `wf-content-production`
3. `wf-marketing-operations`
4. `wf-social-media-management`
5. `wf-opportunity-discovery`
6. `wf-knowledge-preservation`
7. `wf-construction-operations`
8. `wf-automation-governance`
9. `wf-research-operations`
10. `wf-crisis-management-operations`
11. `wf-learning-skill-development`
12. `wf-ecosystem-learning-operations`
13. `wf-human-collaboration-operations`
14. `wf-financial-intelligence-operations`
15. `wf-reputation-brand-monitoring-operations`

Additional existing operational workflow:

- `wf-content-repurposing`

## Registry Fields

Each workflow record includes:

- `id`
- `name`
- `purpose`
- `triggerTypes`
- `agentSequence`
- `requiredApprovals`
- `riskLevel`
- `allowedActions`
- `blockedActions`
- `memoryBehavior`
- `receiptsGenerated`
- `connectorRequirements`
- `setupRequired`
- `finalReportFormat`
- `status`
- `trust`
- `verificationState`
- `createdAtMs`
- `updatedAtMs`

## Notes

- Registry definitions are merged/upgraded on load so prior saved rows are refreshed with latest structure.
- Execution does not claim external success when connectors are not configured; those branches emit setup-required/partial receipts.
