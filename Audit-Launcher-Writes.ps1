[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Begin', 'Complete')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$LauncherRoot,

  [string]$RunId = '',

  [ValidateRange(1, 10)]
  [int]$HistoryLimit = 3
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$stateRoot = Join-Path $LauncherRoot 'State'
$documentationRoot = Join-Path $LauncherRoot 'Documentation'
$historyRoot = Join-Path $stateRoot 'write-audit-history'
$pendingPath = Join-Path $stateRoot 'write-audit-pending.json'
$markdownPath = Join-Path $documentationRoot 'C-Drive-Write-Audit.md'

foreach ($path in @($stateRoot, $documentationRoot, $historyRoot)) {
  if (-not (Test-Path -LiteralPath $path -PathType Container)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

if ([string]::IsNullOrWhiteSpace($RunId)) {
  $RunId = Get-Date -Format 'yyyyMMdd-HHmmss'
}

$codexHome = Join-Path $env:USERPROFILE '.codex'
$localOpenAI = Join-Path $env:LOCALAPPDATA 'OpenAI'
$scopes = @(
  [pscustomobject]@{ Label = 'Codex user configuration'; Path = (Join-Path $codexHome 'config.toml'); Kind = 'File' }
  [pscustomobject]@{ Label = 'Bundled marketplace'; Path = (Join-Path $codexHome '.tmp\bundled-marketplaces\openai-bundled'); Kind = 'Directory' }
  [pscustomobject]@{ Label = 'Bundled plugin cache'; Path = (Join-Path $codexHome 'plugins\cache\openai-bundled'); Kind = 'Directory' }
  [pscustomobject]@{ Label = 'Plugin app-server'; Path = (Join-Path $codexHome 'plugins\.plugin-appserver'); Kind = 'Directory' }
  [pscustomobject]@{ Label = 'Sandbox helpers'; Path = (Join-Path $codexHome '.sandbox-bin'); Kind = 'Directory' }
  [pscustomobject]@{ Label = 'OpenAI Codex runtime'; Path = (Join-Path $localOpenAI 'Codex'); Kind = 'Directory' }
  [pscustomobject]@{ Label = 'Chrome native host manifest'; Path = (Join-Path $localOpenAI 'extension\com.openai.codexextension.json'); Kind = 'File' }
  [pscustomobject]@{ Label = 'Chrome native host v2'; Path = (Join-Path $codexHome 'chrome-native-hosts-v2.json'); Kind = 'File' }
)

function Get-Snapshot {
  $records = New-Object System.Collections.ArrayList
  foreach ($scope in $scopes) {
    if ($scope.Kind -eq 'File') {
      if (Test-Path -LiteralPath $scope.Path -PathType Leaf) {
        $item = Get-Item -LiteralPath $scope.Path -Force
        [void]$records.Add([pscustomobject]@{
          scope = $scope.Label
          path = $item.FullName
          length = [long]$item.Length
          modifiedUtc = $item.LastWriteTimeUtc.ToString('o')
        })
      }
      continue
    }
    if (-not (Test-Path -LiteralPath $scope.Path -PathType Container)) {
      continue
    }
    Get-ChildItem -LiteralPath $scope.Path -File -Recurse -Force -ErrorAction SilentlyContinue |
      ForEach-Object {
        [void]$records.Add([pscustomobject]@{
          scope = $scope.Label
          path = $_.FullName
          length = [long]$_.Length
          modifiedUtc = $_.LastWriteTimeUtc.ToString('o')
        })
      }
  }
  return @($records)
}

function Write-JsonUtf8 {
  param([string]$Path, [object]$Value)
  $json = $Value | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText(
    $Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

if ($Action -eq 'Begin') {
  Write-JsonUtf8 $pendingPath ([ordered]@{
    runId = $RunId
    startedAt = [DateTime]::UtcNow.ToString('o')
    scopes = $scopes
    files = @(Get-Snapshot)
  })
  Write-Output "Write audit started: $RunId"
  exit 0
}

if (-not (Test-Path -LiteralPath $pendingPath -PathType Leaf)) {
  Write-Output 'Write audit complete skipped: no pending snapshot.'
  exit 0
}

$before = Get-Content -Raw -LiteralPath $pendingPath | ConvertFrom-Json
$after = @(Get-Snapshot)
$beforeMap = @{}
foreach ($item in @($before.files)) { $beforeMap[[string]$item.path] = $item }
$afterMap = @{}
foreach ($item in $after) { $afterMap[[string]$item.path] = $item }

$changes = New-Object System.Collections.ArrayList
foreach ($path in @($beforeMap.Keys + $afterMap.Keys | Sort-Object -Unique)) {
  $old = $beforeMap[$path]
  $new = $afterMap[$path]
  $kind = $null
  $scope = ''
  if ($null -eq $old) {
    $kind = 'Created'
    $scope = [string]$new.scope
  } elseif ($null -eq $new) {
    $kind = 'Removed'
    $scope = [string]$old.scope
  } elseif ([long]$old.length -ne [long]$new.length -or
      [string]$old.modifiedUtc -ne [string]$new.modifiedUtc) {
    $kind = 'Modified'
    $scope = [string]$new.scope
  }
  if ($kind) {
    [void]$changes.Add([pscustomobject]@{
      kind = $kind
      scope = $scope
      path = $path
    })
  }
}

$entryPath = Join-Path $historyRoot (
  '{0}-{1}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $before.runId)
Write-JsonUtf8 $entryPath ([ordered]@{
  runId = [string]$before.runId
  startedAt = [string]$before.startedAt
  completedAt = [DateTime]::UtcNow.ToString('o')
  changes = @($changes)
})
Remove-Item -LiteralPath $pendingPath -Force

$history = @(
  Get-ChildItem -LiteralPath $historyRoot -File -Filter '*.json' |
    Sort-Object LastWriteTimeUtc, Name -Descending
)
foreach ($old in @($history | Select-Object -Skip $HistoryLimit)) {
  Remove-Item -LiteralPath $old.FullName -Force
}
$history = @($history | Select-Object -First $HistoryLimit)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# C Drive Write Audit')
$lines.Add('')
$lines.Add('This document is generated by WinBridge Recovery. It records only the newest three launcher runs.')
$lines.Add('')
$lines.Add('## Allowed write scopes')
$lines.Add('')
foreach ($scope in $scopes) {
  $lines.Add(('- `{0}`: `{1}`' -f $scope.Label, $scope.Path))
}
$lines.Add('')
$lines.Add('The launcher does not patch or take ownership of `C:\Program Files\WindowsApps`.')

foreach ($file in $history) {
  $entry = Get-Content -Raw -LiteralPath $file.FullName | ConvertFrom-Json
  $lines.Add('')
  $lines.Add(('## Run {0}' -f $entry.runId))
  $lines.Add('')
  $lines.Add(('- Started: `{0}`' -f $entry.startedAt))
  $lines.Add(('- Completed: `{0}`' -f $entry.completedAt))
  $entryChanges = @($entry.changes)
  $lines.Add(('- Changed files: `{0}`' -f $entryChanges.Count))
  $lines.Add('')
  if ($entryChanges.Count -eq 0) {
    $lines.Add('No file changes were detected inside the allowed scopes.')
  } else {
    foreach ($change in $entryChanges) {
      $lines.Add(('- **{0}** [{1}] `{2}`' -f
        $change.kind, $change.scope, $change.path))
    }
  }
}

[System.IO.File]::WriteAllLines(
  $markdownPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output (
  'Write audit complete: changes={0}, history={1}, report={2}' -f
  $changes.Count, $history.Count, $markdownPath)
