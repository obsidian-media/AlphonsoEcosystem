# Repo-adaptive governance verification (PowerShell / Windows).
# Mirrors scripts/verify.sh: secret-scan, doc-freshness, build, test, deploy-dry.
# Scoped to $RepoRoot only (does NOT walk outside the repo).
$ErrorActionPreference = 'Continue'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$failed = $false
function Notice($t,$m){ Write-Host "::notice title=$t::$m" }
function Err($t,$m){ Write-Host "::error title=$t::$m"; $script:failed = $true }

function Invoke-SecretScanFallback {
  # Scan only tracked files so untracked/generated trees cannot stall the gate.
  $badFiles = git -C $RepoRoot ls-files --cached -- |
    Where-Object { $_ -match '(^|[\\/])[^\\/]*(\.p8|\.p12|credential[^\\/]*|\.pem|\.key)$' }
  if ($badFiles) { Err "secret-scan" "secret files present: $($badFiles -join ', ')" }
  $excludeDirsWithTests = '[\\/](node_modules|\.git|audits[\\/]private|venv|\.venv|target|_repo_clone|dist|build|\.cache|coverage|scripts[\\/]certs|\.tauri|test|tests|e2e)[\\/]'
  $rawHits = git -C $RepoRoot grep -n -I -E '(API_KEY|SECRET|PRIVATE_KEY|TOKEN|PASSWORD)[[:space:]]*[=:][[:space:]]*["''][A-Za-z0-9/+_-]{8,}["'']' -- .
  if ($LASTEXITCODE -gt 1) { Err "secret-scan" "git grep failed (rc=$LASTEXITCODE)" }
  $hits = $rawHits |
    Where-Object { $_ -match '\.(json|env|ts|tsx|js|jsx|py|yml|yaml|toml|sh|rs|ps1|swift):' } |
    Where-Object { $_ -notmatch $excludeDirsWithTests } |
    Where-Object { $_ -notmatch '\.env\.(example|sample):' }
  if ($hits) { Err "secret-scan" "possible hardcoded secrets in: $($hits -join ', ')" }
}

function Resolve-ProcessExecutable($name) {
  $isWindowsHost = $env:OS -eq 'Windows_NT' -or $PSVersionTable.PSEdition -eq 'Desktop'
  if ($isWindowsHost -and $name -in @('npm','pnpm','yarn')) { return "$name.cmd" }
  return $name
}

. (Join-Path $PSScriptRoot 'lib/bounded-process.ps1')

function Invoke-BoundedGitleaks {
  $gitleaksPath = (Get-Command gitleaks -ErrorAction Stop).Source
  $result = Invoke-BoundedProcess -FilePath $gitleaksPath -ArgumentList @('detect','--no-banner','--redact') -TimeoutSeconds 90
  switch ($result.Status) {
    'timeout' {
      Notice "secret-scan" "gitleaks exceeded 90s; using Git-tracked-file fallback"
      return $false
    }
    'error' {
      Notice "secret-scan" "gitleaks could not execute; using Git-tracked-file fallback ($($result.Message))"
      return $false
    }
  }
  if ($result.ExitCode -ne 0) {
    Err "secret-scan" "gitleaks found secrets (rc=$($result.ExitCode))"
  }
  return $true
}

# ---------------------------------------------------------------- 1. secret-scan
Write-Host "== secret-scan =="
if (Get-Command gitleaks -ErrorAction SilentlyContinue) {
  if (-not (Invoke-BoundedGitleaks)) { Invoke-SecretScanFallback }
} else {
  Invoke-SecretScanFallback
}

# ---------------------------------------------------------------- 2. doc-freshness
Write-Host "== doc-freshness =="
if (-not (Test-Path (Join-Path $RepoRoot 'README.md'))) { Err "doc-freshness" "README.md missing" }
$newest = Get-ChildItem -Path (Join-Path $RepoRoot 'audits') -Recurse -Filter *.md -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '[\\/]audits[\\/]private[\\/]' } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $newest) { Err "doc-freshness" "no audit found under audits/" }
else {
  $age = ([datetime]::Now - $newest.LastWriteTime).Days
  if ($age -gt 30) { Err "doc-freshness" "newest audit is $age days old (>30)" }
}
$baselinePath = Join-Path $RepoRoot 'docs/_baseline.json'
if (-not (Test-Path $baselinePath)) {
  $cnt = (Get-ChildItem -Path (Join-Path $RepoRoot 'docs') -Recurse -Filter *.md -ErrorAction SilentlyContinue).Count
  "{ `"md_count`": $cnt }" | Out-File $baselinePath -Encoding utf8
  Notice "doc-freshness" "captured docs baseline md_count=$cnt"
}
$base = 0
if (Test-Path $baselinePath) {
  $m = (Get-Content $baselinePath) -match '"md_count":\s*(\d+)'
  if ($m) { $base = [int]($Matches[1]) }
}
$cur = (Get-ChildItem -Path (Join-Path $RepoRoot 'docs') -Recurse -Filter *.md -ErrorAction SilentlyContinue).Count
if ($cur -lt $base) { Err "doc-freshness" "docs md count $cur < baseline $base (deletion without approval)" }

# ---------------------------------------------------------------- 3. build / test (adaptive)
Write-Host "== build / test =="
$PM = $null
if (Test-Path (Join-Path $RepoRoot 'pnpm-lock.yaml')) { $PM = 'pnpm' }
elseif (Test-Path (Join-Path $RepoRoot 'yarn.lock')) { $PM = 'yarn' }
elseif (Test-Path (Join-Path $RepoRoot 'package-lock.json')) { $PM = 'npm' }

function RunTimed($secs, $label, $cmd) {
  $timeoutSec = $secs
  $exe = Resolve-ProcessExecutable $cmd[0]
  $p = Start-Process -NoNewWindow -PassThru -FilePath $exe -ArgumentList $cmd[1..($cmd.Count-1)]
  $startedAt = [datetime]::UtcNow
  if (-not $p) { Err $label "could not start $exe"; return }
  $waited = 0
  while (-not $p.WaitForExit(1000)) {
    $waited += 1
    if ($waited -ge $timeoutSec) {
      $p.Kill()
      Err $label "timed out after ${timeoutSec}s (killed)"
      return
    }
  }
  if ($p.ExitCode -eq 124) { Err $label "timed out after ${timeoutSec}s" }
  elseif ($p.ExitCode -ne 0) { Err $label "failed (rc=$($p.ExitCode))" }
  else {
    $elapsed = [math]::Round(([datetime]::UtcNow - $startedAt).TotalSeconds, 1)
    Notice $label "ok (${elapsed}s)"
  }
}

if ($PM) {
  switch ($PM) {
    'pnpm' { RunTimed 300 build @('pnpm','install','--frozen-lockfile') }
    'yarn' { RunTimed 300 build @('yarn','install','--frozen-lockfile') }
    'npm'  { RunTimed 300 build @('npm','ci') }
  }
  if (-not $failed) {
    foreach ($m in @('npm','pnpm','yarn')) {
      if (Get-Command $m -ErrorAction SilentlyContinue) {
        $c = if ($m -eq 'npm') { 'npm run build --if-present' } elseif ($m -eq 'pnpm') { 'pnpm run build --if-present' } else { 'yarn build' }
        Invoke-Expression $c >$null 2>&1; if ($LASTEXITCODE -eq 0) { Notice build "build ok" } else { Err build "build failed" }
        $c = if ($m -eq 'npm') { 'npm test --if-present' } elseif ($m -eq 'pnpm') { 'pnpm test --if-present' } else { 'yarn test' }
        Invoke-Expression $c >$null 2>&1; if ($LASTEXITCODE -eq 0) { Notice test "test ok" } else { Err test "test failed" }
      }
    }
  }
} elseif ((Test-Path (Join-Path $RepoRoot 'pyproject.toml')) -or (Test-Path (Join-Path $RepoRoot 'requirements.txt'))) {
  if (Test-Path (Join-Path $RepoRoot 'requirements.txt')) { pip install -q -r (Join-Path $RepoRoot 'requirements.txt') }
  pytest -q; if ($LASTEXITCODE -ne 0) { Err "test" "pytest failed" }
} elseif (Test-Path (Join-Path $RepoRoot 'Cargo.toml')) {
  cargo build --release; if ($LASTEXITCODE -ne 0) { Err "build" "cargo build failed" }
  cargo test --release; if ($LASTEXITCODE -ne 0) { Err "test" "cargo test failed" }
} else {
  Notice "build" "no build system detected; docs/static repo — skipping build/test"
}

# ---------------------------------------------------------------- 4. deploy-dry
Write-Host "== deploy-dry =="
if (Test-Path (Join-Path $RepoRoot 'vercel.json')) {
  if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Notice "deploy" "vercel.json present but vercel CLI not installed on this runner; smoke build already covered"
  } elseif (-not $env:VERCEL_TOKEN) {
    Notice "deploy" "vercel.json present but VERCEL_TOKEN not set; skipping authenticated dry-run — smoke build already covered"
  } else {
    vercel build --dry-run; if ($LASTEXITCODE -ne 0) { Err "deploy" "vercel dry-run failed" }
  }
} elseif ((Test-Path (Join-Path $RepoRoot 'railway.json')) -or (Test-Path (Join-Path $RepoRoot 'railway.toml'))) {
  Notice "deploy" "railway target present; run 'railway up --detach' manually"
} elseif (Test-Path (Join-Path $RepoRoot 'eas.json')) {
  npx eas build --platform all --local --no-wait --non-interactive; if ($LASTEXITCODE -ne 0) { Err "deploy" "eas dry build failed" }
} elseif (Test-Path (Join-Path $RepoRoot 'netlify.toml')) {
  Notice "deploy" "netlify target present; manual deploy"
} else {
  Notice "deploy" "no deploy target; smoke build already covered"
}

# ---------------------------------------------------------------- 5. directive-lint
# REPO_DIRECTIVE.md is the goal-layer constitution. Every task must trace to a
# Phase/Sprint/Epic id defined in the same file. Orphan tasks = divergence risk.
# ROLLOUT NOTE: missing directive is a Notice (not Err) during P8 rollout so
# repos without one yet don't red-break main. Flip to Err once every portfolio
# repo has a linted REPO_DIRECTIVE.md (see project-sentinel P8).
Write-Host "== directive-lint =="
$dirFile = Join-Path $RepoRoot 'REPO_DIRECTIVE.md'
if (-not (Test-Path $dirFile)) {
  Notice "directive-lint" "REPO_DIRECTIVE.md not present yet (required after P8 rollout)"
} else {
  $text = Get-Content $dirFile -Raw
  $defined = [regex]::Matches($text, '\b(P[0-9]+|S[0-9]+|E[0-9]+)\b') | ForEach-Object { $_.Value } | Sort-Object -Unique
  $orphans = $false
  $taskLines = Select-String -Path $dirFile -Pattern '^\s*- \[ \] T[0-9]+' | ForEach-Object { $_.Line }
  foreach ($line in $taskLines) {
    if ($line -notmatch 'traces-to:') {
      Err "directive-lint" "orphan task (no traces-to): $($line.Substring(0, [Math]::Min(80,$line.Length)))"
      $orphans = $true
    } else {
      $ref = ([regex]::Match($line, 'traces-to:([^|]*)')).Groups[1].Value.Trim() -split '/' | Select-Object -First 1
      if ($defined -notcontains $ref) {
        Err "directive-lint" "task references undefined id '$ref': $($line.Substring(0, [Math]::Min(80,$line.Length)))"
        $orphans = $true
      }
    }
  }
  if (-not $orphans) { Notice "directive-lint" "all tasks trace to a defined phase/sprint/epic" }
}

if ($failed) { Write-Host "VERIFY FAILED"; exit 1 }
Write-Host "VERIFY PASSED"
