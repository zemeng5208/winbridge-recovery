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
$accessGuard = Join-Path $PSScriptRoot 'WinBridge-4.0-AccessGuard.ps1'
$storageConfig = Join-Path $PSScriptRoot 'Config\storage.ini'
$exitCode = 1
$auditStarted = $false
$coreStarted = $false

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

function Apply-V4RuntimePatches {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Runtime core is missing before 4.0 patching: $Path"
  }

  $text = [System.IO.File]::ReadAllText($Path)
  $installMarker = 'function Install-DirectoryAtomically {'
  $installMarkerCount = [regex]::Matches($text, [regex]::Escape($installMarker)).Count
  if ($installMarkerCount -ne 1) {
    throw "WinBridge 4.0 runtime patch expected one Install-DirectoryAtomically function; found $installMarkerCount."
  }

  $retryHelper = @'
function Invoke-V4MoveItemWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$Operation = 'atomic directory move',
    [ValidateRange(1, 10)][int]$Attempts = 6
  )

  $delays = @(250, 500, 1000, 1500, 2500)
  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
      if ($attempt -gt 1) {
        Write-Log ("WinBridge 4.0 retry succeeded for {0} on attempt {1}/{2}." -f $Operation, $attempt, $Attempts) 'OK'
      }
      return
    } catch {
      if ($attempt -ge $Attempts) {
        Write-Log ("WinBridge 4.0 retry exhausted for {0}: {1}" -f $Operation, $_.Exception.Message) 'ERROR'
        throw
      }
      $delayIndex = [Math]::Min($attempt - 1, $delays.Count - 1)
      $delay = [int]$delays[$delayIndex]
      Write-Log ("WinBridge 4.0 transient move failure for {0} (attempt {1}/{2}): {3}. Retrying in {4} ms." -f $Operation, $attempt, $Attempts, $_.Exception.Message, $delay) 'WARN'
      Start-Sleep -Milliseconds $delay
    }
  }
}

'@

  $text = $text.Replace($installMarker, $retryHelper + $installMarker)

  $replacements = @(
    [pscustomobject]@{
      Old = 'Move-Item -LiteralPath $TargetDirectory -Destination $old'
      New = "Invoke-V4MoveItemWithRetry -Source `$TargetDirectory -Destination `$old -Operation 'target-to-old swap'"
      Expected = 1
    },
    [pscustomobject]@{
      Old = 'Move-Item -LiteralPath $PreparedDirectory -Destination $TargetDirectory'
      New = "Invoke-V4MoveItemWithRetry -Source `$PreparedDirectory -Destination `$TargetDirectory -Operation 'prepared-to-target swap'"
      Expected = 1
    },
    [pscustomobject]@{
      Old = 'Move-Item -LiteralPath $old -Destination $TargetDirectory'
      New = "Invoke-V4MoveItemWithRetry -Source `$old -Destination `$TargetDirectory -Operation 'swap rollback restore'"
      Expected = 1
    },
    [pscustomobject]@{
      Old = 'Move-Item -LiteralPath $TargetPath -Destination $old'
      New = "Invoke-V4MoveItemWithRetry -Source `$TargetPath -Destination `$old -Operation 'atomic removal staging'"
      Expected = 1
    },
    [pscustomobject]@{
      Old = 'Move-Item -LiteralPath $record.old -Destination $record.target'
      New = "Invoke-V4MoveItemWithRetry -Source `$record.old -Destination `$record.target -Operation 'automatic directory rollback'"
      Expected = 1
    }
  )

  foreach ($replacement in $replacements) {
    $count = [regex]::Matches($text, [regex]::Escape([string]$replacement.Old)).Count
    if ($count -ne [int]$replacement.Expected) {
      throw ("WinBridge 4.0 runtime patch expected {0} occurrence(s) of [{1}], found {2}. Refusing to patch an unknown core layout." -f $replacement.Expected, $replacement.Old, $count)
    }
    $text = $text.Replace([string]$replacement.Old, [string]$replacement.New)
  }

  [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($true)))
  Write-Output '[INFO] WinBridge 4.0 runtime patch applied: atomic directory moves use bounded retry without changing the original core script.'
}

function Invoke-AccessGuard {
  param(
    [ValidateSet('Preflight', 'Diagnose', 'PostFailure')]
    [string]$GuardMode,
    [switch]$BlockOnRisk
  )

  if (-not (Test-Path -LiteralPath $accessGuard -PathType Leaf)) {
    Write-Output '[WARN] WinBridge 4.0 Access Guard is missing; continuing with the existing core safety checks.'
    return
  }

  Write-Output ('[INFO] Running WinBridge 4.0 Access Guard: {0}' -f $GuardMode)
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $accessGuard `
    -Mode $GuardMode -LauncherRoot $PSScriptRoot
  $guardExitCode = $LASTEXITCODE

  if ($BlockOnRisk) {
    if ($guardExitCode -eq 20) {
      throw 'Access Guard stopped repair because ChatGPT/Codex Desktop is still running. Close it completely and run WinBridge again.'
    }
    if ($guardExitCode -eq 21) {
      throw 'Access Guard stopped repair because Restart Manager reported a process holding a repair target open. Review the generated access-guard report before retrying.'
    }
    if ($guardExitCode -eq 22) {
      Write-Output '[WARN] Access Guard could not complete the full preflight. The existing WinBridge core safety checks will still run.'
      return
    }
  }

  if ($guardExitCode -ne 0) {
    Write-Output ('[WARN] Access Guard returned exit code {0}; continuing because this mode is diagnostic-only.' -f $guardExitCode)
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

  Apply-V4RuntimePatches -Path $runtimeCore

  Write-ConfiguredCopy `
    -Source $sourceMaintenance `
    -Destination $runtimeMaintenance `
    -Pattern '(?m)^\$backupRoot\s*=\s*''[^'']*''\s*$' `
    -Replacement ("`$backupRoot = '" + $escapedBackupRoot + "'")

  Write-Output ('[INFO] Configured backup root: {0}' -f $backupRoot)

  if ($Mode -eq 'RepairAndLaunch') {
    Invoke-AccessGuard -GuardMode Preflight -BlockOnRisk
  } elseif ($Mode -eq 'DiagnoseOnly') {
    Invoke-AccessGuard -GuardMode Diagnose
  }

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

  $coreStarted = $true
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
  if ($coreStarted -and (Test-Path -LiteralPath $accessGuard -PathType Leaf)) {
    try {
      Invoke-AccessGuard -GuardMode PostFailure
      Write-Output '[INFO] A post-failure Access Guard report was generated. Review it together with the run log.'
    } catch {
      Write-Output ('[WARN] Post-failure Access Guard collection failed: {0}' -f $_.Exception.Message)
    }
  }
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
