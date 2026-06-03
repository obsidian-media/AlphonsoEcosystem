---
name: release-gate
description: Pre-release validation — check every criterion before version promotion
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: release
  scope: release-validation
---

## What I Do

I validate whether Alphonso is ready for version promotion. I check every criterion and produce a SHIP/BLOCK recommendation with evidence.

## When To Use Me

Use this when:
- About to cut a new release
- After merging a significant PR to main
- Before publishing a new version tag
- When asked "is this ready to ship?"

## Release Gate Criteria

### v0.1.0 Gate (Local Capable)

#### Build Pipeline
- [ ] `npm run lint` — zero errors
- [ ] `npm run test` — all tests pass
- [ ] `npm run build` — produces `dist/` output
- [ ] `cargo check` — Rust compiles
- [ ] `cargo clippy -- -D warnings` — zero warnings
- [ ] `cargo test` — all Rust tests pass

#### Security
- [ ] `.env` not in git history (`git log --follow -- .env` returns empty)
- [ ] CSP configured in `tauri.conf.json`
- [ ] `.gitignore` excludes `.env`, `.tauri-updater-key`, `dist/`, `coverage/`
- [ ] `.env.example` contains only placeholders
- [ ] No hardcoded secrets in `src/services/` or `src-tauri/src/`

#### Agent System
- [ ] 9 agents registered in `agentRegistry.js`
- [ ] `agentContractService.js` enforces contracts
- [ ] `policyEnforcementService.js` is fail-closed

#### Connectors
- [ ] All 9 connector paths traced through policy gate
- [ ] No PLACEHOLDER or FAKE connectors (except `externalAgentAdapter.js` which is intentionally local-only)

#### Documentation
- [ ] `docs/ALPHONSO_GROUND_TRUTH.md` exists and is current
- [ ] `CLAUDE.md` exists at project root
- [ ] `ARCHITECTURE.md` exists at project root

### v1.0.0 Gate (Publicly Installable) — ALL v0.1.0 criteria PLUS

#### Installer
- [ ] Signed NSIS installer built successfully
- [ ] Installer published to public download URL
- [ ] Download URL reachable and functional

#### Auto-Updater
- [ ] Updater manifest hosted at configured endpoint
- [ ] Manifest signed with production key
- [ ] `appUpdateService.js` can reach manifest

#### Gateway
- [ ] WhatsApp Cloud gateway deployed to Railway
- [ ] Gateway health endpoint responding
- [ ] Meta app verified and webhook configured

#### Testing
- [ ] Component test coverage above 15%
- [ ] Playwright E2E in CI pipeline
- [ ] E2E tests passing against deployed app

#### Infrastructure
- [ ] Branch protection on `main` requiring CI pass
- [ ] No redundant CI workflows
- [ ] Concurrency control on CI runs

#### Data Safety
- [ ] All localStorage keys migrated to SQLite
- [ ] Conversation history persisted to SQLite on every change
- [ ] Settings hydrated from SQLite on boot

#### User Experience
- [ ] First-launch onboarding flow exists
- [ ] Public README with install instructions
- [ ] Connector setup guides for all 9 connectors

## Output Format

```markdown
# Release Gate Report — [DATE]

## Target Version: [v0.1.0 / v1.0.0]

### Gate Results
| Criterion | Status | Evidence |
|-----------|--------|----------|

### Blockers
1. [What blocks release]

### Warnings
1. [Non-blocking issues]

### Recommendation: [SHIP / BLOCK / CONDITIONAL]
[Reasoning]
```
