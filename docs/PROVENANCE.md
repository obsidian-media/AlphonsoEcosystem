# Alphonso Provenance Trail

This checkout does not include `.git` metadata, so this file records the current local truth baseline for audits, handoffs, and release verification.

## Current Source Of Truth

- Product version: `0.1.0`
- Repo root: `C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2`
- Native app target: `src-tauri/target/release/app.exe`
- Current main JS chunk: `446.77 kB`
- Shell split status: `SettingsView` and `RightPanel` are lazy-loaded
- Updater base URL: `https://github.com/Thatisshayan/Alphonso/releases/download/v0.1.0`

## Verified Commands

- `npm.cmd run test`
- `npm.cmd run build`
- `npx.cmd tauri build`
- `npm.cmd run proof:rc0`
- `npm.cmd run verify:desktop`
- `npm.cmd run verify:ollama`
- `npm.cmd run updater:verify`

## Verified Artifacts

- `release/rc0/proof/01_process_started.json`
- `release/rc0/proof/02_env_detected.json`
- `release/rc0/proof/03_tauri_started.json`
- `release/rc0/proof/04_frontend_loaded.json`
- `release/rc0/proof/05_native_proof_engine_started.json`
- `release/rc0/proof/06_workspace_validated.json`
- `release/rc0/proof/07_scan_started.json`
- `release/rc0/proof/08_scan_completed.json`
- `release/rc0/proof/09_packets_generated.json`
- `release/rc0/proof/10_rc0_package_written.json`
- `release/updater/windows-x86_64/latest.json`
- `release/updater/windows-x86_64/Alphonso_0.1.0_x64-setup.exe.sig`
- `docs/handoff/ALPHONSO_OLLAMA_RUNTIME_PROOF_2026-05-23.json`
- `docs/handoff/ALPHONSO_NATIVE_SELFDEV_PROOF_2026-05-23.md`
- `docs/handoff/ALPHONSO_SELFDEV_PACKETS_2026-05-23.json`
- `docs/handoff/ALPHONSO_PRODUCTION_READINESS_SNAPSHOT_2026-05-23.json`
- `docs/RELEASE_CANDIDATE_CHECKLIST.md`

## Notes

- Updater readiness is truthfully `setup_required` when the signing env vars or hosted release endpoint are missing.
- External connectors are truthfully `setup_required` until configured and verified.
- The RC0 proof path is native and artifact-backed.
- The current local app is thinner than earlier snapshots, but the remaining release gates are still real.
- `verify:desktop` is only reproducible on this Windows machine when WiX 3.14 binaries are present locally or outbound network access is allowed for the MSI bundler download.
