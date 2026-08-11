[CmdletBinding()]
param(
  [ValidateSet('RepairAndLaunch', 'DiagnoseOnly', 'RollbackLast', 'SelfTest')]
  [string]$Mode = 'RepairAndLaunch',
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$sourceCore = Join-Path $PSScriptRoot 'Start-WinBridge-Recovery.ps1'
$runtimeCore = Join-Path $PSScriptRoot 'Start-WinBridge-Recovery.runtime.ps1'
$sourceMaintenance = Join-Path $PSScriptRoot 'Maintain-Launcher-State.ps1'
$runtimeMaintenance = Join-Path $PSScriptRoot 'Maintain-Launcher-State.runtime.ps1'
$pointerHelper = Join-Path $PSScriptRoot 'Repair-BrowserLatest.ps1'
$auditHelper = Join-Path $PSScriptRoot 'Audit-Launcher-Writes.ps1'
$storageConfig = Join-Path $PSScriptRoot 'Config\storage.ini'
$exitCode = 1
$auditStarted = $false

function Read-StorageConfiguration {
  $values = @{}
  if (Test-Path -LiteralPath $storageConfig -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $storageConfig -Encoding UTF8) {
      if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
        continue
      }
      $separator = $line.IndexOf('=')
      if ($separator -gt 0) {
        $values[$line.Substring(0, $separator).Trim()] =
          $line.Substring($separator + 1).Trim()
      }
    }
  }

  $backupRoot = [string]$values['backup_root']
  if ([string]::IsNullOrWhiteSpace($backupRoot)) {
    if (Test-Path -LiteralPath 'D:\' -PathType Container) {
      $backupRoot = 'D:\CodexPluginRepairBackups'
    } else {
      $backupRoot = Join-Path $PSScriptRoot 'Data\CodexPluginRepairBackups'
    }
  }

  if (-not [System.IO.Path]::IsPathRooted($backupRoot)) {
    throw "Backup root must be an absolute path: $backupRoot"
  }
  $backupRoot = [System.IO.Path]::GetFullPath($backupRoot).TrimEnd('\')
  if ($backupRoot -eq [System.IO.Path]::GetPathRoot($backupRoot).TrimEnd('\')) {
    throw "Backup root cannot be a drive root: $backupRoot"
  }
  if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  }
  return $backupRoot
}

function Write-ConfiguredCopy {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Replacement
  )

  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Required source script is missing: $Source"
  }
  $text = [System.IO.File]::ReadAllText($Source)
  $matches = [regex]::Matches($text, $Pattern)
  if ($matches.Count -ne 1) {
    throw "Expected exactly one configurable path in $Source; found $($matches.Count)."
  }
  $configured = [regex]::Replace($text, $Pattern, $Replacement, 1)
  $temporary = $Destination + '.new-' + [guid]::NewGuid().ToString('N')
  try {
    [System.IO.File]::WriteAllText(
      $temporary,
      $configured,
      (New-Object System.Text.UTF8Encoding($true)))
    Move-Item -LiteralPath $temporary -Destination $Destination -Force
  } finally {
    if (Test-Path -LiteralPath $temporary -PathType Leaf) {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  $backupRoot = Read-StorageConfiguration
  $escapedBackupRoot = $backupRoot.Replace("'", "''")
  $coreHashBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceCore).Hash

  Write-ConfiguredCopy `
    -Source $sourceCore `
    -Destination $runtimeCore `
    -Pattern '(?m)^\$script:BackupsRoot\s*=\s*''[^'']*''\s*$' `
    -Replacement ("`$script:BackupsRoot = '" + $escapedBackupRoot + "'")

  Write-ConfiguredCopy `
    -Source $sourceMaintenance `
    -Destination $runtimeMaintenance `
    -Pattern '(?m)^\$backupRoot\s*=\s*''[^'']*''\s*$' `
    -Replacement ("`$backupRoot = '" + $escapedBackupRoot + "'")

  Write-Output ('[INFO] Configured backup root: {0}' -f $backupRoot)

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

  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $runtimeCore -Mode $Mode -NoPause
  $coreExitCode = $LASTEXITCODE
  if ($coreExitCode -ne 0) {
    throw "The configured core launcher failed with exit code $coreExitCode."
  }

  if ($Mode -eq 'RepairAndLaunch') {
    Write-Output '[INFO] Core launcher completed. Appending Browser latest pointer repair.'
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $pointerHelper
    if ($LASTEXITCODE -ne 0) {
      throw "Browser latest repair failed with exit code $LASTEXITCODE."
    }
  }

  $coreHashAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceCore).Hash
  if ($coreHashAfter -ne $coreHashBefore) {
    throw 'Safety check failed: the original core launcher script changed during execution.'
  }
  Write-Output ('[OK] Original core launcher script remained unchanged: {0}' -f $coreHashAfter)

  if ($Mode -eq 'RepairAndLaunch' -and
      (Test-Path -LiteralPath $runtimeMaintenance -PathType Leaf)) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $runtimeMaintenance `
      -LauncherRoot $PSScriptRoot -PruneResourceMirrors -ResourceMirrorLimit 2
    if ($LASTEXITCODE -ne 0) {
      throw "Post-launch maintenance failed with exit code $LASTEXITCODE."
    }
  }
  $exitCode = 0
} catch {
  Write-Output ('[ERROR] Configured launcher failed: {0}' -f $_.Exception.Message)
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
