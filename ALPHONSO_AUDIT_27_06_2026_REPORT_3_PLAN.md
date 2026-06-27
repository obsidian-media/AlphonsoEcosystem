# ALPHONSO ECOSYSTEM — IMPROVEMENT & ROADMAP PLAN

**Plan Date:** 2026-06-27
**Target Version:** v2.5.0 (production-confident release)
**Current Version:** v2.4.4
**Author:** Kimi Work Agent (based on comprehensive audit + comparison analysis)
**Previous Sprint Reference:** `AlphonsoJuneComplitionSprint.md` (6 phases, 21 items)

---

## EXECUTIVE SUMMARY

This plan translates the v2.4.4 audit findings into a structured, time-boxed roadmap. The goal is to move Alphonso from **AMBER-GREEN** to **FULL GREEN** by v2.5.0. The plan is organized into four horizons: **Emergency (24h)**, **Sprint (2 weeks)**, **Quarter (3 months)**, and **Roadmap (6-12 months)**. Each item has a clear owner, success criteria, and risk mitigation.

**Critical path:** Fix the command injection (P0-06) → Harden `lib.rs` review process → Close remaining P1 gaps → Hit 50% coverage → Wire iOS companion → Complete regulatory compliance.

---

## 1. HORIZON 1 — EMERGENCY (24-48 Hours)

These items block production confidence and must be addressed before any release tag.

### E-01: Patch Command Injection in `save_image_to_folder`

| Field | Detail |
|-------|--------|
| **Issue** | P0-06: `lib.rs:1537` uses `printf '%s' '{}' | base64 -d > '{}'` with user-controlled `path_str` |
| **Severity** | **CRITICAL** — Arbitrary command execution on Linux/macOS |
| **Root Cause** | Shell command constructed with user input; single quote in filename breaks quoting |
| **Fix** | Replace shell command with pure Rust: decode base64 in-memory using `base64::decode` (or `base64` crate), then write bytes using `std::fs::write`. Never shell out for this operation. |
| **File** | `src-tauri/src/lib.rs` |
| **Lines** | ~1537 |
| **Estimated Effort** | 30 minutes |
| **Verification** | Unit test with filename containing `'`, `;`, `\``, `$(whoami)`, and valid base64 data |
| **Risk if skipped** | Remote code execution on any Linux/macOS user who receives a malicious image |

**Suggested patch:**
```rust
// BEFORE (vulnerable)
let cmd = format!("printf '%s' '{}' | base64 -d > '{}'", raw, path_str);

// AFTER (safe)
use base64::Engine;
let decoded = base64::engine::general_purpose::STANDARD.decode(raw)?;
std::fs::write(&path_str, decoded)?;
```

---

### E-02: Add `allowed_program()` Validation to `launch_comfyui`

| Field | Detail |
|-------|--------|
| **Issue** | P1-15: `python_exe` is passed directly to `Command::new()` without validation |
| **Severity** | **HIGH** — Bypasses supervised command policy |
| **Fix** | Call `allowed_program(&python_exe)` before `Command::new(&python_exe)`; reject if not in allowlist |
| **File** | `src-tauri/src/lib.rs` |
| **Estimated Effort** | 15 minutes |
| **Verification** | Unit test with invalid `python_exe` path; expect `Err` |

---

### E-03: Add `lib.rs` Change Review Gate

| Field | Detail |
|-------|--------|
| **Issue** | Two critical/high findings introduced in the same file across one sprint |
| **Root Cause** | No mandatory security review for `lib.rs` changes |
| **Fix** | Add a `REVIEWERS.md` or `CODEOWNERS` rule: `src-tauri/src/lib.rs` requires 2 approvals, one of which must be a security-focused review |
| **Estimated Effort** | 15 minutes |
| **Verification** | GitHub branch protection settings + CODEOWNERS file committed |

---

## 2. HORIZON 2 — SPRINT (2 Weeks)

These items close the remaining P1 gaps and complete the v2.5.0 readiness checklist.

### S-01: Complete Connector Credential KV Migration (Close P1-05)

| Field | Detail |
|-------|--------|
| **Issue** | 7 `localStorage.setItem` writes remain in connector services |
| **Files** | `connectorAuth.js:40,131`, `connectorRegistry.js:247,305,311,318`, `connectorCircuitBreakerService.js:12` |
| **Fix** | Migrate all 7 writes to `durableSet` / KV store. Provide a one-time migration script that reads localStorage and writes to KV on next app boot. |
| **Estimated Effort** | 4 hours |
| **Verification** | `grep -r "localStorage.setItem" src/services/connectors/` returns 0 results |
| **Risk** | Data loss if migration fails; must be backward-compatible |

**Migration script pattern:**
```javascript
// In app initialization
if (localStorage.getItem('legacy_connector_auth')) {
  const data = JSON.parse(localStorage.getItem('legacy_connector_auth'));
  await durableSet('connector_auth', data);
  localStorage.removeItem('legacy_connector_auth');
}
```

---

### S-02: Migrate Plugin Signing Keys to KV Store (Close P2-14)

| Field | Detail |
|-------|--------|
| **Issue** | `pluginSigningService.js` still reads from `localStorage.getItem(TRUSTED_KEYS_KEY)` as fallback |
| **Fix** | Remove localStorage fallback. Read exclusively from KV store. Add migration for existing keys. |
| **Estimated Effort** | 2 hours |
| **Verification** | No `localStorage` references in `pluginSigningService.js` |

---

### S-03: Raise Coverage Threshold to 50% (Close P1-12)

| Field | Detail |
|-------|--------|
| **Issue** | `vitest.config.js` sets 38% threshold; CI passes at 38%; target is 50% |
| **Fix** | 1. Raise `vitest.config.js` thresholds to 50%. 2. Run `npm run test:coverage`. 3. Identify lowest-coverage files from report. 4. Add targeted tests to those files until threshold met. |
| **File** | `vitest.config.js:18-23` |
| **Estimated Effort** | 8-12 hours (depends on current actual coverage) |
| **Verification** | `npm run test:coverage` passes with 50% on all four metrics |
| **Lowest-coverage candidates** (inferred): `src/services/connectors/` (many connectors lack tests), `src/agents/` (agent profiles untested), `src-tauri/src/` (Rust tests are minimal beyond core modules) |

**Suggested coverage targets:**
| Layer | Current Tests | Target Tests | Priority |
|-------|---------------|--------------|----------|
| Connector services | 4 (deepseek) | 13 (one per connector) | High |
| Agent profiles | 1 (contract) | 9 (one per agent) | Medium |
| iOS companion bridge | 0 | 3 (auth, pairing, command) | Medium |
| Offline chat service | 0 | 5 (save, get, sync, clear, retry) | Medium |
| Policy DSL | 0 | 4 (rule evaluation, edge cases) | Low |

---

### S-04: Wire iOS Companion Router (Close P1-16)

| Field | Detail |
|-------|--------|
| **Issue** | `companion_router.rs` returns hardcoded empty JSON for all methods |
| **Fix** | Wire each router method to the corresponding Tauri command or service: `agent_list` → `listAgentProfiles()`, `agent_run` → `joseExecutionEngineService.execute()`, `chat_send` → `ChatView.sendMessage()`, etc. |
| **File** | `src-tauri/src/companion_router.rs` |
| **Estimated Effort** | 6-8 hours |
| **Verification** | iOS companion E2E test: pair → list agents → send chat → receive response |
| **Risk** | Complex threading between WebSocket and Tauri command dispatch; requires async coordination |

---

### S-05: Add Bridge Authentication (Close P2-16)

| Field | Detail |
|-------|--------|
| **Issue** | `bridge/server.js` has no application-level auth; relies solely on 127.0.0.1 binding |
| **Fix** | Add a simple Bearer token middleware: read `ALPHONSO_BRIDGE_SECRET` from env; require `Authorization: Bearer <token>` header; if env is unset, restrict to localhost (current behavior). |
| **File** | `bridge/server.js` |
| **Estimated Effort** | 1 hour |
| **Verification** | Test: request without token → 401; request with token → 200 |
| **Risk** | Breaks existing integrations (Cursor, Windsurf, Claude Desktop) that call the bridge without auth; must update integration docs |

---

### S-06: Add Echo File Watcher Debounce (Close P2-07)

| Field | Detail |
|-------|--------|
| **Issue** | `echoFileWatcherService.js` polls every 30s but processes files in a loop without debounce |
| **Fix** | Add a 500ms debounce using `setTimeout` or `lodash.debounce`. Coalesce rapid file events into a single batch process. |
| **File** | `src/services/echoFileWatcherService.js` |
| **Estimated Effort** | 1 hour |
| **Verification** | Test: create 10 files rapidly → verify only one batch process runs |

---

### S-07: Enable Multi-Agent E2E in CI (Close P3-05)

| Field | Detail |
|-------|--------|
| **Issue** | `e2e/multiagent.spec.js` exists but is skipped in CI with `test.skip(!!process.env.CI, ...)` |
| **Fix** | 1. Remove the `test.skip` guard. 2. Ensure the test runs reliably in CI (may need mock Tauri or headless setup). 3. Add required system deps to CI workflow. |
| **File** | `e2e/multiagent.spec.js`, `.github/workflows/ci.yml` |
| **Estimated Effort** | 2-4 hours |
| **Verification** | CI run shows `multiagent.spec.js` passing |
| **Risk** | Multi-agent tests may be flaky due to timing; may need retries or mocks |

---

### S-08: Fix Documentation Drift

| Field | Detail |
|-------|--------|
| **Issue** | `CONTRIBUTING.md` says "1,983+ tests" (actual: 2,151); `GROUND_TRUTH.md` header says v2.4.3 (actual: v2.4.4) |
| **Fix** | Update both files. Add a `scripts/verify-docs.js` check that asserts test counts and version strings match `package.json` and `Cargo.toml`. |
| **Estimated Effort** | 1 hour |
| **Verification** | `npm run verify:docs` passes with updated counts |

---

## 3. HORIZON 3 — QUARTER (3 Months)

These items build structural resilience and prepare for enterprise adoption.

### Q-01: Enable TypeScript Strict Mode

| Field | Detail |
|-------|--------|
| **Issue** | `tsconfig.json` does not have `strict: true` |
| **Fix** | 1. Add `"strict": true` to `tsconfig.json`. 2. Fix all resulting type errors (likely 50-200 across services). 3. Break into 3 PRs: (a) components, (b) services, (c) tests. |
| **Estimated Effort** | 16-24 hours |
| **Verification** | `npm run typecheck` passes with `strict: true` |
| **Value** | Eliminates an entire class of runtime errors; enables better refactoring |

---

### Q-02: Migrate Core Services to TypeScript

| Field | Detail |
|-------|--------|
| **Issue** | 144 of 162 services are JavaScript |
| **Priority Order** | 1. `policyEnforcementService` (already TS), 2. `agentContractService` (already TS), 3. `joseExecutionEngineService.js`, 4. `connectorRegistryService.js`, 5. `hectorResearchService.js`, 6. `agentBusService.js` |
| **Fix** | Migrate one service per week. Add interfaces for all data structures. Add unit tests during migration. |
| **Estimated Effort** | 40-60 hours (10-15 services) |
| **Verification** | Each migrated service has `service.ts` + `service.test.ts` with zero `@ts-ignore` |

---

### Q-03: Complete Cross-Border PIIA (Regulatory)

| Field | Detail |
|-------|--------|
| **Issue** | Alphonso sends data to DeepSeek (China), OpenAI (US), Railway (WhatsApp gateway — likely US/EU). No PIIA completed. |
| **Legal Basis** | PIPL Art. 55, GDPR Art. 35 |
| **Deliverable** | A 10-20 page PIIA document covering: data flows, recipient assessments, security measures, user rights, retention policies, breach procedures |
| **Estimated Effort** | 16-24 hours (legal review may add time) |
| **Verification** | PIIA document stored in `docs/compliance/PIIA-v2.5.0.md`; reviewed by legal counsel |
| **Risk** | Regulatory penalty for non-compliance; potential service shutdown in China if PIIA is missing |

---

### Q-04: Implement Incident Response Plan

| Field | Detail |
|-------|--------|
| **Issue** | No formal data breach reporting procedure; GDPR requires 72-hour notification |
| **Deliverable** | `docs/compliance/INCIDENT_RESPONSE.md` with: detection procedures, escalation matrix, notification templates (users, regulators, media), forensic preservation steps, post-incident review process |
| **Estimated Effort** | 8 hours |
| **Verification** | Tabletop exercise: simulate credential leak; team follows document end-to-end |

---

### Q-05: Add Opt-In Telemetry (Close P3-10)

| Field | Detail |
|-------|--------|
| **Issue** | No crash analytics or usage telemetry for production triage |
| **Fix** | Add Sentry or a self-hosted telemetry pipeline. Must be: (a) opt-in, (b) anonymized, (c) PII-scrubbed, (d) disableable. |
| **Estimated Effort** | 8-12 hours |
| **Verification** | Telemetry toggle in Settings; off by default; when on, crash reports sent with stack trace and version |
| **Regulatory Note** | Must be covered by PIIA and privacy policy before enabling |

---

### Q-06: Build Storybook / Visual Component Catalog (Close P2-01)

| Field | Detail |
|-------|--------|
| **Issue** | No visual component catalog; UI regression detection is manual |
| **Fix** | Add `@storybook/react` and `@storybook/vite`. Create stories for all 113 components. Add Chromatic or visual regression test. |
| **Estimated Effort** | 24-32 hours |
| **Verification** | `npm run storybook` launches; all components have at least one story; CI runs visual regression |
| **Value** | Prevents UI regressions; enables design system governance |

---

### Q-07: Harden Plugin Sandbox Isolation

| Field | Detail |
|-------|--------|
| **Issue** | `pluginSandboxService.js` runs plugins in the main thread without Web Worker or iframe isolation |
| **Fix** | Implement Web Worker sandbox for JS plugins. Use `iframe` with `sandbox` attribute for HTML plugins. Use `deno` or `quickjs` for Rust plugin runtime if needed. |
| **Estimated Effort** | 16-24 hours |
| **Verification** | Plugin cannot access `window`, `document`, or `localStorage`; cannot make network requests without policy approval |
| **Risk** | Breaking change for existing plugins; must be version-gated |

---

## 4. HORIZON 4 — ROADMAP (6-12 Months)

These are strategic initiatives that expand Alphonso's market position and technical maturity.

### R-01: Android Companion App

| Field | Detail |
|-------|--------|
| **Rationale** | iOS companion proves the architecture; Android is the next logical platform (70% mobile market share) |
| **Approach** | Kotlin + Jetpack Compose; reuse WebSocket + mDNS + PIN auth protocol from iOS |
| **Estimated Effort** | 80-120 hours |
| **Dependencies** | iOS companion must be production-stable first (router wired, battle-tested) |

---

### R-02: Enterprise Multi-Tenancy

| Field | Detail |
|-------|--------|
| **Rationale** | Enterprise customers require workspace isolation, RBAC, and audit trails |
| **Features** | Workspace-scoped agent profiles, role-based access control, SSO (SAML/OIDC), admin dashboard, audit log export |
| **Estimated Effort** | 200-300 hours |
| **Dependencies** | PIIA complete, incident response plan in place, coverage ≥ 70% |

---

### R-03: Self-Hosted Deployment Package

| Field | Detail |
|-------|--------|
| **Rationale** | Privacy-sensitive users want on-premise deployment without cloud dependencies |
| **Features** | Docker Compose package (Tauri + Bridge + MCP + Ollama + ChromaDB + WhatsApp gateway), Kubernetes Helm chart, offline installer |
| **Estimated Effort** | 120-160 hours |
| **Dependencies** | Bridge auth hardened, PIIA complete, plugin sandbox isolated |

---

### R-04: AI Agent Marketplace

| Field | Detail |
|-------|--------|
| **Rationale** | Third-party agent plugins create ecosystem network effects |
| **Features** | Signed plugin distribution, marketplace UI, revenue sharing, plugin verification pipeline, user reviews |
| **Estimated Effort** | 160-200 hours |
| **Dependencies** | Plugin sandbox fully isolated, signing key infrastructure hardened, legal terms for marketplace |

---

### R-05: Real-Time Collaboration (Multi-User Boardroom)

| Field | Detail |
|-------|--------|
| **Rationale** | Teams want to collaborate in Boardroom sessions simultaneously |
| **Features** | WebSocket-based real-time sync, operational transforms for agent state, presence indicators, conflict resolution |
| **Estimated Effort** | 120-160 hours |
| **Dependencies** | iOS companion router stable, Boardroom fully tested, coverage ≥ 60% |

---

## 5. RESOURCE ESTIMATES

### 5.1 Total Effort by Horizon

| Horizon | Items | Total Hours | FTE Weeks (40h) |
|---------|-------|-------------|-----------------|
| Emergency (24-48h) | 3 | 4 hours | 0.1 |
| Sprint (2 weeks) | 8 | 35-45 hours | 0.9-1.1 |
| Quarter (3 months) | 7 | 120-160 hours | 3.0-4.0 |
| Roadmap (6-12 months) | 5 | 680-940 hours | 17.0-23.5 |
| **TOTAL** | **23** | **840-1,149 hours** | **21.0-28.7 weeks** |

### 5.2 Team Composition Recommendation

| Role | FTE | Responsibilities |
|------|-----|------------------|
| Rust Security Engineer | 0.5 | `lib.rs` hardening, command review, sandboxing |
| Frontend TypeScript Engineer | 1.0 | TS strict mode, service migration, Storybook |
| QA / Test Engineer | 0.5 | Coverage to 50%, E2E stability, visual regression |
| Mobile Engineer (Swift/Kotlin) | 0.5 | iOS companion completion, Android port |
| DevOps / Platform Engineer | 0.3 | CI hardening, self-hosted package, Docker |
| Product / Compliance Lead | 0.3 | PIIA, incident response, documentation |
| **Total Team** | **2.6 FTE** | **For Sprint + Quarter horizons** |

---

## 6. RISK MITIGATION MATRIX

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| New critical vuln in `lib.rs` | High | Critical | CODEOWNERS + mandatory security review | Rust Security Engineer |
| Coverage target missed again | High | Medium | Make 50% hard CI gate; allocate dedicated QA time | QA Engineer |
| iOS companion delayed | Medium | High | Block v2.5.0 until router wired; daily standup on mobile | Mobile Engineer |
| PIIA delays v2.5.0 | Medium | High | Start PIIA immediately; hire external counsel if needed | Compliance Lead |
| TypeScript strict breaks build | Medium | Medium | Migrate in 3 phased PRs; feature-flag strict mode | Frontend Engineer |
| Documentation drift recurs | High | Low | `verify:docs` in CI; auto-generate counts from code | DevOps |
| Bus factor (single contributor) | High | Medium | Pair programming, decision records, knowledge docs | Team Lead |
| Plugin sandbox breaks compat | Medium | Medium | Version-gate sandbox; migration guide for plugin authors | Rust Security Engineer |

---

## 7. SUCCESS CRITERIA FOR v2.5.0

Alphonso v2.5.0 should be considered **production-confident** when ALL of the following are true:

### 7.1 Security Gates
- [ ] P0-06 command injection patched and unit-tested
- [ ] P1-15 `launch_comfyui` policy bypass patched
- [ ] All new `lib.rs` commands reviewed for injection/sandbox escapes
- [ ] Bridge has Bearer token auth or documented rationale for localhost-only
- [ ] `cargo audit` and `npm audit` pass with zero high/critical
- [ ] TruffleHog secrets scan passes with zero verified secrets

### 7.2 Quality Gates
- [ ] Test coverage threshold ≥ 50% enforced in CI (hard fail)
- [ ] TypeScript `strict: true` passes in CI
- [ ] All 113 components have Storybook stories (or documented exception)
- [ ] E2E tests run in CI without skip guards (including multi-agent)
- [ ] `npm run verify:app` passes clean (lint + typecheck + test + build)
- [ ] `cargo clippy -- -D warnings` passes clean

### 7.3 Feature Gates
- [ ] iOS companion router wired to Jose engine
- [ ] iOS companion E2E test passing (pair → chat → agent run)
- [ ] DeepSeek connector stable in production (no rate limit issues)
- [ ] Offline ChatView syncs reliably when connectivity returns
- [ ] Boardroom sessions stable for 5+ consecutive multi-agent runs

### 7.4 Compliance Gates
- [ ] Cross-border PIIA completed and reviewed
- [ ] Incident response plan documented and tabletop-tested
- [ ] Privacy policy updated to reflect v2.5.0 data flows
- [ ] Opt-in telemetry privacy impact assessed and documented

### 7.5 Documentation Gates
- [ ] All `.md` files versioned to v2.5.0 with accurate counts
- [ ] `README.md` reflects actual feature set
- [ ] `CHANGELOG.md` includes v2.5.0 release notes
- [ ] `CONTRIBUTING.md` has current test counts and setup instructions
- [ ] `GROUND_TRUTH.md` is authoritative and version-accurate

---

## 8. RECOMMENDED SPRINT STRUCTURE

### Sprint 1: Security & Stability (Weeks 1-2)
- E-01: Patch command injection
- E-02: Patch `launch_comfyui` bypass
- E-03: Add `lib.rs` review gate
- S-01: Complete credential KV migration
- S-02: Complete plugin signing KV migration
- S-08: Fix documentation drift

### Sprint 2: Coverage & Integration (Weeks 3-4)
- S-03: Raise coverage to 50%
- S-04: Wire iOS companion router
- S-05: Add bridge auth
- S-06: Echo file watcher debounce
- S-07: Enable multi-agent E2E in CI

### Sprint 3: TypeScript & Compliance (Weeks 5-8)
- Q-01: Enable strict mode (components)
- Q-02: Migrate top 5 services to TypeScript
- Q-03: Complete PIIA draft
- Q-04: Incident response plan

### Sprint 4: Polish & Scale (Weeks 9-12)
- Q-05: Opt-in telemetry
- Q-06: Storybook catalog
- Q-07: Plugin sandbox isolation
- Q-01: Enable strict mode (services + tests)
- Q-02: Migrate remaining high-priority services

---

## 9. CONCLUSION

Alphonso is 80% of the way to production-confident. The remaining 20% is the hardest: security hardening of the command execution surface, test coverage discipline, TypeScript strictness, and regulatory compliance. These are not "feature" problems — they are **process and discipline** problems.

The good news is that Alphonso has proven it can execute rapidly. The June sprints delivered TypeScript migration, iOS companion, DeepSeek, offline ChatView, and dozens of security fixes in under a week. If that same execution energy is directed at the v2.5.0 success criteria, the system can be production-confident within **4-6 weeks**.

The critical success factor is **slowing down `lib.rs` changes** until a security review process is in place. One critical vulnerability per sprint is not sustainable. The second critical success factor is **making coverage a hard gate** — not a target, not a goal, but a CI failure condition. Everything else (typing, docs, compliance) follows from those two disciplines.

**Alphonso has the architecture. It has the team velocity. It has the feature set. Now it needs the final layer of production discipline.**

---

*Plan generated: 2026-06-27*
*Based on: ALPHONSO_AUDIT_27_06_2026_REPORT_1.md + ALPHONSO_AUDIT_27_06_2026_REPORT_2_COMPARISON.md*
*Target release: v2.5.0 — Production-Confident*
