# Workflow Memory Model

Workflow memory is recorded through `workflowMemoryService` and persisted via `memoryService` durable model.

## Workflow Memory Record Shape

Workflow-linked memory entries include:

- `workflowId`
- `workflowRunId`
- source agent
- confidence
- verification state
- timestamp
- retention metadata
- privacy/governance metadata

## Memory Categories Used

Workflow linkage currently maps into timeline-style memory entries and may represent:

- workflow timeline events
- workflow artifacts
- workflow governance outcomes
- workflow receipt context

## Confidence / Verification

Memory records carry:

- `confidence` (verified/inferred/temporary/expired/unverified/user_confirmed)
- `verificationState` (verified/inferred/temporary/expired/unverified/failed/pending)

## Expiry / Retention

Workflow memory supports:

- optional `expiryRule`
- optional `expiresAt`
- retention metadata through governance fields in durable memory payload

## Retrieval

`listWorkflowMemory(workflowId, workflowRunId?)` returns workflow-linked records for detail views, receipts context, and timeline drill-down.
