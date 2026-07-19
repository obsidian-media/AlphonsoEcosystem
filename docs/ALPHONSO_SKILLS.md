# Alphonso Agent — Skill Packs

**Version**: 2.6.0
**Last Updated**: 2026-07-17
**Total Skill Packs**: 18 (2 existing + 16 new)

## Overview

Alphonso is the **Local Operator & Coder** agent — the only agent with filesystem and execution privileges. He is "born with" 18 specialized skill packs that cover the full spectrum of software development: coding, verification, operations, and integration.

## Skill Pack Inventory

### Existing Packs (2)

| Pack ID | Name | Purpose |
|---------|------|---------|
| `pack.codex-professional-coding` | OpenAI Codex Professional Coding | Code review, plan-before-code, test-verified |
| `pack.alphonso-runtime-operations` | Runtime Operations | Runtime read/manage, verification before completion |

### Core Coding Packs (6)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.coding.full-stack` | Full-Stack Coding | `code.write`, `code.edit`, `code.refactor`, `runtime.test` | Add a new Tauri command and corresponding React component |
| `pack.coding.tdd` | Test-Driven Development | `code.test.first`, `code.test.verify`, `code.refactor.minimal` | Write tests for the new connector service, then implement |
| `pack.alphonso-typescript-mastery` | TypeScript Mastery | `code.typescript.strict`, `code.typescript.types`, `code.typescript.refactor` | Convert a .js service to .ts with strict typing |
| `pack.alphonso-rust-operations` | Rust Operations | `code.rust.tauri`, `code.rust.async`, `code.rust.error_handling` | Add a new Tauri command for connector dispatch |
| `pack.alphonso-react-patterns` | React Patterns | `code.react.hooks`, `code.react.components`, `code.react.performance` | Optimize a React component with useMemo and virtualization |
| `pack.alphonso-python-voice` | Python Voice Systems | `code.python.fastapi`, `code.python.testing`, `code.python.async` | Add a new endpoint to the voice backend |

### Verification & Quality Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.alphonso-code-review` | Code Review | `code.review`, `code.suggest`, `code.validate`, `code.security.scan` | Review a pull request for code quality and security |
| `pack.alphonso-build-verification` | Build Verification | `verification.build`, `verification.test`, `verification.lint`, `verification.typecheck` | Run full build verification before release |
| `pack.alphonso-refactoring` | Refactoring | `code.refactor`, `code.simplify`, `code.optimize`, `code.extract` | Extract duplicate logic into shared utilities |
| `pack.debugging.root-cause` | Root-Cause Debugging | `runtime.debug.observe`, `runtime.debug.hypothesize`, `runtime.debug.test`, `runtime.debug.verify` | Diagnose why a connector fails intermittently |

### Operations Packs (4)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.alphonso-runtime-diagnostics` | Runtime Diagnostics | `runtime.monitor`, `runtime.diagnose`, `runtime.profile`, `runtime.optimize` | Profile memory usage during long-running sessions |
| `pack.alphonso-security-audit` | Security Audit | `verification.security.scan`, `verification.security.review`, `verification.security.harden`, `verification.secrets.check` | Scan for hardcoded secrets before commit |
| `pack.github.integration` | GitHub Integration | `runtime.github.search`, `runtime.github.issue`, `runtime.github.pr`, `runtime.github.repo` | Search GitHub for similar authentication patterns |
| `pack.alphonso-performance-optimization` | Performance Optimization | `runtime.perf.profile`, `runtime.perf.benchmark`, `runtime.perf.memory`, `runtime.perf.bundle` | Analyze bundle size and suggest optimizations |

### Extended Packs (2)

| Pack ID | Name | Permissions | Example Tasks |
|---------|------|-------------|---------------|
| `pack.alphonso-api-integration` | API Integration | `code.api.rest`, `code.api.graphql`, `code.api.testing`, `code.api.docs` | Add a new REST connector with proper error handling |
| `pack.alphonso-error-handling` | Error Handling | `code.error.boundary`, `code.error.logging`, `code.error.recovery`, `code.error.monitoring` | Add error boundaries to the Settings view |

## Permission Model

All Alphonso skill pack permissions use the agent's allowed prefixes:

- `code.*` — Code operations (write, edit, refactor, language-specific)
- `runtime.*` — Runtime operations (monitor, diagnose, profile, debug)
- `verification_*` — Verification operations (build, test, lint, security)

### Per-Pack Scope Overrides

Each of the 16 new packs has a scope override in `agentContractService.ts` that restricts its permissions to the exact set defined in its manifest. This prevents permission overlap between similar packs (e.g., `coding.full-stack` vs `typescript.mastery`).

## Workflow Guidance

Each pack includes structured guidance with:
- `guidance` — 1-2 sentence description of the workflow
- `steps` — 4-6 actionable steps
- `exampleTasks` — 2-3 concrete examples

Example from `pack.coding.tdd`:
```javascript
{
  guidance: 'Write tests first, implement minimally to pass, then refactor. Never skip the red-green-refactor cycle.',
  steps: ['Write failing test', 'Implement minimally', 'Verify test passes', 'Refactor', 'Repeat'],
  exampleTasks: [
    'Write tests for the new connector service, then implement',
    'Add failing tests for edge cases before fixing a bug',
    'Create test suite for a new utility function'
  ]
}
```

## Integration Points

### Agent Contract System

All packs are validated against Alphonso's execution contract:
```typescript
[AGENTS.ALPHONSO]: {
  role: 'operator',
  allowedActionPrefixes: ['local_operation', 'verification_', 'runtime_', 'orchestration_', 'agent_report', 'execute_command', 'filesystem_'],
  blockedActionPrefixes: ['purchase']
}
```

### Skill Pack Service

Packs are registered in `skillPackService.js` and loaded via `loadAgentSkillGuidance('alphonso')`. The guidance system returns:
- `activeSkills` — list of pack IDs
- `guidance` — structured guidance objects
- `recommendedSteps` — deduplicated step list (capped at 8)

### Jose Command Router

Jose uses Alphonso's skill packs to understand capabilities when routing tasks. The `skillFocus` field provides a human-readable summary.

## Testing

- **Unit tests**: `src/test/alphonsoSkillPacks.test.js` — validates manifest structure, permissions, and example tasks
- **Integration tests**: `src/test/alphonsoSkillIntegration.test.js` — validates contract validation, guidance loading, and profile integration

## Related Files

| File | Purpose |
|------|---------|
| `src/services/skillPackService.js` | Pack definitions and workflow guidance |
| `src/services/agentContractService.ts` | Scope overrides and contract validation |
| `src/agents/alphonso/alphonsoProfile.js` | Agent profile with skillPackIds |
| `src/agents/alphonso/alphonsoPermissions.js` | Agent permissions |
| `src/test/alphonsoSkillPacks.test.js` | Unit tests |
| `src/test/alphonsoSkillIntegration.test.js` | Integration tests |
