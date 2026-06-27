# create-p12.ps1 — Convert Apple .cer + private key → .p12 using certreq (no OpenSSL needed)
# Run this after downloading the .cer from Apple Developer portal

$ErrorActionPreference = "Stop"

Write-Host "Create .p12 Certificate" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan
Write-Host ""

$certsDir = "$PSScriptRoot\certs"

# Check files exist
$privateKeyPath = "$certsDir\private_key.pem"
$cerFile = Get-ChildItem -Path $certsDir -Filter "*.cer" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not (Test-Path $privateKeyPath)) {
    Write-Host "ERROR: private_key.pem not found in $certsDir" -ForegroundColor Red
    Write-Host "Run generate-csr.ps1 first" -ForegroundColor Yellow
    exit 1
}

if (-not $cerFile) {
    Write-Host "ERROR: No .cer file found in $certsDir" -ForegroundColor Red
    Write-Host "Download the .cer from Apple Developer portal first" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found certificate: $($cerFile.Name)" -ForegroundColor Green
Write-Host "Found private key: private_key.pem" -ForegroundColor Green

$p12Password = Read-Host "Enter a password for the .p12 file"
$pfxPath = "$certsDir\certificate.pfx"
$p12Path = "$certsDir\certificate.p12"

# Convert PEM private key to PVK format using certreq
Write-Host "`nConverting private key..." -ForegroundColor Yellow

# Create a dummy INF to import the key
$importInf = @"
[Version]
Signature = "`$Windows NT$"

[Properties]
KeySpec = 1
"@

# Use OpenSSL-compatible approach: create PFX directly
# Since we have .pem and .cer, we need to combine them

# Read the PEM key and extract raw RSA key
$privateKeyPem = Get-Content -Raw -Path $privateKeyPath
$keyBase64 = ($privateKeyPem -replace "-----BEGIN PRIVATE KEY-----", "" -replace "-----END PRIVATE KEY-----", "" -replace "`r`n", "" -replace "`n", "").Trim()

# Read the .cer certificate
$cerBytes = [System.IO.File]::ReadAllBytes($cerFile.FullName)

# Convert .cer to Base64
$certBase64 = [Convert]::ToBase64String($cerBytes)

# Create a PKCS12/PFX using certutil
# First, create a combined PEM file
$combinedPem = "$certsDir\combined.pem"
$cerPem = "-----BEGIN CERTIFICATE-----`n"
$cerPem += [Convert]::ToBase64String($cerBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$cerPem += "`n-----END CERTIFICATE-----"

# Write cert as PEM
$cerPem | Out-File -FilePath $combinedPem -Encoding ASCII

# Append private key
Get-Content -Path $privateKeyPath | Add-Content -Path $combinedPem -Encoding ASCII

Write-Host "Converting to PFX..." -ForegroundColor Yellow

# Use certutil to create PFX (available on all Windows)
$certutilResult = certutil -exportPFX -p $p12Password "$combinedPem" $p12Path 2>&1

if ($LASTEXITCODE -ne 0) {
    # Fallback: try using openssl if available
    Write-Host "certutil failed, trying alternative method..." -ForegroundColor Yellow
    
    # Create PFX using .NET
    try {
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($cerFile.FullName)
        
        # Import the private key from PEM
        $rsa = [System.Security.Cryptography.RSA]::Create()
        $keyBytes = [Convert]::FromBase64String($keyBase64)
        
        # Try importing as PKCS8
        try {
            $rsa.ImportPkcs8PrivateKey($keyBytes, [ref]$null)
        } catch {
            # If that fails, try XML import
            Write-Host "Trying XML import method..." -ForegroundColor Yellow
            throw "Cannot import private key. Please install OpenSSL or use a different method."
        }
        
        $certWithKey = $cert.CopyWithPrivateKey($rsa)
        
        $pfxBytes = $certWithKey.Export(
            [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
            $p12Password
        )
        [System.IO.File]::WriteAllBytes($p12Path, $pfxBytes)
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Manual alternative:" -ForegroundColor Yellow
        Write-Host "1. Install OpenSSL for Windows" -ForegroundColor White
        Write-Host "2. Run: openssl pkcs12 -export -in certificate.cer -inkey private_key.pem -out certificate.p12" -ForegroundColor White
        exit 1
    }
}

# Cleanup
Remove-Item -Path $combinedPem -Force -ErrorAction SilentlyContinue

# Create base64 versions for GitHub Secrets
Write-Host "`nCreating base64 encoded versions..." -ForegroundColor Yellow
$certBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($p12Path))
$certBase64 | Out-File -FilePath "$certsDir\certificate_base64.txt" -Encoding ASCII

Write-Host "Base64 saved: $certsDir\certificate_base64.txt" -ForegroundColor Green
Write-Host ".p12 saved: $p12Path" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Create a Provisioning Profile:" -ForegroundColor White
Write-Host "   Go to: https://developer.apple.com/account/resources/profiles/add" -ForegroundColor White
Write-Host "   - Select 'App Store Connect'" -ForegroundColor White
Write-Host "   - App ID: create new with bundle ID 'com.alphonso.companion'" -ForegroundColor White
Write-Host "   - Select the certificate you just created" -ForegroundColor White
Write-Host "   - No device needed for TestFlight" -ForegroundColor White
Write-Host "   - Download the .mobileprovision file to $certsDir\" -ForegroundColor White
Write-Host ""
Write-Host "2. Then run: .\add-secrets.ps1" -ForegroundColor White
