# Alphonso Updater Release Pipeline (Tauri v2)

This project now includes a one-command updater release flow:

```powershell
npm.cmd run release:updater
```

It will:

1. Run app verification (`test + build`)
2. Build signed Tauri desktop artifacts
3. Collect NSIS installer + `.sig`
4. Generate static updater manifest JSON (`latest.json`)
5. Export files into:

```text
release/updater/windows-x86_64/
```

The project keeps `createUpdaterArtifacts` disabled during normal builds so `npx tauri build` works without signing keys.
`release:updater` temporarily enables updater artifacts just for the release run, then restores config.

## Required environment variables

Set these in your shell before running the command:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="C:\path\to\alphonso.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
$env:ALPHONSO_UPDATE_BASE_URL="https://releases.example.com/alphonso/windows"
```

Notes:

- `TAURI_SIGNING_PRIVATE_KEY` can be a key path or key content.
- `.env` is not used for updater signing by Tauri build.

## Generated files

After success:

- `Alphonso_0.1.0_x64-setup.exe`
- `Alphonso_0.1.0_x64-setup.exe.sig`
- `latest.json`

`latest.json` format is Tauri static-updater compatible and includes:

- `version`
- `pub_date`
- `notes`
- `platforms.windows-x86_64.url`
- `platforms.windows-x86_64.signature`

## Publish flow

1. Upload the exported installer and `.sig` to your release host.
2. Upload `latest.json` to the endpoint configured in Alphonso settings.
3. In the app, set:
   - Updater Endpoint
   - Updater Public Key
4. Keep Auto Update Checks enabled.

## Optional skip-build mode

If artifacts already exist and are signed:

```powershell
node scripts/release-updater.mjs --skip-build
```
