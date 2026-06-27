# generate-csr.ps1 — Generate Certificate Signing Request for Apple
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

Write-Host "`nGenerating private key..." -ForegroundColor Yellow
$rsa = [System.Security.Cryptography.RSA]::Create(2048)

$privateKeyBytes = $rsa.ExportPkcs8PrivateKey()
$privateKeyPem = "-----BEGIN PRIVATE KEY-----`n"
$privateKeyPem += [Convert]::ToBase64String($privateKeyBytes, [System.Base64FormattingOptions]::InsertLineBreaks)
$privateKeyPem += "`n-----END PRIVATE KEY-----"
$privateKeyPem | Out-File -FilePath "$outDir\private_key.pem" -Encoding ASCII
Write-Host "Private key saved: $outDir\private_key.pem" -ForegroundColor Green

Write-Host "Generating CSR..." -ForegroundColor Yellow

$subject = "CN=$commonName, O=$teamId, E=$email"

$csr = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest(
    $subject,
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
