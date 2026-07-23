$text = Get-Content docs/ALPHONSO_GROUND_TRUTH.md -Raw
# Use .Replace for literal string replacement
$text = $text.Replace("Last verified: 2026-07-21 — v2.6.0 (skill-pack integration and dependency-lock refresh; no version bump)", "Last verified: 2026-07-23 — v2.6.1 (Session Coach Phase 0+1: approval audit wiring + 7-detector coach engine; no version bump)")
$text = $text.Replace("Service Layer — ~168 Services", "Service Layer — ~169 Services")
$text = $text.Replace("Test Suite — 249 Files", "Test Suite — 250 Files")
$text = $text.Replace("218 test files, 3174 tests passing", "250 test files, 3590 tests passing")
Set-Content docs/ALPHONSO_GROUND_TRUTH.md -Value $text