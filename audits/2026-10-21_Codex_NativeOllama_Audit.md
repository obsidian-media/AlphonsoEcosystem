# Native Ollama Verification Audit

> **Status (2026-10-25):** since then a model folder chosen in the Ollama desktop app is found, chat works with an Ollama you started (through the backend), and pulling a model goes through the backend (2026-10-21/22). Today: 2.10.0 on `main` (not tagged; latest release 2.9.0), 9 agents, 33 connectors, 285 services, 546 test files / 6,777 tests, 189 Tauri commands, 50 Rust modules; current facts are in `docs/ALPHONSO_GROUND_TRUTH.md`.

Date: 2026-10-21
Agent: Codex
Branch: `agent/Codex-priority-hardening`
Scope: native desktop Ollama readiness and Voice OS follow-up

## Evidence

- `Get-Command ollama` found the installed client at
  `D:\AgentDevWork\Apps\Ollama\ollama.exe`.
- No managed Voice OS virtual environment was found at the runtime-manager
  location `%APPDATA%\\Alphonso\\runtimes\\voice-os\\venv\\Scripts\\python.exe`.
- Running `ollama list` did not produce model inventory. The client reported
  access denied while opening/rotating files under
  `C:\Users\AgentDev\AppData\Local\Ollama\` and then timed out waiting for
  the server to start.

## Assessment

The repository implementation and CI coverage remain verified, but native
Ollama model-call acceptance is not proven on this machine. The immediate
runtime blocker is local Ollama log-directory access, not an application test
failure. Voice OS live-start acceptance is separately untestable until the
managed virtual environment and declared dependencies are installed.

## Required follow-up

An owner must repair the local Ollama installation's log-file permissions (or
run it under a writable profile), start the server with an approved model, and
rerun the desktop/native Ollama acceptance flow. The owner must also provision
the managed Voice OS environment before claiming live Voice OS readiness.
No paid API, credential, permission mutation, or service restart was performed
by this audit.

## Repository gate follow-up

After this audit was pushed, governance workflow `39558985306` completed
successfully for commit `72974b3`. The green gate validates the synchronized
audit/deferred documentation change; it does not change the native runtime
acceptance assessment above.
