# create-p12.ps1 — Convert Apple .cer certificate + private key → .p12
# Run this after downloading the .cer from Apple Developer portal

$ErrorActionPreference = "Stop"

Write-Host "Create .p12 Certificate" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = $PSScriptRoot
$certsDir = "$scriptDir\certs"

# Check files exist
$privateKeyPath = "$certsDir\private_key.pem"
$cerFiles = Get-ChildItem -Path $certsDir -Filter "*.cer" -ErrorAction SilentlyContinue

if (-not (Test-Path $privateKeyPath)) {
    Write-Host "ERROR: private_key.pem not found in $certsDir" -ForegroundColor Red
    Write-Host "Run generate-csr.ps1 first" -ForegroundColor Yellow
    exit 1
}

if ($cerFiles.Count -eq 0) {
    Write-Host "ERROR: No .cer file found in $certsDir" -ForegroundColor Red
    Write-Host "Download the .cer from Apple Developer portal first" -ForegroundColor Yellow
    exit 1
}

$cerPath = $cerFiles[0].FullName
Write-Host "Found certificate: $($cerFiles[0].Name)" -ForegroundColor Green
Write-Host "Found private key: private_key.pem" -ForegroundColor Green

# Get password for .p12
$p12Password = Read-Host "Enter a password for the .p12 file" -AsSecureString
$p12PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p12Password)
)

# Import the private key
Write-Host "`nImporting private key..." -ForegroundColor Yellow
$privateKeyPem = Get-Content -Raw -Path $privateKeyPath

# Remove PEM headers and decode
$privateKeyBase64 = $privateKeyPem -replace "-----BEGIN PRIVATE KEY-----", "" -replace "-----END PRIVATE KEY-----", "" -replace "`r`n", "" -replace "`n", ""
$privateKeyBytes = [Convert]::FromBase64String($privateKeyBase64)

# Create RSA from PKCS#8 private key
$rsa = [System.Security.Cryptography.RSA]::Create()
$rsa.ImportPkcs8PrivateKey($privateKeyBytes, [ref]$null)

# Import the certificate
Write-Host "Importing certificate..." -ForegroundColor Yellow
$certBytes = [System.IO.File]::ReadAllBytes($cerPath)
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certBytes)

# Create .p12 using OpenSSL-compatible export
# Since we can't use ExportPkcs12 directly with .NET, we'll use a different approach
# Create a PFX file first, then the user can convert it

$pfxPath = "$certsDir\certificate.pfx"
$certWithKey = $cert.CopyWithPrivateKey($rsa)

# Export as PFX
$pfxBytes = $certWithKey.Export(
    [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
    $p12PasswordPlain
)
[System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)

Write-Host "`nPFX created: $pfxPath" -ForegroundColor Green
Write-Host "`nConverting to .p12 format..." -ForegroundColor Yellow

# .p12 IS PFX - same format, different extension
$p12Path = "$certsDir\certificate.p12"
Copy-Item -Path $pfxPath -Destination $p12Path -Force

Write-Host ".p12 created: $p12Path" -ForegroundColor Green

# Create base64 versions for GitHub Secrets
Write-Host "`nCreating base64 encoded versions..." -ForegroundColor Yellow
$certBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($p12Path))
$certBase64 | Out-File -FilePath "$certsDir\certificate_base64.txt" -Encoding ASCII

Write-Host "Base64 saved: $certsDir\certificate_base64.txt" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create a Provisioning Profile:" -ForegroundColor White
Write-Host "   Go to: https://developer.apple.com/account/resources/profiles/add" -ForegroundColor White
Write-Host "   - Select 'iOS App Development' or 'App Store Connect'" -ForegroundColor White
Write-Host "   - Select your App ID (create if needed: com.alphonso.companion)" -ForegroundColor White
Write-Host "   - Select the certificate you just created" -ForegroundColor White
Write-Host "   - For TestFlight: no device selection needed" -ForegroundColor White
Write-Host "   - Download the .mobileprovision file" -ForegroundColor White
Write-Host "   - Save it in: $certsDir\" -ForegroundColor White
Write-Host ""
Write-Host "2. Then run: .\add-secrets.ps1" -ForegroundColor White
Write-Host ""
Write-Host "GitHub Secrets needed:" -ForegroundColor Cyan
Write-Host "  IOS_CERTIFICATE          = content of certificate_base64.txt" -ForegroundColor Gray
Write-Host "  IOS_CERTIFICATE_PASSWORD = the password you just entered" -ForegroundColor Gray
Write-Host "  IOS_DEVELOPMENT_TEAM     = $teamId" -ForegroundColor Gray
Write-Host "  IOS_PROVISION_PROFILE    = base64 of .mobileprovision" -ForegroundColor Gray
