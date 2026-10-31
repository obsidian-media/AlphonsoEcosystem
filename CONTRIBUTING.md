# Contributing to Alphonso

Thank you for your interest in contributing to Alphonso! This guide will help you get started.

## Required readiness tracking

Before beginning maintenance, security, dependency, release, agent-contract,
iOS, voice, or documentation work, read
[`docs/TRUTH_FIRST_EXECUTION_PLAN.md`](docs/TRUTH_FIRST_EXECUTION_PLAN.md) with
the [Ground Truth](docs/ALPHONSO_GROUND_TRUTH.md). Choose an unchecked task,
mark it in progress, and only check it off when its stated verification evidence
has been recorded.

## Development Setup

### Prerequisites
- **Node.js** 22 LTS (run `nvm use` to select the repository-pinned version)
- **Rust** 1.77.2+ (with `cargo`, `clippy`, `rustfmt`)
- **Ollama** running locally with a model (e.g., `ollama pull llama3.2:3b`)
- **Windows** (primary target platform; macOS and Linux build too)

### Getting Started

1. **Clone the repository**
   ```bash
    git clone https://github.com/obsidian-media/AlphonsoEcosystem.git
    cd AlphonsoEcosystem
    ```

2. **Install dependencies**
   ```bash
    npm ci
    ```

3. **Set up environment**
   ```bash
    cp .env.example .env
    # Optional, development runs only: an installed app never reads .env.
    # Users enter keys in Settings → Connectors (kept in the system keychain).
    ```

4. **Start development**
   ```bash
    npm run dev          # Vite dev server (port 5173)
    # OR
    npm run desktop:dev  # Full Tauri dev with Rust backend
    ```

5. **Run tests**
   ```bash
    npm run test         # Full Vitest suite (src)
    npm run lint         # ESLint
    npm run verify:app   # lint + typecheck + test + build
    ```

## Project Structure

```
src/                   React frontend (new UI work is .tsx; legacy .jsx remains)
  agents/              9 agent profiles and schemas (permissions: src/services/jose/agentPermissionTable.ts)
  components/          UI components and legacy feature workspaces
  services/            policy-gated services (exact count verified by npm run verify:docs)
    jose/              Jose's planner, step graphs, effects, requests
    contentFactory/    Miya Studio's content factory
  hooks/               21 custom hooks (useAppShellState, useAppEffects split into 9 concerns)
  lib/                 Utilities (ollama.ts, chatUtils.js, randomId.ts)
  test/                Vitest test files (exact count verified by npm run verify:docs)
src-tauri/             Rust backend
  src/lib.rs           ~938 lines; 189 Tauri commands across 50 modules (AGENTS.md lists them)
  src/utils.rs         Shared utilities
  src/kv_store.rs      SQLite-backed KV store
  src/ollama.rs        Ollama backend
  src/policy_gate.rs   Policy enforcement backend
scripts/               Build, release, auth scripts
e2e/                   Playwright E2E tests (web build, Tauri bridge mocked)
e2e-desktop/           Desktop E2E tests (real built app via tauri-driver)
gateway/               WhatsApp Cloud gateway, generic webhook gateway
docs/                  about 195 documentation files (index: docs/README.md)
```

## Development Workflow

### 1. Create a Branch
```bash
git checkout -b agent/<your-name>/<short-task-name>
# Example: agent/opencode/fix-connector-timeout
```

### 2. Make Changes
- Keep changes small and focused
- One task = one change
- Follow existing code style
- Add tests for new functionality

### 3. Test Your Changes
```bash
npm run test              # Unit tests
npm run lint              # Lint check
npm run verify:app        # Full verification
cargo check               # From src-tauri/
cargo clippy -- -D warnings  # Rust lint
```

### 4. Commit
```bash
git add <files>
git commit -m "type: description"
# Types: feat, fix, docs, ci, refactor, test, chore
```

### 5. Create a PR

**PR Checklist:**
- [ ] `npm run verify:app` passes (lint + typecheck + test + build)
- [ ] `npm run typecheck` — 0 TypeScript errors
- [ ] `npm run test` — full suite passes with no regressions
- [ ] New components are `.tsx` with exported prop interfaces
- [ ] New services have a test file in `src/test/`
- [ ] No `.env`, `.tauri-updater-key`, or secret files committed
- [ ] Coverage stays above the enforced floors (48% lines / 38% branches / 30% functions / 48% statements)
- [ ] A new service or component has a row in `CLAUDE.md`'s Do Not Duplicate table (`npm run verify:dnd-coverage`, `npm run verify:dnd-map`)
- [ ] Docs updated in the same PR (`npm run verify:docs`)

**Commit message format:** `feat(scope): description` / `fix(scope): description` / `docs(scope): description`

**TypeScript requirement:** All new React components must be `.tsx` with prop interfaces. No implicit `any`.

## Code Style

### JavaScript/JSX
- Use functional components with hooks
- Follow existing naming conventions
- No comments unless asked
- Use `src/services/` for business logic
- Use `src/components/` for UI

### Rust
- Follow existing patterns in `lib.rs`
- Use `cargo clippy -- -D warnings` (CI enforces zero warnings)
- Add `#[cfg(test)]` modules for unit tests
- Use `pub(crate)` for internal functions

## Testing

- **Unit tests**: `src/test/` (Vitest)
- **E2E tests**: `e2e/` (Playwright, web build with the Tauri bridge mocked)
- **Desktop E2E tests**: `e2e-desktop/` (WebdriverIO + tauri-driver against the real built app; `npm run test:e2e:desktop`). Use these for anything that depends on the Rust backend, the real window origin, spawned processes or stored data. They run on isolated test data, and in CI as `Desktop E2E (real Tauri binary)` on every PR (not a required check); prerequisites are listed at the top of `e2e-desktop/wdio.conf.mjs`.
- **Rust tests**: `src-tauri/src/` (cargo test)

Run tests before and after changes:
```bash
npm run test
cargo test --manifest-path src-tauri/Cargo.toml
```

## When the build fails

- **"Found version mismatched Tauri packages":** the `tauri` crate in `src-tauri/Cargo.lock` and the `@tauri-apps/api` / `@tauri-apps/cli` npm packages must share major.minor; bump whichever is behind (`npm run verify:tauri-versions` checks it).
- **`npm install` fails:** `npm cache clean --force`, then `npm install` (`.npmrc` already sets `legacy-peer-deps`).
- **`npm run tauri dev` fails:** check `rustc --version`, `rustup update`, `npx tauri --version`; on Windows, WebView2 must be installed.
- **The build runs out of memory:** `NODE_OPTIONS="--max-old-space-size=4096" npm run build`.
- **Tests:** `npm run test`, or one file with `npx vitest run src/test/<file>`; Rust from `src-tauri/` with `cargo test` and `cargo clippy -- -D warnings`.
- **ComfyUI in plain-browser dev mode** (`npm run dev`): the window calls ComfyUI directly, so start ComfyUI with `--enable-cors-header`. The desktop app goes through its backend and needs nothing.
- **Voice OS by hand:** in `voice/backend/`, `pip install -r requirements.txt`, set `VOICE_OS_TOKEN`, then `python -m uvicorn main:app --host 127.0.0.1 --port 8766 --no-access-log` (the app sets the token itself when it starts Voice OS).

## Important Rules

1. **Never commit secrets** — `.env`, `.tauri-updater-key` are in `.gitignore`
2. **Never fake readiness** — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE
3. **Check for duplicates** — 285 services exist; check `CLAUDE.md`'s Do Not Duplicate table before creating a second version
4. **Follow the ground truth** — `docs/ALPHONSO_GROUND_TRUTH.md` is the source of truth
5. **Run CI checks** — all tests must pass before merging

## Getting Help

- Read `docs/ALPHONSO_GROUND_TRUTH.md` for verified project facts
- Read `CLAUDE.md` for development commands and architecture
- Read `ARCHITECTURE.md` for system design
- Check `docs/CONNECTORS.md` for connector setup

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
