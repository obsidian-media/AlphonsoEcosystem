# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Alphonso, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: [security contact email]

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to understand and address the issue.

## Security Measures

### What We Do

- **Fail-closed policy enforcement** — all outbound connector calls go through `policyEnforcementService.js`; missing credentials = blocked, not allowed
- **Content Security Policy** — configured in `tauri.conf.json` with explicit allowed domains
- **Minimal Tauri capabilities** — only `core:default`, `notification:default`, `global-shortcut:default`
- **Secrets excluded from git** — `.env`, `.tauri-updater-key` in `.gitignore`, never committed
- **Sanitized `.env.example`** — all values use placeholders, no real credentials
- **CI security scanning** — `npm audit` and `cargo audit` in CI pipeline
- **Dependency monitoring** — Dependabot configured for npm, Cargo, and GitHub Actions

### What You Should Do

- **Keep secrets safe** — never commit `.env` or API keys
- **Use zero-cost mode** — if you don't need paid connectors, keep them disabled
- **Review connector permissions** — each connector requires explicit credentials
- **Update dependencies** — run `npm update` and `cargo update` regularly
- **Report issues** — if you find a vulnerability, report it responsibly

## Connector Security

All 9 connectors (Telegram, WhatsApp, YouTube, Claude, ChatGPT, Notion, ClickUp, SD WebUI, ComfyUI) are:

- **Policy-gated** — every call goes through `policyEnforcementService.js`
- **Credential-dependent** — fail-closed on missing credentials
- **Approval-gated** — high-risk actions require user approval
- **Audit-logged** — all calls recorded in `connectorAuditLogService.js`

## Data Privacy

- **Local-first** — all data stored locally in SQLite
- **No telemetry by default** — workflow telemetry is opt-in
- **No cloud sync** — data stays on your machine
- **Memory controls** — you can clear memory and conversation history

## Known Limitations

- **Desktop only** — currently Windows-only; no web deployment
- **Local Ollama required** — AI features require local Ollama installation
- **No encryption at rest** — SQLite database is not encrypted
- **No code signing** — Windows installer is not code-signed (yet)

## Version Support

| Version | Supported |
|---------|-----------|
| 0.1.0   | Yes       |
| < 0.1.0 | No        |

## Security Updates

Security updates will be released as patch versions and announced in:
- GitHub Releases
- `docs/CHANGELOG.md`
