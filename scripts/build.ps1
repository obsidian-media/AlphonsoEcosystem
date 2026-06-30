# Alphonso release build script
# Usage: .\build.ps1
# Loads the Tauri updater signing key automatically and builds both NSIS + MSI installers.

$keyFile = Join-Path $PSScriptRoot ".tauri-updater-key"

if (-not (Test-Path $keyFile)) {
  Write-Host "ERROR: .tauri-updater-key not found. Run: npx @tauri-apps/cli signer generate -w .tauri-updater-key --ci" -ForegroundColor Red
  exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $keyFile -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

Write-Host "Signing key loaded. Building Alphonso..." -ForegroundColor Cyan
npm run tauri build

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Build complete. Installers:" -ForegroundColor Green
  Write-Host "  NSIS: src-tauri\target\release\bundle\nsis\Alphonso_2.4.4_x64-setup.exe"
} else {
  Write-Host "Build failed." -ForegroundColor Red
}
