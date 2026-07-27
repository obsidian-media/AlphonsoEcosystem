# add-secrets.ps1 — Add all iOS signing secrets to GitHub
# Run this after generate-csr.ps1 and create-p12.ps1

$ErrorActionPreference = "Stop"

Write-Host "Add GitHub Secrets for iOS Build" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$certsDir = "$PSScriptRoot\certs"
$repo = "obsidian-media/AlphonsoEcosystem"

# Check prerequisites
$certBase64Path = "$certsDir\certificate_base64.txt"
$profileFiles = Get-ChildItem -Path $certsDir -Filter "*.mobileprovision" -ErrorAction SilentlyContinue

if (-not (Test-Path $certBase64Path)) {
    Write-Host "ERROR: certificate_base64.txt not found. Run create-p12.ps1 first." -ForegroundColor Red
    exit 1
}

if ($profileFiles.Count -eq 0) {
    Write-Host "ERROR: No .mobileprovision file found in $certsDir" -ForegroundColor Red
    Write-Host "Download the provisioning profile from Apple Developer portal first" -ForegroundColor Yellow
    exit 1
}

# Get Team ID
$teamId = Read-Host "Enter your Apple Team ID (10 chars, e.g. ABC123DEF4)"
$p12Password = Read-Host "Enter the .p12 password you used earlier"

# Base64 encode the provisioning profile
$profilePath = $profileFiles[0].FullName
$profileBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($profilePath))

Write-Host "`nAdding secrets to $repo..." -ForegroundColor Yellow

# Add each secret
$secrets = @{
    "IOS_CERT_DER" = (Get-Content -Raw -Path $certBase64Path).Trim()
    "IOS_CERTIFICATE_PASSWORD" = $p12Password
    "APPLE_TEAM_ID" = $teamId
    "IOS_PROVISIONING_PROFILE" = $profileBase64
    "IOS_CERTIFICATE_NAME" = "Apple Distribution"
}

if (-not $certBase64Path -or -not (Test-Path $certBase64Path)) {
    Write-Host "! ERROR: IOS_KEY_PEM source path is missing or file does not exist. Aborting secret setup." -ForegroundColor Red
    exit 1
}

$keyPem = Get-Content -Raw -Path $certBase64Path
if ($keyPem -match "REPLACE_WITH_BASE64_ENCODED_PRIVATE_KEY") {
    Write-Host "! ERROR: IOS_KEY_PEM value is still the placeholder REPLACE_WITH_BASE64_ENCODED_PRIVATE_KEY. Provide a real base64-encoded private key file. Aborting secret setup." -ForegroundColor Red
    exit 1
}
$secrets["IOS_KEY_PEM"] = $keyPem.Trim()

foreach ($name in $secrets.Keys) {
    Write-Host "  Setting $name..." -ForegroundColor Gray
    $secrets[$name] | gh secret set $name --repo $repo
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ $name" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $name FAILED" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DONE! All secrets added." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now push to IOSCOMPANION branch:" -ForegroundColor Yellow
Write-Host "  git push origin IOSCOMPANION" -ForegroundColor White
Write-Host ""
Write-Host "GitHub Actions will:" -ForegroundColor Cyan
Write-Host "  1. Build the iOS app (10-15 min)" -ForegroundColor White
Write-Host "  2. Upload to TestFlight (5 min)" -ForegroundColor White
Write-Host "  3. You'll get an email from App Store Connect" -ForegroundColor White
Write-Host "  4. Install TestFlight app on iPhone" -ForegroundColor White
Write-Host "  5. Open the email link → Install" -ForegroundColor White
