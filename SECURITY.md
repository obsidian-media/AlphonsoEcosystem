# Security Policy

## Reporting a Vulnerability

Alphonso is closed-source (SHALAUDE v1.0 license) with a small maintainer
team. To report a suspected vulnerability:

1. **Do not open a public GitHub issue.** Email the maintainer directly (see
   the contact address in the repository owner's GitHub profile, or the
   in-app "About" panel) with a description, reproduction steps, and impact
   assessment if known.
2. You should receive an acknowledgment within **5 business days**.
3. We aim to ship a fix or mitigation within **30 days** for critical/high
   severity issues, and will keep you informed of progress in the interim.
4. Please give us a reasonable window to ship a fix before any public
   disclosure. We're happy to credit reporters in the fix's changelog entry
   (in `docs/CHANGELOG.md`) unless you prefer to stay anonymous.

## Automated scanning

- **CI secret scanning** (TruffleHog, `.github/workflows/ci.yml` `secrets-scan`
  job) runs `--only-verified` on every push and PR — it only fails on secrets
  TruffleHog can actively verify as live, not on pattern matches alone, to
  keep the signal-to-noise ratio usable. If this job goes red: treat it as a
  real leak until proven otherwise — do not silence it. Rotate the credential
  immediately, then purge it from git history (`git filter-repo` or BFG), then
  investigate whether it was ever committed in a public-facing (or wider-access)
  context. If investigation confirms a false positive (e.g. a test fixture with
  an intentionally fake-shaped token), scope an exclusion narrowly (a specific
  file/line, with a comment explaining why) — never disable the job wholesale.
- **`cargo audit`** and **`npm audit`** run in CI (`rust-quality` /
  `test-and-build` jobs) against known CVE advisories in dependencies.
- **CodeQL** runs static analysis across JS/TS, Rust, Python, Swift, and GitHub
  Actions workflows.

## Fix history

The tables below are a running log of specific hardening work completed —
kept for audit/history, not a checklist to re-verify from scratch.

# Alphonso Security Fixes — Batch 1

## Phase 1: Path Traversal & Policy Gate Hardening

| ID | Fix | File | Status |
|----|-----|------|--------|
| B1-P1-T1 | `.gitignore` excludes `scripts/certs/` | `.gitignore` | COMPLETE |
| B1-P1-T2 | `transcribe_audio_file` — canonicalize + parent-dir rejection | `workspace.rs` | COMPLETE |
| B1-P1-T3 | `save_image_to_folder` — parent-dir rejection for folder & filename | `lib.rs` | COMPLETE |
| B1-P1-T4 | Policy gate on 6 ungated connectors (DeepSeek, Perplexity, Tavily, n8n, GitHub, Slack) | `src/services/connectors/*.js/ts` | COMPLETE |
| B1-P1-T5 | Policy gate on ComfyUI video-history fetch | `connectorImageGenerators.js` | COMPLETE |
| B1-P1-T6 | OAuth state param + token redaction for YouTube, Meta, Outlook scripts | `scripts/auth-*.mjs` | COMPLETE |

## Phase 2: SSRF, Shell Interpreters, Inbox Hardening

| ID | Fix | File | Status |
|----|-----|------|--------|
| B1-P2-T1 | Removed `cmd.exe`, `pwsh`, `pwsh.exe`, `powershell`, `powershell.exe`, `dir`, `tasklist`, `del`, `copy`, `xcopy`, `robocopy`, `move`, `mkdir`, `rmdir`, `attrib` from `allowed_program()` | `policy_gate.rs` | COMPLETE |
| B1-P2-T2 | Added `is_private_ip()` — blocks RFC 1918 (10/8, 172.16/12, 192.168/16), link-local (169.254/16), loopback, carrier-grade NAT (100.64/10),benchmarking (198.18/15), IPv6 unique local (fc00::/7), IPv6 link-local (fe80::) — applied to `fetch_research_sources` | `search.rs` | COMPLETE |
| B1-P2-T3 | Added `canonicalize + starts_with(root_abs)` sandbox check to `read_workspace_file`, `delete_workspace_file`, `move_workspace_file` | `workspace.rs` | COMPLETE |
| B1-P2-T4 | Canonicalize inbox path + verify under workspace root in `watch_inbox_poll` and `mark_inbox_file_processed` | `workspace.rs` | COMPLETE |
| B1-P2-T5 | Redacted `/health` endpoint — returns `{ok: true, status: "ok"}` only | `gateway/whatsapp-cloud/src/server.js` | COMPLETE |

## Testing

### Rust Unit Tests
- `policy_gate.rs`: 3 tests (accept safe, reject dangerous, case-insensitive) — updated to verify shell interpreters are blocked
- `workspace.rs`: 6 tests (parent-dir detection, absolute path detection, safe relative paths, mixed components, root-dir detection)
- `search.rs`: 8 tests (localhost block, RFC 1918 block, link-local block, public allow, empty handling, case insensitivity, HTML strip, entity decode)

### Remaining (Batch 2+)
- Jest tests for policy-gate blocking on JS/TS connectors
- E2E SSRF verification test
- Symlink protection hardening (follow-symlink vs reject)
