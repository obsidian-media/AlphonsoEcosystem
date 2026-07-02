# TODO

## Deferred — pre-existing Rust test failures (not fixed, not blocking)

Found via `cargo test` in `src-tauri/` on branch `fix/pre-existing-test-failures`.
Unrelated to the SSRF/workspace.rs/lib.rs fixes committed in d6d40af — pre-existing.

1. `runtime_manager::tests::all_tools_have_unique_ports` — `src-tauri/src/runtime_manager.rs:1418`
   Fails: expects 11 unique ports, found 13 (duplicates in the tool registry).

2. `runtime_manager::tests::autostart_prefs_defaults_ollama_only` — `src-tauri/src/runtime_manager.rs:1450`
   Fails: expects `Some(false)`, got `Some(true)`.

3. `workspace::tests::absolute_path_detected` — `src-tauri/src/workspace.rs:2073`
   Fails: `Path::new("/etc/passwd").is_absolute()` is `false` on Windows (no drive letter).
   Likely a Unix-assumption bug in the test itself, not the source it's testing.

Also open: `src/test/telegramConnectorProof.test.js` — 1 known JS test failure
(acknowledged by OpenCode's test-fix pass; `proveTelegramConnectorPath` was relocated
to `connectorOutbound.js`, test still mocks the old Tauri-invoke path).
