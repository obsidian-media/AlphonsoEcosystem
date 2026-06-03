# Contributing to Alphonso

Thank you for your interest in contributing to Alphonso! This guide will help you get started.

## Development Setup

### Prerequisites
- **Node.js** 20+ 
- **Rust** 1.77+ (with `cargo`, `clippy`, `rustfmt`)
- **Ollama** running locally with a model (e.g., `ollama pull llama3.2:3b`)
- **Windows** (primary target platform)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/Thatisshayan/AlphonsoEcosystem.git
   cd local-agent-ui-v2
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
   npm run test         # All 180+ tests
   npm run lint         # ESLint
   npm run verify:app   # lint + test + build
   ```

## Project Structure

```
src/                   React frontend (.jsx)
  agents/              9 agent profiles, permissions, schemas
  components/          76+ UI components
  services/            89+ services (policy-gated)
  lib/                 Utilities (ollama.js, chatUtils.js)
  test/                47 test files (Vitest)
src-tauri/             Rust backend
  src/lib.rs           ~7,078 lines, 63 Tauri commands
scripts/               Build, release, auth scripts
e2e/                   Playwright E2E tests
gateway/               WhatsApp Cloud gateway
docs/                  Documentation
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
- Describe what you changed and why
- Reference any related issues
- Ensure CI passes

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
