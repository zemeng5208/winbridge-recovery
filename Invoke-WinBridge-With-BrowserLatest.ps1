[CmdletBinding()]
param(
  [ValidateSet('RepairAndLaunch', 'DiagnoseOnly')]
  [string]$Mode = 'RepairAndLaunch',
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$coreScript = Join-Path $PSScriptRoot 'Start-WinBridge-Recovery.ps1'
$pointerHelper = Join-Path $PSScriptRoot 'Repair-BrowserLatest.ps1'
$auditHelper = Join-Path $PSScriptRoot 'Audit-Launcher-Writes.ps1'
$maintenanceHelper = Join-Path $PSScriptRoot 'Maintain-Launcher-State.ps1'
$exitCode = 1
$auditStarted = $false

try {
  if (-not (Test-Path -LiteralPath $coreScript -PathType Leaf)) {
    throw "Core launcher script was not found: $coreScript"
  }
  if (-not (Test-Path -LiteralPath $pointerHelper -PathType Leaf)) {
    throw "Browser latest helper was not found: $pointerHelper"
  }

  $coreHashBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $coreScript).Hash

  if ($Mode -eq 'RepairAndLaunch' -and
      (Test-Path -LiteralPath $auditHelper -PathType Leaf)) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $auditHelper `
      -Action Begin -LauncherRoot $PSScriptRoot
    if ($LASTEXITCODE -ne 0) {
      throw "Write audit initialization failed with exit code $LASTEXITCODE."
    }
    $auditStarted = $true
  }

  if ($Mode -eq 'DiagnoseOnly') {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $pointerHelper -VerifyOnly
    if ($LASTEXITCODE -eq 2) {
      Write-Output '[WARN] Diagnose only: Browser latest needs repair; no pointer was changed.'
    } elseif ($LASTEXITCODE -ne 0) {
      throw "Browser latest verification failed with exit code $LASTEXITCODE."
    }
  }

  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $coreScript -Mode $Mode -NoPause
  $coreExitCode = $LASTEXITCODE
  if ($coreExitCode -ne 0) {
    throw "The unchanged core launcher failed with exit code $coreExitCode."
  }

  if ($Mode -eq 'RepairAndLaunch') {
    Write-Output '[INFO] Core launcher completed. Appending Browser latest pointer repair.'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $pointerHelper
    if ($LASTEXITCODE -ne 0) {
      throw "Browser latest repair failed with exit code $LASTEXITCODE."
    }
  }

  $coreHashAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $coreScript).Hash
  if ($coreHashAfter -ne $coreHashBefore) {
    throw 'Safety check failed: the core launcher script changed during execution.'
  }

  Write-Output ('[OK] Core launcher script remained unchanged: {0}' -f $coreHashAfter)
  if ($Mode -eq 'RepairAndLaunch' -and
      (Test-Path -LiteralPath $maintenanceHelper -PathType Leaf)) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $maintenanceHelper `
      -LauncherRoot $PSScriptRoot -PruneResourceMirrors -ResourceMirrorLimit 2
    if ($LASTEXITCODE -ne 0) {
      throw "Post-launch maintenance failed with exit code $LASTEXITCODE."
    }
  }
  $exitCode = 0
} catch {
  Write-Output ('[ERROR] Companion launcher failed: {0}' -f $_.Exception.Message)
  $exitCode = 1
} finally {
  if ($auditStarted -and (Test-Path -LiteralPath $auditHelper -PathType Leaf)) {
    try {
      & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $auditHelper `
        -Action Complete -LauncherRoot $PSScriptRoot
      if ($LASTEXITCODE -ne 0) {
        Write-Output ('[WARN] Write audit completion returned exit code {0}.' -f $LASTEXITCODE)
      }
    } catch {
      Write-Output ('[WARN] Write audit completion failed: {0}' -f $_.Exception.Message)
    }
  }
}

if (-not $NoPause) {
  [void](Read-Host 'Press Enter to close')
}

exit $exitCode
