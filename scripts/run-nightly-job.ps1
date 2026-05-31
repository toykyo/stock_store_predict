$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root "artifacts\nightly-jobs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "nightly-$timestamp.log"
$notifyScript = Join-Path $PSScriptRoot "send-email-notification.ps1"

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] nightly job started" | Tee-Object -FilePath $logFile
npm run job:nightly 2>&1 | Tee-Object -FilePath $logFile -Append
if ($LASTEXITCODE -ne 0) {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] nightly job failed with exit code $LASTEXITCODE" | Tee-Object -FilePath $logFile -Append
  if (Test-Path -LiteralPath $notifyScript) {
    try {
      & $notifyScript -Status failure -LogFile $logFile -ExitCode $LASTEXITCODE
    }
    catch {
      "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] email notification failed: $($_.Exception.Message)" | Tee-Object -FilePath $logFile -Append
    }
  }
  exit $LASTEXITCODE
}
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] nightly job finished" | Tee-Object -FilePath $logFile -Append
if (Test-Path -LiteralPath $notifyScript) {
  try {
    & $notifyScript -Status success -LogFile $logFile -ExitCode 0
  }
  catch {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] email notification failed: $($_.Exception.Message)" | Tee-Object -FilePath $logFile -Append
  }
}
