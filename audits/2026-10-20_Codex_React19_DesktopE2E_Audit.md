# React 19 / Desktop E2E CI Audit

Date: 2026-10-20
Branch: `agent/Codex-priority-hardening`
Commit under test: `4c88b8d62313950100caf56d4463b4e32ecbe833`
Workflow: `39500638718`

## Evidence

- Standard Test & Build passed: unit tests, coverage, web build, and bundle-size checks.
- Rust Tests & Clippy passed.
- Secrets Scan, Doc Count Freshness, Cloud Voice & Gateway Tests, Gateway Health Check, iOS Companion Build Check, and Playwright E2E Smoke Test passed.
- The real Windows desktop E2E job failed before test execution in `Install EdgeDriver`.
- GitHub job step evidence identified the failed step as `Install EdgeDriver`; no desktop spec ran.

## Root cause and change

The workflow derived the compatible WebView2 `major.minor.build` version but used the full WebView2 patch version in the EdgeDriver download URL. The setup now resolves `https://msedgedriver.microsoft.com/LATEST_RELEASE_<major.minor.build>`, downloads that resolved release, and retains the existing executable version check against the first three components.

## Status

React 19 standard CI verification is green. Desktop E2E and the desktop-CI deferred item remain open pending a fresh run that proves EdgeDriver installation and real Tauri test execution. No branch-protection mutation was made.
