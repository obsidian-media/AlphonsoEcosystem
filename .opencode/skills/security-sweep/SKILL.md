---
name: security-sweep
description: Security review checklist — scan for secrets, CSP gaps, permission issues, and connector gating failures
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: security
  scope: full-project
---

## What I Do

I perform a systematic security sweep of the Alphonso codebase. I check for leaked secrets, CSP misconfigurations, permission escalation, fail-open behavior, and dependency vulnerabilities.

## When To Use Me

Use this when:
- Before any release
- After adding new connectors or API integrations
- When rotating credentials
- When responding to a security concern
- Periodically as a maintenance task

## Security Sweep Checklist

### 1. Secrets & Credentials

#### Git History
- [ ] `git log --follow -- .env` — should return empty
- [ ] `git log --follow -- .tauri-updater-key` — should return empty
- [ ] `git log --all --diff-filter=A -- "*.env"` — no env files ever committed

#### Current State
- [ ] `.env` exists on disk but is in `.gitignore`
- [ ] `.tauri-updater-key` in `.gitignore`
- [ ] `.tauri-updater-key.pub` — public key, safe to commit (verify it IS committed for updater)

#### Hardcoded Secrets
- [ ] Search `src/services/` for hardcoded API keys, tokens, passwords
- [ ] Search `src-tauri/src/` for hardcoded credentials
- [ ] Search `scripts/` for tokens written to files other than `.env`
- [ ] Search `gateway/` for embedded secrets

#### .env.example
- [ ] All values use `YOUR_*_HERE` or `REPLACE_WITH_*` placeholders
- [ ] No real phone numbers, tokens, or keys
- [ ] All required env vars documented

### 2. Content Security Policy

#### tauri.conf.json CSP
- [ ] `default-src` is `'self'`
- [ ] `connect-src` lists only required domains:
  - `http://localhost:*` (Ollama)
  - `https://api.anthropic.com` (Claude)
  - `https://api.openai.com` (ChatGPT)
  - `https://api.telegram.org` (Telegram)
  - `https://graph.facebook.com` (Meta)
  - `https://api.clickup.com` (ClickUp)
  - `https://api.notion.com` (Notion)
  - `https://www.googleapis.com` (YouTube)
- [ ] `script-src` — `unsafe-inline` acceptable for desktop, flag if web deployment planned
- [ ] No overly permissive directives (`*`, `data:` in script-src)

### 3. Tauri Capabilities

#### capabilities/default.json
- [ ] Only `core:default`, `notification:default`, `global-shortcut:default`
- [ ] No `shell:default` (would allow arbitrary command execution)
- [ ] No `fs:default` (would allow arbitrary file access)
- [ ] No `http:default` (HTTP is handled by Rust commands, not Tauri plugin)

### 4. Policy Enforcement

#### policyEnforcementService.js
- [ ] Fail-closed: blocks action when uncertain
- [ ] Zero-cost mode blocks all paid connectors unless overridden
- [ ] Approval mode requires explicit user approval for high-risk actions
- [ ] Connector risk classification present (high/medium/low)

#### Connector Gating
- [ ] Every connector send path calls `policyEnforcementService.evaluateAction()`
- [ ] Missing credentials → blocked (not crash, not fallback to success)
- [ ] High-risk actions require approval even when credentials present

### 5. Authentication Flows

#### OAuth Scripts
- [ ] `scripts/auth-youtube.mjs` — tokens written to `.env`, not logged
- [ ] `scripts/auth-meta.mjs` — tokens written to `.env`, not logged
- [ ] `scripts/auth-outlook.mjs` — tokens written to `.env`, not logged
- [ ] Local HTTP server for OAuth callback uses `localhost` only

#### Token Storage
- [ ] Tokens stored in `.env` (not localStorage, not SQLite, not logged)
- [ ] `.env` file permissions are restrictive (not world-readable)

### 6. Gateway Security

#### gateway/whatsapp-cloud/
- [ ] Rate limiting configured
- [ ] Body size capping before JSON parse
- [ ] HMAC signature verification on inbound webhooks
- [ ] Allowlist checking for phone numbers
- [ ] No sensitive data in logs (redaction in `security.js`)
- [ ] `/health` endpoint doesn't expose env var values

### 7. Dependency Security

#### package.json
- [ ] No known critical vulnerabilities (`npm audit`)
- [ ] Pinned versions are specific (not `*`)
- [ ] No unused dependencies

#### Cargo.toml
- [ ] All crates from known sources (crates.io)
- [ ] No suspicious or unknown dependencies
- [ ] `rusqlite` uses `bundled` feature (no system SQLite dependency)
- [ ] `reqwest` uses `rustls-tls` (no OpenSSL dependency)

### 8. File System

#### Path Traversal
- [ ] Rust commands that write files validate paths
- [ ] No user-controlled paths passed directly to `std::fs::write`
- [ ] Workspace root validation in `workspaceRootService.js`

#### Sensitive Files
- [ ] `.env` denied by default in `read` permission
- [ ] `.tauri-updater-key` denied by default
- [ ] `coverage/` and `dist/` excluded from git

## Output Format

```markdown
# Security Sweep Report — [DATE]

## Summary
- CRITICAL: X findings
- HIGH: X findings
- MEDIUM: X findings
- LOW: X findings
- INFO: X findings

## Findings

### CRITICAL
#### [Finding Title]
- **File**: [path:line]
- **Issue**: [what is wrong]
- **Risk**: [what could happen]
- **Fix**: [how to fix]

### HIGH
...

### MEDIUM
...

### LOW
...

### INFO
...

## Overall Security Posture
[Assessment]
```
