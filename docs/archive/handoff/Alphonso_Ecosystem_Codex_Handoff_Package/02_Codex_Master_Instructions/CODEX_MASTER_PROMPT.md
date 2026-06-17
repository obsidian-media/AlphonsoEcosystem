# Codex Master Prompt — Alphonso Ecosystem

You are working inside the existing Alphonso repo.

## Project stack
- React frontend
- Tauri v2 desktop app
- Rust backend
- Ollama local runtime
- Tailwind
- Framer Motion
- Local-first architecture
- NO Electron

## Strict rules
- Do not use Electron.
- Do not fake build output.
- Do not fake telemetry.
- Do not fake runtime status.
- Do not rewrite unrelated systems.
- Do not break the current Tauri build.
- Do not claim success without running npm run build and npx tauri build.

## Current mission
Finish the mature UI implementation and integrate the three-agent ecosystem foundation:
```text
Alphonso = Operator
Miya     = Creator
Jose     = Orchestrator
```

## Implementation priority
1. Finish current UI foundation cleanly.
2. Add Jose as the third core agent if safe.
3. Keep current build working.
4. Run verification.
5. Report real results.

## Required build commands
```bash
npm run build
npx tauri build
```

## Expected installer path
```text
src-tauri/target/release/bundle/nsis/Alphonso_0.1.0_x64-setup.exe
```
