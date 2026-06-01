# Testing & CI Report

**Date:** 2026-05-31
**Project:** Alphonso — local-agent-ui-v2 (Tauri v2 / React / Vite)

---

## 1. Test Run Results

> **Note:** The shell execution environment (PowerShell / Bash) was denied permission during
> this session. `npm run test` could not be executed automatically. Results below reflect
> what is _statically known_ from reading the project sources.

| Item | Status |
|---|---|
| Test runner | Vitest (programmatic via `scripts/run-vitest-programmatic.mjs`) |
| Test environment | jsdom |
| Setup file | `src/test/setupTests.js` |
| Pass count | _not yet run — see "Next Steps"_ |
| Fail count | _not yet run — see "Next Steps"_ |
| Failing test names | _not yet run — see "Next Steps"_ |

To obtain live results, run from the project root:

```powershell
cd "C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2"
npm run test
```

---

## 2. Cargo / Rust Availability

> Shell execution was denied; `cargo --version` could not be run automatically.

To verify manually:

```powershell
cargo --version
```

If Rust is not installed, download and run the rustup installer from https://rustup.rs and then
install the MSVC target:

```powershell
rustup target add x86_64-pc-windows-msvc
```

---

## 3. Changes Made to `.github/workflows/ci.yml`

A new job `rust-quality` was inserted **before** the existing `desktop` job. The `desktop` job's
`needs` list was updated from `[test]` to `[test, rust-quality]`.

### New job — `rust-quality`

```yaml
rust-quality:
  name: Rust Tests & Clippy
  runs-on: windows-latest
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
      with:
        targets: x86_64-pc-windows-msvc
        components: clippy
    - name: Rust cache
      uses: swatinem/rust-cache@v2
      with:
        workspaces: src-tauri -> target
    - name: Cargo tests
      run: cargo test --manifest-path src-tauri/Cargo.toml
    - name: Clippy (deny warnings)
      run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

### Updated `desktop` job dependency

```yaml
desktop:
  needs: [test, rust-quality]
```

**Effect:** The Tauri desktop build will now only proceed when both the JS/TS unit tests _and_
the Rust test + lint checks pass.

---

## 4. Coverage Threshold Configured

Because no separate `vitest.config.ts` / `vitest.config.js` exists, the coverage block was
added to the existing `test` section in **`vite.config.js`**:

```js
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setupTests.js',
  globals: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov', 'html'],
    thresholds: {
      lines: 30
    }
  }
}
```

A new npm script was also added to **`package.json`**:

```json
"test:coverage": "npx vitest run --coverage src"
```

Run coverage locally with:

```powershell
npm run test:coverage
```

If `@vitest/coverage-v8` is not yet installed, add it first:

```powershell
npm install --save-dev @vitest/coverage-v8
```

---

## 5. Next Recommended Steps

1. **Grant shell permissions** so that `npm run test` and `cargo --version` can be executed
   automatically in future sessions, and populate the actual pass/fail counts in this report.

2. **Install coverage provider** if not already present:
   ```powershell
   npm install --save-dev @vitest/coverage-v8
   ```
   Then run `npm run test:coverage` and confirm the 30% lines threshold is met.

3. **Raise the threshold** incrementally as test coverage improves. Recommended milestones:
   - 30% lines (current) — unblocking baseline
   - 50% lines — meaningful coverage
   - 70% lines — healthy coverage for a production app

4. **Add `rust-quality` to local pre-push hooks** (e.g., via `husky`) so Clippy errors are
   caught before CI, not after.

5. **Verify Clippy passes today** against the existing Rust source:
   ```powershell
   cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
   ```
   Fix any warnings before merging to `main`.

6. **Consider adding `cargo audit`** to the `rust-quality` job to detect known Rust
   dependency vulnerabilities.
