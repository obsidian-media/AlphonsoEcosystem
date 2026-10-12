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
   The `Tauri Desktop Build` jobs run only on pushes to `main` and on tags, never on PRs. Check the latest CI run on `main` before tagging. A `tauri*` crate bump that leaves `@tauri-apps/api` / `@tauri-apps/cli` on an older minor passes every PR check and then fails these jobs ("Found version mismatched Tauri packages").

6. **Version In All Four Places**  
   `package.json` (and `package-lock.json`), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `app` entry in `src-tauri/Cargo.lock` must all carry the new version. The installer filename and the updater's version comparison come from the Tauri-side values.

7. **Version Tag**  
   Push a tag matching `v*` (e.g., `v2.3.3`) to trigger the release workflow.

8. **Release Notes**  
   The workflow auto-generates release notes. Review them after the release is published.