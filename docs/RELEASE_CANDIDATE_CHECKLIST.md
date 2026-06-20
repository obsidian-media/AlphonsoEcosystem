# Alphonso Release Candidate Checklist

This checklist reflects the current local truth of the Alphonso checkout.
It is intentionally conservative: `setup_required` is not treated as ready.

## Confirmed

- [x] Product version is aligned at `0.1.0`
- [x] Native RC0 proof completes end-to-end
- [x] RC0 proof artifacts exist from `01_process_started.json` through `10_rc0_package_written.json`
- [x] Tests pass
- [x] Build passes
- [x] Native Tauri build passes
- [x] Local Ollama runtime proof passes
- [x] WhatsApp Cloud gateway helper tests pass
- [x] SQLite memory store uses an explicit migration registry
- [x] Runtime ledger persists in SQLite
- [x] Provenance trail exists for the no-`.git` checkout
- [x] Main app shell is thinner after lazy-loading `SettingsView` and `RightPanel`
- [x] Main JS chunk is down to `446.77 kB`

## Confirmed But Still External

- [ ] Hosted updater publication is verified in the live GitHub release flow
- [ ] External connectors are live-verified with real provider credentials
- [ ] Live webhook endpoints are hosted and exercised end-to-end

## Setup Required

- [ ] Updater signing env vars are available in the local environment
- [ ] Hosted updater manifest proof is present for the current release path
- [ ] Any connector that needs external credentials has been configured and verified
- [ ] Windows desktop MSI bundling preconditions are present on this machine

## Current Hard Preconditions

- `verify:desktop` on this machine needs either:
  - WiX 3.14 binaries available locally, or
  - outbound network access so Tauri can download `wix314-binaries.zip`

## Safe Release Readiness Summary

- Installable: yes
- Test-passing: yes
- Tauri-building: yes
- Native-selfdev-proven: yes
- Updater-ready: setup_required until signing + hosted manifest are present
- Connector-ready: setup_required until live provider proof exists
- Production-ready: partial, not yet 100%
- Local-first truth baseline: current and provenance-backed
