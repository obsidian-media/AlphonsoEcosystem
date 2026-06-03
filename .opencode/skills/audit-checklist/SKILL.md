---
name: audit-checklist
description: Full project audit checklist — inspect every layer of Alphonso and classify completeness
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: audit
  scope: full-project
---

## What I Do

I walk through every layer of the Alphonso codebase and classify each file as COMPLETE, PARTIAL, PLACEHOLDER, or FAKE. I produce a structured audit report with evidence.

## When To Use Me

Use this when:
- Starting a fresh audit after significant changes
- Preparing for a version promotion (v0.1.0 → v1.0.0)
- Onboarding a new agent that needs to understand the codebase
- After a major refactor to verify nothing was lost

## Audit Checklist

### Phase 1: Agent System
- [ ] Count agent files in `src/agents/` — should be 9
- [ ] Verify each agent has: profile, permissions, (schema if applicable)
- [ ] Check `agentRegistry.js` imports all 9
- [ ] Check `agentContractService.js` enforces contracts

### Phase 2: Service Layer
- [ ] Count service files in `src/services/` — should be 89+
- [ ] For each service, read first 50 lines to classify:
  - Has real logic → COMPLETE
  - Has comments but no implementation → PLACEHOLDER
  - Returns hardcoded values → FAKE
- [ ] Check `policyEnforcementService.js` is fail-closed
- [ ] Check `connectorRegistryService.js` routes through policy gate

### Phase 3: Frontend
- [ ] Count components in `src/components/` — should be 76+
- [ ] Verify major components render real UI (not empty divs)
- [ ] Check `App.jsx` lazy loading works (18 views)
- [ ] Check `main.jsx` has ToastProvider, BootBoundary

### Phase 4: Rust Backend
- [ ] Count lines in `lib.rs` — should be ~7,078
- [ ] Count registered Tauri commands — should be 63
- [ ] Sample 5 commands — verify real implementations
- [ ] Check extracted modules: kv_store.rs, whatsapp_webhook.rs, native_proof.rs, runway.rs
- [ ] Run `cargo check` and `cargo clippy -- -D warnings`

### Phase 5: Tests
- [ ] Count test files in `src/test/` — should be 47+
- [ ] Count `it()`/`test()` blocks — should be 180+
- [ ] Verify all tests pass: `npm run test`
- [ ] Check coverage: `npm run test:coverage`

### Phase 6: Infrastructure
- [ ] Check `.github/workflows/ci.yml` — what does it run?
- [ ] Check `.github/workflows/verify-app.yml` — is it redundant?
- [ ] Check `scripts/` — count and sample 3 for real implementations
- [ ] Check `e2e/smoke.spec.js` — exists and is real
- [ ] Check `gateway/whatsapp-cloud/` — deployed or setup-required?

### Phase 7: Security
- [ ] Check `.env` not in git history
- [ ] Check CSP in `tauri.conf.json`
- [ ] Check Tauri capabilities are minimal
- [ ] Check `.gitignore` excludes secrets
- [ ] Check `.env.example` is sanitized

### Phase 8: Documentation
- [ ] Count docs in `docs/` — should be 46+
- [ ] Check CLAUDE.md numbers match reality
- [ ] Check ARCHITECTURE.md is current
- [ ] Check CHANGELOG.md is maintained

## Output Format

```markdown
# Audit Report — [DATE]

## Summary
- Total files inspected: X
- COMPLETE: X | PARTIAL: X | PLACEHOLDER: X | FAKE: X

## Per-Layer Results
### Agent System
[table]

### Service Layer
[table]

### Frontend
[table]

### Rust Backend
[table]

### Tests
[table]

### Infrastructure
[table]

### Security
[table]

### Documentation
[table]

## Top 5 Risks
1. ...

## Top 5 Strengths
1. ...

## Recommendation
[SHIP / BLOCK / CONDITIONAL]
```
