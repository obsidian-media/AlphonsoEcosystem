# iOS Companion — Setup Guide

## What You Need

| Item | Where to get it |
|------|-----------------|
| Apple Developer Account | [developer.apple.com](https://developer.apple.com) ($99/year) |
| App Store Connect API Key | App Store Connect → Users → Keys → Generate |
| Certificate (.p12) | Xcode → Accounts → Manage Certificates → Export |
| Provisioning Profile | Xcode → Accounts → Download Manual Profiles |

## GitHub Secrets to Add

Go to your repo → **Settings → Secrets and variables → Actions** → New repository secret

| Secret Name | Value | How to get it |
|-------------|-------|---------------|
| `IOS_DEVELOPMENT_TEAM` | Your Apple Team ID (e.g. `ABC123DEF4`) | developer.apple.com → Account → Membership |
| `IOS_CERTIFICATE` | Base64 of your `.p12` file | See below |
| `IOS_CERTIFICATE_PASSWORD` | Password you set when exporting | — |
| `IOS_CERTIFICATE_NAME` | `Apple Development` or `Apple Distribution` | Xcode → Manage Certificates |
| `IOS_PROVISION_PROFILE` | Base64 of `.mobileprovision` | Xcode → Accounts → Download Manual Profiles |

### Optional (for TestFlight auto-upload):

| Secret Name | Value |
|-------------|-------|
| `APP_STORE_CONNECT_API_KEY` | Contents of the `.p8` key file |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID from App Store Connect |
| `APP_STORE_CONNECT_API_ISSUER` | Issuer ID from App Store Connect |

## Encode Files to Base64

On Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.p12")) | Set-Content cert.txt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("profile.mobileprovision")) | Set-Content profile.txt
```

On Mac:
```bash
base64 -i certificate.p12 | pbcopy
base64 -i profile.mobileprovision | pbcopy
```

## Install on iPhone (No Mac Required)

### Option 1: AltStore (Windows) — Recommended
1. Download [AltStore](https://altstore.io)
2. Install AltServer on Windows, install AltStore on iPhone via USB
3. Download the `.ipa` from GitHub Actions → Artifacts
4. Open AltStore on iPhone → My Apps → + → select .ipa

### Option 2: TestFlight (Wireless)
1. After build, check your email for TestFlight invitation
2. Install TestFlight app on iPhone
3. Open invitation link, install app

### Option 3: Sideloadly (Windows)
1. Download [Sideloadly](https://sideloadly.io)
2. Connect iPhone via USB
3. Drag .ipa into Sideloadly, click Start

## First Launch on iPhone
1. Open Settings → Privacy & Security → Local Network
2. Find "Alphonso" and enable it
3. Open Alphonso app
4. Enter desktop IP (or wait for auto-discovery)
5. Enter the 6-digit PIN shown in desktop Settings → Remote Access
