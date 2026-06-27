# generate-csr.ps1 — Generate Certificate Signing Request for Apple (No OpenSSL needed)
# Run this on your Windows machine

$ErrorActionPreference = "Stop"

Write-Host "iOS Certificate Generator" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Get info
$teamId = Read-Host "Enter your Apple Team ID (10 chars)"
$email = Read-Host "Enter your Apple ID email"
$commonName = Read-Host "Enter certificate name (e.g. 'Alphonso iOS Distribution')"

# Create output directory
$outDir = "$PSScriptRoot\certs"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Generate RSA private key (2048-bit)
Write-Host "`nGenerating private key..." -ForegroundColor Yellow
$rsa = [System.Security.Cryptography.RSA]::Create(2048)

# Export private key in PKCS#8 format
$privateKeyBytes = $rsa.ExportPkcs8PrivateKey()
$privateKeyPem = "-----BEGIN PRIVATE KEY-----`n"
$privateKeyPem += [Convert]::ToBase64String($privateKeyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$privateKeyPem += "`n-----END PRIVATE KEY-----"
$privateKeyPem | Out-File -FilePath "$outDir\private_key.pem" -Encoding ASCII
Write-Host "Private key saved: $outDir\private_key.pem" -ForegroundColor Green

# Build CSR using ASN.1
Write-Host "Generating CSR..." -ForegroundColor Yellow

# Subject: CN=commonName, O=teamId, OID.1.2.840.113549.1.9.1=email
$oidCn = [System.Security.Cryptography.Oid]::Lookup("2.5.4.3")
$oidO = [System.Security.Cryptography.Oid]::Lookup("2.5.4.10")
$oidEmail = [System.Security.Cryptography.Oid]::Lookup("1.2.840.113549.1.9.1")

$subjectBuilder = New-Object System.Security.Cryptography.AsnEncodedData($oidCn, [System.Text.Encoding]::ASCII.GetBytes($commonName))
$subjectO = New-Object System.Security.Cryptography.AsnEncodedData($oidO, [System.Text.Encoding]::ASCII.GetBytes($teamId))
$subjectEmail = New-Object System.Security.Cryptography.AsnEncodedData($oidEmail, [System.Text.Encoding]::ASCII.GetBytes($email))

# Create CSR using .NET
$csr = New-Object System.Security.Cryptography.Certificates.CertificateRequest(
    "CN=$commonName, O=$teamId, 1.2.840.113549.1.9.1=$email",
    $rsa,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256,
    [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)

$csrBytes = $csr.CreateSigningRequest()
$csrPem = "-----BEGIN CERTIFICATE REQUEST-----`n"
$csrPem += [Convert]::ToBase64String($csrBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$csrPem += "`n-----END CERTIFICATE REQUEST-----"
$csrPem | Out-File -FilePath "$outDir\certsigningrequest.csr" -Encoding ASCII
Write-Host "CSR saved: $outDir\certsigningrequest.csr" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Go to: https://developer.apple.com/account/resources/certificates/add" -ForegroundColor White
Write-Host "2. Select 'iOS Distribution (App Store and Ad Hoc)'" -ForegroundColor White
Write-Host "3. Click Continue" -ForegroundColor White
Write-Host "4. Upload the CSR file:" -ForegroundColor White
Write-Host "   $outDir\certsigningrequest.csr" -ForegroundColor White
Write-Host "5. Click Continue, then download the .cer certificate" -ForegroundColor White
Write-Host "6. Save the .cer file in: $outDir\" -ForegroundColor White
Write-Host "7. Run: .\create-p12.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Files created:" -ForegroundColor Green
Write-Host "  $outDir\private_key.pem     (KEEP SECRET - needed for .p12)" -ForegroundColor Gray
Write-Host "  $outDir\certsigningrequest.csr (upload to Apple)" -ForegroundColor Gray
