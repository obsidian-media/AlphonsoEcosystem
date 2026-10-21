# React 19 CI Failure and Correction Audit

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Failed run: [39498405745](https://github.com/obsidian-media/AlphonsoEcosystem/actions/runs/39498405745)

## Evidence

- Install, npm audit, lint, and typecheck passed.
- Unit tests executed 410 files and 5,614 tests; all tests passed, but Vitest
  reported one unhandled render error and exited with code 1.
- The error was `getAgentWorkflowParticipation(...).map is not a function` in
  `WorkflowOperationsDashboard.tsx`.
- The real `workflowGovernanceService.ts` contract returns
  `AgentWorkflowParticipation[]`; the focused test mock returned `{}`.

## Correction

`src/test/components/WorkflowOperationsDashboard.test.tsx` now mocks the
governance function with `[]`, matching the production return contract. This is
the smallest aligned correction; production code was not weakened to accept an
invalid test double.

## Required verification

Dispatch a full CI rerun for the corrected commit and require Test & Build,
coverage, web build, Playwright, and desktop jobs to reach terminal success
before marking the React 19 migration verified.
