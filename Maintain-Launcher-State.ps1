[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LauncherRoot,

  [ValidateRange(5, 50)]
  [int]$SessionLimit = 20,

  [ValidateRange(2097152, 52428800)]
  [long]$MaxBytes = 10485760,

  [switch]$PruneResourceMirrors,

  [ValidateRange(1, 5)]
  [int]$ResourceMirrorLimit = 2
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Get-LongPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full.StartsWith('\\?\')) {
    return $full
  }
  if ($full.StartsWith('\\')) {
    return '\\?\UNC\' + $full.Substring(2)
  }
  return '\\?\' + $full
}

function Remove-FileLong {
  param([Parameter(Mandatory = $true)][string]$Path)
  $longPath = Get-LongPath $Path
  if (-not [System.IO.File]::Exists($longPath)) { return }
  [System.IO.File]::SetAttributes($longPath, [System.IO.FileAttributes]::Normal)
  [System.IO.File]::Delete($longPath)
}

function Remove-DirectoryTreeLong {
  param([Parameter(Mandatory = $true)][string]$Path)

  $rootLong = Get-LongPath $Path
  if (-not [System.IO.Directory]::Exists($rootLong)) { return }

  $directories = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push((New-Object System.IO.DirectoryInfo($rootLong)))

  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    [void]$directories.Add($current.FullName)

    foreach ($item in $current.EnumerateFileSystemInfos()) {
      $isReparsePoint = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
      if ($isReparsePoint) {
        if ($item -is [System.IO.DirectoryInfo]) {
          [System.IO.Directory]::Delete($item.FullName)
        } else {
          [System.IO.File]::SetAttributes($item.FullName, [System.IO.FileAttributes]::Normal)
          [System.IO.File]::Delete($item.FullName)
        }
        continue
      }

      if ($item -is [System.IO.DirectoryInfo]) {
        $stack.Push($item)
      } else {
        [System.IO.File]::SetAttributes($item.FullName, [System.IO.FileAttributes]::Normal)
        [System.IO.File]::Delete($item.FullName)
      }
    }
  }

  foreach ($directory in @($directories | Sort-Object { ([string]$_).Length } -Descending)) {
    [System.IO.Directory]::Delete([string]$directory)
  }
}

$logs = Join-Path $LauncherRoot 'Logs'

$groups = @{}
if (Test-Path -LiteralPath $logs -PathType Container) {
  Get-ChildItem -LiteralPath $logs -File -ErrorAction Stop | ForEach-Object {
    if ($_.Name -notmatch '^(?:run|diagnosis|preflight)-(.+)\.(?:log|json)$') {
      return
    }

    $session = $Matches[1]
    if (-not $groups.ContainsKey($session)) {
      $groups[$session] = New-Object System.Collections.ArrayList
    }
    [void]$groups[$session].Add($_)
  }
}

$sessions = @(
  foreach ($entry in $groups.GetEnumerator()) {
    $files = @($entry.Value)
    [pscustomobject]@{
      Id = [string]$entry.Key
      Files = $files
      LastWriteTime = ($files | Sort-Object LastWriteTime -Descending |
        Select-Object -First 1).LastWriteTime
      Bytes = [long](($files | Measure-Object Length -Sum).Sum)
    }
  }
) | Sort-Object LastWriteTime -Descending

$remove = New-Object System.Collections.ArrayList
if ($sessions.Count -gt $SessionLimit) {
  foreach ($session in @($sessions | Select-Object -Skip $SessionLimit)) {
    [void]$remove.Add($session)
  }
}

$kept = @($sessions | Select-Object -First $SessionLimit)
$keptBytes = [long](($kept | Measure-Object Bytes -Sum).Sum)
for ($index = $kept.Count - 1;
     $keptBytes -gt $MaxBytes -and $index -ge 3;
     $index--) {
  $session = $kept[$index]
  if (-not ($remove | Where-Object Id -EQ $session.Id)) {
    [void]$remove.Add($session)
    $keptBytes -= [long]$session.Bytes
  }
}

$removedFiles = 0
$removedBytes = 0L
$deferredLogFiles = New-Object System.Collections.ArrayList
foreach ($session in $remove) {
  foreach ($file in @($session.Files)) {
    if (-not (Test-Path -LiteralPath $file.FullName -PathType Leaf)) {
      continue
    }
    try {
      $removedBytes += [long]$file.Length
      Remove-FileLong $file.FullName
      $removedFiles++
    } catch {
      [void]$deferredLogFiles.Add($file.FullName)
      Write-Warning ("Log cleanup deferred because a file could not be removed: {0} ({1})" -f $file.FullName, $_.Exception.Message)
    }
  }
}

$remaining = @()
if (Test-Path -LiteralPath $logs -PathType Container) {
  $remaining = @(
    Get-ChildItem -LiteralPath $logs -File -ErrorAction Stop |
      Where-Object Name -Match '^(?:run|diagnosis|preflight)-(.+)\.(?:log|json)$'
  )
}
$remainingBytes = [long](($remaining | Measure-Object Length -Sum).Sum)
Write-Output (
  'Log retention: sessions<={0}, files={1}, bytes={2}, removed_files={3}, removed_bytes={4}, deferred_files={5}.' -f
  $SessionLimit,
  $remaining.Count,
  $remainingBytes,
  $removedFiles,
  $removedBytes,
  $deferredLogFiles.Count
)

$backupRoot = 'D:\CodexPluginRepairBackups'
if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
}

if ($PruneResourceMirrors) {
  $mirrorRoot = Join-Path $LauncherRoot 'R'
  if (Test-Path -LiteralPath $mirrorRoot -PathType Container) {
    $mirrors = @(
      Get-ChildItem -LiteralPath $mirrorRoot -Directory -Force |
        Where-Object {
          $_.Name -match '^p[0-9]+(?:-[0-9]+)*-(?:b[0-9a-f]+-)?c[0-9a-f]+-n[0-9a-f]+$' -and
          -not (Test-Path -LiteralPath (Join-Path $_.FullName '.incomplete'))
        } |
        Sort-Object LastWriteTimeUtc, Name -Descending
    )
    $activeMirror = $null
    if (Test-Path -LiteralPath $logs -PathType Container) {
      $latestDiagnosis = Get-ChildItem -LiteralPath $logs -File -Filter 'diagnosis-*.json' |
        Sort-Object LastWriteTimeUtc, Name -Descending |
        Select-Object -First 1
      if ($latestDiagnosis) {
        try {
          $diagnosis = Get-Content -Raw -LiteralPath $latestDiagnosis.FullName |
            ConvertFrom-Json
          $candidate = [string]$diagnosis.resourceMirrorRoot
          if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
            $activeMirror = [System.IO.Path]::GetFullPath($candidate).TrimEnd('\')
          }
        } catch {
          Write-Warning "Could not read the latest diagnosis mirror path: $($_.Exception.Message)"
        }
      }
    }

    $keep = New-Object System.Collections.ArrayList
    if ($activeMirror) {
      $activeItem = $mirrors | Where-Object {
        [System.IO.Path]::GetFullPath($_.FullName).TrimEnd('\') -eq $activeMirror
      } | Select-Object -First 1
      if ($activeItem) { [void]$keep.Add($activeItem) }
    }
    foreach ($mirror in $mirrors) {
      if ($keep.Count -ge $ResourceMirrorLimit) { break }
      if (-not ($keep | Where-Object FullName -EQ $mirror.FullName)) {
        [void]$keep.Add($mirror)
      }
    }

    $keepPaths = @($keep | ForEach-Object { $_.FullName })
    $obsolete = @($mirrors | Where-Object {
      $keepPaths -notcontains $_.FullName
    })
    $deferredMirrors = New-Object System.Collections.ArrayList
    $removedMirrors = 0

    foreach ($mirror in $obsolete) {
      $fullMirror = [System.IO.Path]::GetFullPath($mirror.FullName)
      $fullRoot = [System.IO.Path]::GetFullPath($mirrorRoot).TrimEnd('\') + '\'
      if (-not $fullMirror.StartsWith(
          $fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a resource mirror outside R: $fullMirror"
      }

      try {
        Remove-DirectoryTreeLong $fullMirror
        $removedMirrors++
      } catch {
        [void]$deferredMirrors.Add($fullMirror)
        Write-Warning ("Resource mirror cleanup deferred: {0} ({1})" -f $fullMirror, $_.Exception.Message)
      }
    }

    $remainingMirrors = @(
      Get-ChildItem -LiteralPath $mirrorRoot -Directory -Force |
        Where-Object Name -Match '^p[0-9]+(?:-[0-9]+)*-(?:b[0-9a-f]+-)?c[0-9a-f]+-n[0-9a-f]+$'
    )
    if ($remainingMirrors.Count -gt $ResourceMirrorLimit) {
      Write-Warning (
        'Resource mirror retention is temporarily above the requested limit because cleanup was deferred. remaining={0}, limit={1}, deferred={2}.' -f
        $remainingMirrors.Count, $ResourceMirrorLimit, $deferredMirrors.Count
      )
    }
    Write-Output (
      'Resource mirror retention: kept={0}, removed={1}, deferred={2}, limit={3}.' -f
      $remainingMirrors.Count, $removedMirrors, $deferredMirrors.Count, $ResourceMirrorLimit
    )
  }
}
