# React 19 Migration Preflight Audit

> **Status (2026-10-25):** React 19 is in use on `main`. Today: 2.10.0 on `main` (not tagged; latest release 2.9.0), 9 agents, 33 connectors, 285 services, 546 test files / 6,777 tests, 189 Tauri commands, 50 Rust modules; current facts are in `docs/ALPHONSO_GROUND_TRUTH.md`.

Date: 2026-10-20  
Branch: `agent/Codex-priority-hardening`  
Scope: coordinated React 19 runtime migration

## Evidence

- `package.json` and `package-lock.json` now align `react` and `react-dom` at
  `19.2.8`; `scheduler` is `0.27.0`.
- The application entry point already uses `ReactDOM.createRoot`.
- Static source inspection found no runtime `ReactDOM.render`, `findDOMNode`, or
  component `defaultProps` call sites under `src`.
- The local focused Vitest command is not valid evidence: Node 25.9.0 reports
  the missing module `@vitest/utils/dist/constants.js` from the incomplete
  local installation.

## Acceptance gate

CI must pass typecheck, lint, unit tests, production build, Playwright E2E,
desktop build checks, and documentation freshness after the coordinated bump.
The migration remains open until those results are green and any React 19
regression is addressed.
