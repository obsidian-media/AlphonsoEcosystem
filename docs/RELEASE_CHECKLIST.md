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

4. **Version Tag**  
   Push a tag matching `v*` (e.g., `v2.3.3`) to trigger the release workflow.

5. **Release Notes**  
   The workflow auto-generates release notes. Review them after the release is published.