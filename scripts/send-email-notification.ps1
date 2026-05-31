param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("success", "failure")]
  [string]$Status,

  [Parameter(Mandatory = $true)]
  [string]$LogFile,

  [int]$ExitCode = 0
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) {
      continue
    }

    $pair = $trimmed -split "=", 2
    if ($pair.Count -ne 2) {
      continue
    }

    $key = $pair[0].Trim().TrimStart([char]0xFEFF)
    $value = $pair[1].Trim()
    $map[$key] = $value
  }

  return $map
}

function Get-Setting {
  param(
    [hashtable]$EnvMap,
    [string]$Name,
    [string]$Default = ""
  )

  $envValue = [Environment]::GetEnvironmentVariable($Name)
  if ($envValue) {
    return $envValue
  }

  if ($EnvMap.ContainsKey($Name) -and $EnvMap[$Name] -ne "") {
    return $EnvMap[$Name]
  }

  return $Default
}

$root = Split-Path -Parent $PSScriptRoot
$envMap = Read-DotEnv -Path (Join-Path $root ".env")

$enabled = (Get-Setting -EnvMap $envMap -Name "EMAIL_NOTIFY_ENABLED" -Default "false").ToLowerInvariant()
if ($enabled -notin @("1", "true", "yes", "on")) {
  exit 0
}

$smtpHost = Get-Setting -EnvMap $envMap -Name "EMAIL_SMTP_HOST"
$smtpPort = [int](Get-Setting -EnvMap $envMap -Name "EMAIL_SMTP_PORT" -Default "587")
$smtpUser = Get-Setting -EnvMap $envMap -Name "EMAIL_SMTP_USER"
$smtpPassword = Get-Setting -EnvMap $envMap -Name "EMAIL_SMTP_PASSWORD"
$smtpSecure = (Get-Setting -EnvMap $envMap -Name "EMAIL_SMTP_SECURE" -Default "true").ToLowerInvariant()
$from = Get-Setting -EnvMap $envMap -Name "EMAIL_FROM"
$to = Get-Setting -EnvMap $envMap -Name "EMAIL_TO"
$subjectPrefix = Get-Setting -EnvMap $envMap -Name "EMAIL_SUBJECT_PREFIX" -Default "[stock_anal]"

if ([string]::IsNullOrWhiteSpace($smtpHost) -or
    [string]::IsNullOrWhiteSpace($from) -or
    [string]::IsNullOrWhiteSpace($to)) {
  exit 0
}

$mail = New-Object System.Net.Mail.MailMessage
$mail.From = $from
$to.Split(",; ", [System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object {
  [void]$mail.To.Add($_)
}

$statusText = if ($Status -eq "success") { "completed" } else { "failed" }
$mail.Subject = "$subjectPrefix nightly job $statusText"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$tail = ""
if (Test-Path -LiteralPath $LogFile) {
  $tail = (Get-Content -LiteralPath $LogFile -Tail 40) -join [Environment]::NewLine
}

$mail.Body = @"
nightly job status: $Status
timestamp: $timestamp
exit code: $ExitCode
log file: $LogFile

recent log:
$tail
"@

$smtp = New-Object System.Net.Mail.SmtpClient($smtpHost, $smtpPort)
$smtp.EnableSsl = $smtpSecure -in @("1", "true", "yes", "on")

if (-not [string]::IsNullOrWhiteSpace($smtpUser)) {
  $smtp.Credentials = New-Object System.Net.NetworkCredential($smtpUser, $smtpPassword)
}

$smtp.Send($mail)
