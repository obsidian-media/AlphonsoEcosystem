$content = Get-Content docs/ALPHONSO_GROUND_TRUTH.md -Raw
$content = $content -replace 'Last verified: 2026-07-21 — v2.6.0', 'Last verified: 2026-07-23 — v2.6.1 (Session Coach Phase 0+1: approval audit wiring + 7-detector coach engine; no version bump)'
$content = $content -replace 'Service Layer — ~168 Services', 'Service Layer — ~169 Services'
$content = $content -replace 'Test Suite — 249 Files in `src/test/`', 'Test Suite — 250 Files in `src/test/`'
$content = $content -replace '218 test files, 3174 tests passing', '250 test files, 3590 tests passing'
Set-Content docs/ALPHONSO_GROUND_TRUTH.md -Value $content