# Release Checklist

Before tagging a release, verify the following:

1. **Signing Keys**  
   Ensure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set in GitHub → Settings → Secrets → Actions.  
   These are required for Tauri to sign the updater artifacts.

2. **Updater Manifest**  
   The release workflow automatically generates `latest.json` and uploads it to the GitHub release.  
   Verify the "Validate updater manifest" step passes in the release run.

3. **Build & Tests**  
   Run `npm run verify:app` (lint + test + build) locally before pushing a tag.  
   Also run `cargo test` and `cargo clippy -- -D warnings` in `src-tauri/`.

4. **Desktop End-to-End Suite**  
   `npm run tauri build -- --debug --no-bundle`, then `npm run test:e2e:desktop` (prerequisites at the top of `e2e-desktop/wdio.conf.mjs`). This is the only suite that exercises the real app; the Playwright suite mocks the backend. Run it with Ollama available, and with ComfyUI running if image generation changed.

5. **`main` Is Green, Including the Desktop Builds**  
   The `Tauri Desktop Build` jobs (Windows, macOS, Linux) run only on pushes to `main`, on tags and on manual runs, never on PRs. Check the latest CI run on `main` before tagging. Since 2026-10-21 PRs also run `npm run verify:tauri-versions`, so a `tauri*` crate bump that leaves `@tauri-apps/api` / `@tauri-apps/cli` on an older minor now fails on the PR ("Found version mismatched Tauri packages"). A manual `release.yml` run with `publish` off builds and checks all three installers without releasing anything; use it before tagging.

6. **Version In All Four Places**  
   `package.json` (and `package-lock.json`), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `app` entry in `src-tauri/Cargo.lock` must all carry the new version. The installer filename and the updater's version comparison come from the Tauri-side values.

7. **macOS signing (optional)**  
   With `APPLE_CERTIFICATE` and the other `APPLE_*` secrets set (`docs/MACOS_SIGNING.md`), the Mac build is signed and notarized; without them it ships unsigned and the release notes say how to open it the first time.

8. **Version Tag**  
   Push a tag matching `v*` (e.g., `v2.10.0`) to trigger the release workflow.

9. **Release Notes**  
   The workflow auto-generates release notes (including whether the Mac build is notarized). Review them after the release is published, and check auto-update from the previous release on a real install.