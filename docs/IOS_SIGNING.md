# iOS Signing — Quick Start (No Mac Required)

All scripts are in `scripts/` — run them in order from PowerShell.

## Prerequisites

- Windows with PowerShell 5.1+
- `gh` CLI installed and authenticated (`gh auth login`)
- Apple Developer Account ($99/year)

## Step 1: Generate Certificate Signing Request

```powershell
cd scripts
.\generate-csr.ps1
```

This creates:
- `certs/private_key.pem` — your private key (KEEP SECRET)
- `certs/certsigningrequest.csr` — upload this to Apple

## Step 2: Upload CSR to Apple

1. Go to https://developer.apple.com/account/resources/certificates/add
2. Select **iOS Distribution (App Store and Ad Hoc)**
3. Upload `certs/certsigningrequest.csr`
4. Download the `.cer` certificate
5. Save it in `certs/` folder

## Step 3: Create .p12 Certificate

```powershell
.\create-p12.ps1
```

This creates:
- `certs/certificate.p12` — the signing certificate
- `certs/certificate_base64.txt` — base64 for GitHub

## Step 4: Create Provisioning Profile

1. Go to https://developer.apple.com/account/resources/profiles/add
2. Select **App Store Connect**
3. App ID: create new with bundle ID `com.alphonso.companion`
4. Select the certificate from Step 2
5. No device selection needed for TestFlight
6. Download the `.mobileprovision` file
7. Save it in `certs/` folder

## Step 5: Add GitHub Secrets

```powershell
.\add-secrets.ps1
```

This adds all 5 secrets to your GitHub repo.

## Step 6: Build & Deploy

```powershell
git push origin IOSCOMPANION
```

Wait 15-20 minutes for:
- GitHub Actions builds the app
- Uploads to TestFlight
- Check your email for invitation

## Step 7: Install on iPhone

1. Install **TestFlight** app from App Store
2. Open the email from Apple
3. Tap "View in TestFlight" → Install

## Troubleshooting

| Error | Fix |
|-------|-----|
| "No certificate found" | Make sure .cer is in `certs/` folder |
| "No provisioning profile" | Make sure .mobileprovision is in `certs/` folder |
| Build fails on GitHub | Check that all 5 secrets are set correctly |
| TestFlight not showing app | Wait up to 30 minutes for Apple processing |
