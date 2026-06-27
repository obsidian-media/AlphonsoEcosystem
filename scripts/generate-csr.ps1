# generate-csr.ps1 — Generate CSR for Apple using Windows certreq (no OpenSSL, no .NET Core needed)
# Run this on your Windows machine

$ErrorActionPreference = "Stop"

Write-Host "iOS Certificate Generator" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

$teamId = Read-Host "Enter your Apple Team ID (10 chars)"
$email = Read-Host "Enter your Apple ID email"
$commonName = Read-Host "Enter certificate name (e.g. 'Alphonso iOS Distribution')"

$outDir = "$PSScriptRoot\certs"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Create INF file for certreq
$infContent = @"
[Version]
Signature = "`$Windows NT$"

[NewRequest]
Subject = "CN=$commonName, O=$teamId, E=$email"
KeySpec = 1
KeyLength = 2048
HashAlgorithm = SHA256
Exportable = TRUE
MachineKeySet = FALSE
SMIME = FALSE
PrivateKeyArchive = FALSE
UserProtected = FALSE
UseExistingKeySet = FALSE
ProviderName = "Microsoft Enhanced RSA and AES Cryptographic Provider"
ProviderType = 12
RequestType = PKCS10
KeyUsage = 0xa0

[EnhancedKeyUsageExtension]
OID = 1.3.6.1.5.5.7.3.2
"@

$infPath = "$outDir\request.inf"
$infContent | Out-File -FilePath $infPath -Encoding ASCII

Write-Host "Creating CSR..." -ForegroundColor Yellow

# Use certreq to generate the CSR
$csrResult = certreq -new -f $infPath "$outDir\certsigningrequest.csr" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error creating CSR:" -ForegroundColor Red
    Write-Host $csrResult
    exit 1
}

Write-Host "CSR saved: $outDir\certsigningrequest.csr" -ForegroundColor Green

# Clean up temp INF
Remove-Item -Path $infPath -Force -ErrorAction SilentlyContinue

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to: https://developer.apple.com/account/resources/certificates/add" -ForegroundColor White
Write-Host "2. Select 'iOS Distribution (App Store and Ad Hoc)'" -ForegroundColor White
Write-Host "3. Click Continue" -ForegroundColor White
Write-Host "4. Upload this file:" -ForegroundColor White
Write-Host "   $outDir\certsigningrequest.csr" -ForegroundColor White
Write-Host "5. Click Continue, then download the .cer certificate" -ForegroundColor White
Write-Host "6. Save the .cer file in: $outDir\" -ForegroundColor White
Write-Host "7. Run: .\create-p12.ps1" -ForegroundColor White
