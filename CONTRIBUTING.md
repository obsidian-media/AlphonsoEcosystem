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
- **Rust** 1.77+ (with `cargo`, `clippy`, `rustfmt`)
- **Ollama** running locally with a model (e.g., `ollama pull llama3.2:3b`)
- **Windows** (primary target platform)

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
    # Edit .env with your API keys (optional — app works in zero-cost mode)
    ```

4. **Start development**
   ```bash
    npm run dev          # Vite dev server (port 5173)
    # OR
    npm run desktop:dev  # Full Tauri dev with Rust backend
    ```

5. **Run tests**
   ```bash
    npm run test         # Full Vitest suite
    npm run lint         # ESLint
    npm run verify:app   # lint + typecheck + test + build
    ```

## Project Structure

```
src/                   React frontend (new UI work is .tsx; legacy .jsx remains)
  agents/              9 agent profiles, permissions, schemas
  components/          UI components and legacy feature workspaces
  services/            policy-gated services (exact count verified by npm run verify:docs)
  hooks/               14 custom hooks (useAppShellState, useAppEffects split into 6)
  lib/                 Utilities (ollama.js, chatUtils.js)
  test/                Vitest test files (exact count verified by npm run verify:docs)
src-tauri/             Rust backend
  src/lib.rs           ~1,455 lines, 76 Tauri commands (across 16 modules)
  src/utils.rs         Shared utilities
  src/kv_store.rs      SQLite-backed KV store
  src/ollama.rs        Ollama backend
  src/policy_gate.rs   Policy enforcement backend
scripts/               Build, release, auth scripts
e2e/                   Playwright E2E tests
gateway/               WhatsApp Cloud gateway
docs/                  120+ documentation files
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
- [ ] Coverage has not dropped below 35%

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
- **E2E tests**: `e2e/` (Playwright)
- **Rust tests**: `src-tauri/src/` (cargo test)

Run tests before and after changes:
```bash
npm run test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Important Rules

1. **Never commit secrets** — `.env`, `.tauri-updater-key` are in `.gitignore`
2. **Never fake readiness** — use truth labels: COMPLETE / PARTIAL / PLACEHOLDER / FAKE
3. **Check for duplicates** — 89+ services exist; don't create a second version
4. **Follow the ground truth** — `docs/ALPHONSO_GROUND_TRUTH.md` is the source of truth
5. **Run CI checks** — all tests must pass before merging

## Getting Help

- Read `docs/ALPHONSO_GROUND_TRUTH.md` for verified project facts
- Read `CLAUDE.md` for development commands and architecture
- Read `ARCHITECTURE.md` for system design
- Check `docs/CONNECTORS.md` for connector setup

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
