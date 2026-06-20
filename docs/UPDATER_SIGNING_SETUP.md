# Updater Signing Setup

This guide prepares Alphonso for a truth-labeled signed updater release. It does not store private keys in the repo and it does not claim release success until the installer, signature, and manifest all exist.

## 1. Generate the signing key

Use the local updater setup helper:

```powershell
npm.cmd run updater:setup
```

This wraps the Tauri signer flow and writes the generated keypair into the local `.tauri` workspace folder.

If you need the underlying command directly, the helper uses the Tauri signer generator command under the hood.

## 2. Store the private key safely

Keep the private signing key outside the repository or reference it through a secure environment variable.

Safe options:

- A file path outside the repo that is only readable by your user account
- A secure secret manager or shell session environment variable

Do not commit the private key.
Do not copy it into source files.
Do not paste the raw key into chat.

## 3. Set the required environment variables

Set these values in the shell that runs the release build:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="C:\Users\Shaya\OneDrive\Desktop\ALPHONSO\FILES\local-agent-ui-v2\.tauri\alphonso-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="YOUR_KEY_PASSWORD"
$env:ALPHONSO_UPDATE_BASE_URL="https://github.com/Thatisshayan/Alphonso/releases/download/v0.1.0"
```

If your workflow stores the private key inline rather than by path, keep it private and never print it in logs.

## 4. Build the signed release

After the environment variables are present:

```powershell
npm.cmd run release:updater
```

This should produce:

- the installer bundle
- the matching `.sig`
- `release/updater/windows-x86_64/latest.json`

## 5. Verify readiness

You can inspect the updater readiness snapshot with:

```powershell
npm.cmd run updater:verify
```

The verifier checks:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `ALPHONSO_UPDATE_BASE_URL`
- the installer bundle
- the `.sig`
- `latest.json`
- updater pubkey wiring in `src-tauri/tauri.conf.json`

## 6. Publish artifacts

When the release is ready, publish the installer bundle, its `.sig`, and `latest.json` to the hosted update endpoint.

Do not mark the app as updater-ready until the hosted manifest and signature are actually reachable.

## 7. App updater configuration

Make sure the app points at the same update base URL and updater public key used to sign the release.

The UI should only show:

- present
- missing
- invalid
- setup_required

It should never expose the private key value.

## 8. What remains setup_required

Until the signing env vars are present and the hosted release artifacts exist, updater status remains `setup_required`.
