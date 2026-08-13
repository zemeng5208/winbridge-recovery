[CmdletBinding()]
param(
  [string]$CacheRoot = (Join-Path $env:USERPROFILE '.codex\plugins\cache\openai-bundled'),
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Write-Status {
  param(
    [ValidateSet('INFO', 'OK', 'WARN', 'ERROR')]
    [string]$Level,
    [string]$Message
  )

  Write-Output ('[{0}] Browser latest pointer: {1}' -f $Level, $Message)
}

function Get-NormalizedPath {
  param([string]$Path)

  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-ExistingItem {
  param([string]$LiteralPath)

  try {
    return Get-Item -LiteralPath $LiteralPath -Force -ErrorAction Stop
  } catch {
    return $null
  }
}

function Remove-PathSafely {
  param([string]$LiteralPath)

  $item = Get-ExistingItem -LiteralPath $LiteralPath
  if ($null -eq $item) {
    return
  }

  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    Remove-Item -LiteralPath $LiteralPath -Force -ErrorAction Stop
  } else {
    Remove-Item -LiteralPath $LiteralPath -Force -Recurse -ErrorAction Stop
  }
}

function Get-BrowserVersionDirectory {
  param([string]$BrowserRoot)

  $candidates = @()
  foreach ($directory in @(Get-ChildItem -LiteralPath $BrowserRoot -Directory -Force)) {
    if ($directory.Name -eq 'latest' -or
        $directory.Name -like '.latest-*' -or
        $directory.Name -like '*.safe-*' -or
        $directory.Name -like '*.staging-*') {
      continue
    }

    $manifestPath = Join-Path $directory.FullName '.codex-plugin\plugin.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
      continue
    }

    try {
      $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
      if ([string]$manifest.name -ne 'browser') {
        continue
      }

      $version = New-Object System.Version ([string]$manifest.version)
      $candidates += [pscustomobject]@{
        Directory = $directory
        Version = $version
      }
    } catch {
      continue
    }
  }

  if ($candidates.Count -eq 0) {
    throw "No complete Browser version directory was found under: $BrowserRoot"
  }

  return ($candidates |
      Sort-Object -Property Version -Descending |
      Select-Object -First 1).Directory
}

function Test-BrowserLatest {
  param(
    [string]$LatestPath,
    [string]$ExpectedTarget
  )

  $latest = Get-ExistingItem -LiteralPath $LatestPath
  if ($null -eq $latest) {
    return $false
  }
  if ($latest.LinkType -ne 'Junction') {
    return $false
  }

  $targets = @($latest.Target)
  if ($targets.Count -ne 1) {
    return $false
  }

  return (Get-NormalizedPath -Path ([string]$targets[0])) -eq
    (Get-NormalizedPath -Path $ExpectedTarget)
}

$browserRoot = Join-Path $CacheRoot 'browser'
$latestPath = Join-Path $browserRoot 'latest'

try {
  if (-not (Test-Path -LiteralPath $browserRoot -PathType Container)) {
    throw "Browser plugin cache is missing: $browserRoot"
  }

  $versionDirectory = Get-BrowserVersionDirectory -BrowserRoot $browserRoot
  $expectedTarget = $versionDirectory.FullName

  if (Test-BrowserLatest -LatestPath $latestPath -ExpectedTarget $expectedTarget) {
    Write-Status -Level OK -Message ("already points to {0}" -f $versionDirectory.Name)
    exit 0
  }

  if ($VerifyOnly) {
    Write-Status -Level WARN -Message ("missing or stale; expected {0}" -f $versionDirectory.Name)
    exit 2
  }

  $token = [guid]::NewGuid().ToString('N')
  $stagedPath = Join-Path $browserRoot ('.latest-new-' + $token)
  $rollbackPath = Join-Path $browserRoot ('.latest-old-' + $token)
  $movedExisting = $false

  try {
    [void](New-Item -ItemType Junction -Path $stagedPath -Target $expectedTarget)
    if (-not (Test-BrowserLatest -LatestPath $stagedPath -ExpectedTarget $expectedTarget)) {
      throw 'The staged Browser latest junction did not pass verification.'
    }

    $existing = Get-ExistingItem -LiteralPath $latestPath
    if ($null -ne $existing) {
      Move-Item -LiteralPath $latestPath -Destination $rollbackPath -ErrorAction Stop
      $movedExisting = $true
    }

    Move-Item -LiteralPath $stagedPath -Destination $latestPath -ErrorAction Stop
    if (-not (Test-BrowserLatest -LatestPath $latestPath -ExpectedTarget $expectedTarget)) {
      throw 'The installed Browser latest junction did not pass verification.'
    }

    if ($movedExisting -and $null -ne (Get-ExistingItem -LiteralPath $rollbackPath)) {
      Remove-PathSafely -LiteralPath $rollbackPath
    }
  } catch {
    if ($null -ne (Get-ExistingItem -LiteralPath $stagedPath)) {
      try {
        Remove-PathSafely -LiteralPath $stagedPath
      } catch {
      }
    }
    if ($movedExisting -and
        $null -eq (Get-ExistingItem -LiteralPath $latestPath) -and
        $null -ne (Get-ExistingItem -LiteralPath $rollbackPath)) {
      Move-Item -LiteralPath $rollbackPath -Destination $latestPath -ErrorAction SilentlyContinue
    }
    throw
  }

  Write-Status -Level OK -Message ("repaired and verified -> {0}" -f $versionDirectory.Name)
  exit 0
} catch {
  Write-Status -Level ERROR -Message $_.Exception.Message
  exit 1
}
