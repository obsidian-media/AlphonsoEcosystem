# Workflow Execution States

Workflow run states currently used by `workflowExecutionService`:

- `queued`
- `in_progress`
- `approval_required`
- `setup_required`
- `executed`
- `partial`
- `failed`
- `blocked`
- `completed`

## State Meanings

- `queued`: Run is created and ready to process.
- `in_progress`: Jose is currently orchestrating stage execution.
- `approval_required`: Human checkpoint must be approved before continuing.
- `setup_required`: One or more required setup/configuration paths are missing.
- `executed`: A specific stage/action completed.
- `partial`: Run completed with blocked/setup-required stages.
- `failed`: Stage or run encountered a hard failure.
- `blocked`: Governance/policy blocked execution.
- `completed`: All planned stages executed in current foundation.

## Receipt Alignment

Workflow receipts are emitted with statuses:

- `approved`
- `denied`
- `blocked`
- `setup_required`
- `executed`
- `partial`
- `failed`
- `queued`
