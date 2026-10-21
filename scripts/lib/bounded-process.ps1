# Runs one external process with a hard time limit and reports what
# happened instead of printing it. scripts/verify.ps1 uses this to keep
# gitleaks from stalling the whole verifier, and src/test/boundedProcess.test.js
# drives it with stand-in processes to prove the timeout and error paths.
#
# Returns a [pscustomobject] with:
#   Status   'completed' | 'timeout' | 'error'
#   ExitCode the process exit code when Status is 'completed', else $null
#   Message  a short reason when Status is 'timeout' or 'error'

function Invoke-BoundedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [int]$TimeoutSeconds = 90
  )

  try {
    $startArgs = @{ NoNewWindow = $true; PassThru = $true; FilePath = $FilePath }
    if ($ArgumentList.Count -gt 0) { $startArgs.ArgumentList = $ArgumentList }
    $p = Start-Process @startArgs
  } catch {
    return [pscustomobject]@{ Status = 'error'; ExitCode = $null; Message = $_.Exception.Message }
  }

  if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
    try { $p.Kill($true) } catch { try { $p.Kill() } catch { } }
    return [pscustomobject]@{ Status = 'timeout'; ExitCode = $null; Message = "exceeded ${TimeoutSeconds}s" }
  }

  return [pscustomobject]@{ Status = 'completed'; ExitCode = $p.ExitCode; Message = $null }
}
