# Alphonso Startup Modes

## Frontend development

Use this when you only want the Vite frontend:

```powershell
npm.cmd run dev
```

This starts the local frontend dev server and is the right choice for UI-only work.

## Native desktop development

Use this when you want the full Tauri desktop runtime:

```powershell
npm.cmd run desktop:dev
```

This launches Alphonso as a desktop app through Tauri instead of the frontend-only server.

## Production-style verification

Use these for build and desktop proof:

```powershell
npm.cmd run verify:app
npm.cmd run verify:desktop
```

## Local Ollama runtime proof

Use this when you want to verify the live local assistant path:

```powershell
npm.cmd run verify:ollama
```

This checks the local Ollama HTTP API, picks an installed model, and runs one real generate round-trip.

## Preview

Use preview when you want a built frontend preview without the desktop runtime:

```powershell
npm.cmd run preview
```

## Rule of thumb

- `dev` = frontend only
- `desktop:dev` = native Tauri desktop runtime
- `preview` = built frontend preview
- `verify:desktop` = build and desktop proof check

## Windows desktop precondition

`verify:desktop` depends on the Tauri MSI bundler on Windows. On this machine it needs either:

- WiX 3.14 binaries already available locally, or
- outbound network access so Tauri can download `wix314-binaries.zip`

If neither is available, the MSI step will fail with a socket/download error. That is a hard precondition, not a product bug.
