[CmdletBinding()]
param(
  [ValidateSet('RepairAndLaunch', 'DiagnoseOnly', 'RollbackLast', 'SelfTest')]
  [string]$Mode = 'RepairAndLaunch',
  [switch]$NoPause
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolVersion = '3.1.1'
$script:ToolRoot = $PSScriptRoot
$script:LogsRoot = Join-Path $script:ToolRoot 'Logs'
$script:BackupsRoot = 'D:\CodexPluginRepairBackups'
$script:MaxRetainedBackups = 3
$script:LegacyLauncherRoot = $null
$script:StateRoot = Join-Path $script:ToolRoot 'State'
$script:StatePath = Join-Path $script:StateRoot 'launcher-state.json'
$script:PendingTransactionPath = Join-Path $script:StateRoot 'pending-transaction.json'
$script:RunId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$script:LogPath = $null
$script:CreatedPaths = New-Object System.Collections.ArrayList
$script:SwapRecords = New-Object System.Collections.ArrayList
$script:LauncherMutex = $null
$script:LauncherMutexAcquired = $false

function New-Directory {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    [System.IO.Directory]::CreateDirectory((Get-LongPath $Path)) | Out-Null
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Initialize-Logging {
  New-Directory $script:LogsRoot | Out-Null
  $script:LogPath = Join-Path $script:LogsRoot ("run-{0}.log" -f $script:RunId)
  [System.IO.File]::WriteAllText($script:LogPath, '', (New-Object System.Text.UTF8Encoding($true)))
}

function Acquire-LauncherMutex {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value.Replace('-', '_')
  $name = 'Local\ChatGPTPluginSafeLauncher_' + $sid
  $script:LauncherMutex = New-Object System.Threading.Mutex($false, $name)
  try {
    $script:LauncherMutexAcquired = $script:LauncherMutex.WaitOne(0, $false)
  } catch [System.Threading.AbandonedMutexException] {
    $script:LauncherMutexAcquired = $true
  }
  if (-not $script:LauncherMutexAcquired) {
    throw 'Another launcher instance is already running.'
  }
}

function Write-Log {
  param(
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet('INFO', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO'
  )
  $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Level, $Message
  Write-Host $line
  if ($script:LogPath) {
    [System.IO.File]::AppendAllText($script:LogPath, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  }
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value
  )
  New-Directory (Split-Path -Parent $Path) | Out-Null
  $json = ($Value | ConvertTo-Json -Depth 40) + [Environment]::NewLine
  [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-JsonFileAtomic {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value
  )
  $parent = New-Directory (Split-Path -Parent $Path)
  $temporary = Join-Path $parent ('.json-write-' + $script:RunId + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $previous = $temporary + '.previous'
  $json = ($Value | ConvertTo-Json -Depth 40) + [Environment]::NewLine
  try {
    [System.IO.File]::WriteAllText($temporary, $json, (New-Object System.Text.UTF8Encoding($false)))
    if ([System.IO.File]::Exists($Path)) {
      [System.IO.File]::Replace($temporary, $Path, $previous, $true)
      if ([System.IO.File]::Exists($previous)) { try { [System.IO.File]::Delete($previous) } catch { } }
    } else {
      [System.IO.File]::Move($temporary, $Path)
    }
  } finally {
    if ([System.IO.File]::Exists($temporary)) { try { [System.IO.File]::Delete($temporary) } catch { } }
    if ([System.IO.File]::Exists($previous)) { try { [System.IO.File]::Delete($previous) } catch { } }
  }
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  return (Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json)
}

function Set-ObjectProperty {
  param(
    [Parameter(Mandatory = $true)][object]$Object,
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowNull()][object]$Value
  )
  if ($Object.PSObject.Properties[$Name]) {
    $Object.$Name = $Value
  } else {
    $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
  }
}

function Write-Utf8File {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  New-Directory (Split-Path -Parent $Path) | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

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

function New-ShortSiblingPath {
  param(
    [Parameter(Mandatory = $true)][string]$Parent,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9]{1,4}$')][string]$Prefix
  )
  $parentFull = [System.IO.Path]::GetFullPath($Parent)
  do {
    $candidate = Join-Path $parentFull ('.' + $Prefix.ToLowerInvariant() + '-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
  } while (Test-Path -LiteralPath $candidate)
  return $candidate
}

function Get-DirectoryFileRecords {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [ValidateSet('Error', 'Skip')][string]$ReparsePointBehavior = 'Skip'
  )
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  $rootLong = (Get-LongPath $rootFull).TrimEnd('\')
  if (-not [System.IO.Directory]::Exists($rootLong)) {
    throw "Directory is missing: $rootFull"
  }
  $files = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push((New-Object System.IO.DirectoryInfo($rootLong)))
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    foreach ($item in $current.EnumerateFileSystemInfos()) {
      $isReparsePoint = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
      if ($isReparsePoint) {
        if ($ReparsePointBehavior -eq 'Error') {
          throw "Unexpected reparse point in directory tree: $($item.FullName)"
        }
        continue
      }
      if ($item -is [System.IO.DirectoryInfo]) {
        $stack.Push($item)
        continue
      }
      $relative = $item.FullName.Substring($rootLong.Length).TrimStart('\')
      [void]$files.Add([pscustomobject]@{
        Path = $item.FullName
        Relative = $relative
        Length = [int64]$item.Length
      })
    }
  }
  return @($files)
}

function Get-DirectoryRelativeDirectories {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [ValidateSet('Error', 'Skip')][string]$ReparsePointBehavior = 'Skip'
  )
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  $rootLong = (Get-LongPath $rootFull).TrimEnd('\')
  if (-not [System.IO.Directory]::Exists($rootLong)) {
    throw "Directory is missing: $rootFull"
  }
  $directories = New-Object System.Collections.ArrayList
  $stack = New-Object System.Collections.Stack
  $stack.Push((New-Object System.IO.DirectoryInfo($rootLong)))
  while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    foreach ($item in $current.EnumerateFileSystemInfos()) {
      $isReparsePoint = (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
      if ($isReparsePoint) {
        if ($ReparsePointBehavior -eq 'Error') {
          throw "Unexpected reparse point in directory tree: $($item.FullName)"
        }
        continue
      }
      if ($item -is [System.IO.DirectoryInfo]) {
        [void]$directories.Add($item.FullName.Substring($rootLong.Length).TrimStart('\'))
        $stack.Push($item)
      }
    }
  }
  return @($directories)
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

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  $stream = $null
  $sha = $null
  try {
    $stream = New-Object System.IO.FileStream(
      (Get-LongPath $Path),
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
    )
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '')
  } finally {
    if ($sha) { $sha.Dispose() }
    if ($stream) { $stream.Dispose() }
  }
}

function Get-ContentDirectoryHash {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string[]]$RelativePaths
  )
  $payload = $null
  $sha = $null
  try {
    $payload = New-Object System.IO.MemoryStream
    foreach ($relativePath in $RelativePaths) {
      $fullPath = Join-Path $Root $relativePath
      if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Content-hash input is missing: $fullPath"
      }
      $nameBytes = [System.Text.Encoding]::UTF8.GetBytes($relativePath)
      $payload.Write($nameBytes, 0, $nameBytes.Length)
      $payload.WriteByte(0)
      $fileHash = (Get-FileSha256 $fullPath).ToLowerInvariant()
      $hashBytes = [System.Text.Encoding]::UTF8.GetBytes($fileHash)
      $payload.Write($hashBytes, 0, $hashBytes.Length)
      $payload.WriteByte(0)
    }
    $payload.Position = 0
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = ([System.BitConverter]::ToString($sha.ComputeHash($payload))).Replace('-', '').ToLowerInvariant()
    return $hash.Substring(0, 16)
  } finally {
    if ($sha) { $sha.Dispose() }
    if ($payload) { $payload.Dispose() }
  }
}

function Copy-FileBytesVerified {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Copy source file is missing: $Source"
  }
  New-Directory (Split-Path -Parent $Destination) | Out-Null
  $input = $null
  $output = $null
  try {
    $input = New-Object System.IO.FileStream(
      (Get-LongPath $Source),
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
    )
    $output = New-Object System.IO.FileStream(
      (Get-LongPath $Destination),
      [System.IO.FileMode]::Create,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    $buffer = New-Object byte[] (4MB)
    while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $output.Write($buffer, 0, $read)
    }
    $output.Flush($true)
  } finally {
    if ($output) { $output.Dispose() }
    if ($input) { $input.Dispose() }
  }
  $sourceHash = Get-FileSha256 $Source
  $destinationHash = Get-FileSha256 $Destination
  if ($sourceHash -ne $destinationHash) {
    throw "SHA-256 mismatch after copying: $Destination"
  }
}

function Remove-PathSafely {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$AllowedRoots
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  $allowed = $false
  foreach ($root in $AllowedRoots) {
    $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
    if ($full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      $allowed = $true
      break
    }
  }
  if (-not $allowed) {
    throw "Refusing to remove a path outside approved roots: $full"
  }
  $item = Get-Item -Force -LiteralPath $full
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    if ($item.PSIsContainer) {
      [System.IO.Directory]::Delete($item.FullName)
    } else {
      [System.IO.File]::Delete($item.FullName)
    }
    return
  }
  if ($item.PSIsContainer) {
    Remove-DirectoryTreeLong $item.FullName
  } else {
    [System.IO.File]::SetAttributes((Get-LongPath $item.FullName), [System.IO.FileAttributes]::Normal)
    [System.IO.File]::Delete((Get-LongPath $item.FullName))
  }
}

function Register-TransientPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )
  [void]$script:CreatedPaths.Add([pscustomobject]@{ path = $Path; allowedRoot = $AllowedRoot })
}

function Remove-TransientPaths {
  foreach ($entry in $script:CreatedPaths) {
    if (Test-Path -LiteralPath $entry.path) {
      try { Remove-PathSafely ([string]$entry.path) @([string]$entry.allowedRoot) } catch { }
    }
  }
  $script:CreatedPaths.Clear()
}

function Copy-DirectoryVerified {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [switch]$SkipReparsePoints
  )
  if (-not [System.IO.Directory]::Exists((Get-LongPath $Source))) {
    throw "Copy source directory is missing: $Source"
  }
  New-Directory $Destination | Out-Null
  $behavior = if ($SkipReparsePoints) { 'Skip' } else { 'Error' }
  foreach ($relativeDirectory in @(Get-DirectoryRelativeDirectories $Source $behavior)) {
    New-Directory (Join-Path $Destination ([string]$relativeDirectory)) | Out-Null
  }
  $files = @(Get-DirectoryFileRecords $Source $behavior)
  foreach ($file in $files) {
    Copy-FileBytesVerified ([string]$file.Path) (Join-Path $Destination ([string]$file.Relative))
  }
  foreach ($file in $files) {
    $relative = [string]$file.Relative
    $target = Join-Path $Destination $relative
    if (-not [System.IO.File]::Exists((Get-LongPath $target))) {
      throw "Copied file is missing during verification: $target"
    }
    if ((Get-FileSha256 ([string]$file.Path)) -ne (Get-FileSha256 $target)) {
      throw "Copied file hash mismatch: $target"
    }
  }
}

function Get-DirectoryDifferences {
  param(
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Actual,
    [switch]$AllowExtra,
    [string[]]$IgnoreRelativePaths = @()
  )
  $differences = New-Object System.Collections.ArrayList
  $ignored = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($ignoredPath in $IgnoreRelativePaths) { [void]$ignored.Add([string]$ignoredPath) }
  if (-not [System.IO.Directory]::Exists((Get-LongPath $Expected))) {
    [void]$differences.Add("expected directory missing: $Expected")
    return @($differences)
  }
  if (-not [System.IO.Directory]::Exists((Get-LongPath $Actual))) {
    [void]$differences.Add("actual directory missing: $Actual")
    return @($differences)
  }
  $actualRoot = [System.IO.Path]::GetFullPath($Actual).TrimEnd('\')
  $expectedFiles = @{}
  foreach ($file in @(Get-DirectoryFileRecords $Expected Skip)) {
    $relative = [string]$file.Relative
    if ($ignored.Contains($relative)) { continue }
    $expectedFiles[$relative] = [string]$file.Path
    $actualFile = Join-Path $actualRoot $relative
    if (-not [System.IO.File]::Exists((Get-LongPath $actualFile))) {
      [void]$differences.Add("missing: $relative")
    } elseif ((Get-FileSha256 ([string]$file.Path)) -ne (Get-FileSha256 $actualFile)) {
      [void]$differences.Add("hash: $relative")
    }
  }
  if (-not $AllowExtra) {
    foreach ($file in @(Get-DirectoryFileRecords $actualRoot Skip)) {
      $relative = [string]$file.Relative
      if ($ignored.Contains($relative)) { continue }
      if (-not $expectedFiles.ContainsKey($relative)) {
        [void]$differences.Add("extra: $relative")
      }
    }
  }
  return @($differences)
}

function Get-PluginVariantFiles {
  param([Parameter(Mandatory = $true)][string]$PluginName)
  switch ($PluginName) {
    'browser' { return @('.codex-plugin\plugin.json', 'skills\control-in-app-browser\SKILL.md') }
    'chrome' { return @('.codex-plugin\plugin.json', 'skills\control-chrome\SKILL.md') }
    default { return @() }
  }
}

function Get-RequiredMarketplaceIssues {
  param([Parameter(Mandatory = $true)][object]$Context)
  $issues = New-Object System.Collections.ArrayList
  $manifestPath = Join-Path $Context.ActiveMarketplace '.agents\plugins\marketplace.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    [void]$issues.Add('active marketplace manifest is missing')
    return @($issues)
  }
  try {
    $manifest = Read-JsonFile $manifestPath
    $listedNames = @($manifest.plugins | ForEach-Object { [string]$_.name })
    foreach ($name in @('browser', 'chrome', 'computer-use')) {
      if ($listedNames -notcontains $name) {
        [void]$issues.Add("active marketplace does not list required plugin: $name")
      }
    }
  } catch {
    [void]$issues.Add('active marketplace manifest is invalid JSON')
    return @($issues)
  }
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    $source = Join-Path $Context.SourceMarketplace "plugins\$name"
    $actual = Join-Path $Context.ActiveMarketplace "plugins\$name"
    $differences = @(Get-DirectoryDifferences $source $actual -AllowExtra -IgnoreRelativePaths (Get-PluginVariantFiles $name))
    foreach ($difference in $differences) { [void]$issues.Add("$name $difference") }
    $actualManifestPath = Join-Path $actual '.codex-plugin\plugin.json'
    if (Test-Path -LiteralPath $actualManifestPath -PathType Leaf) {
      try {
        $actualManifest = Read-JsonFile $actualManifestPath
        if ([string]$actualManifest.name -ne $name -or [string]$actualManifest.version -ne [string]$Context.PluginVersions[$name]) {
          [void]$issues.Add("$name materialized manifest identity is stale")
        }
      } catch {
        [void]$issues.Add("$name materialized manifest is invalid JSON")
      }
    }
  }
  return @($issues)
}

function ConvertTo-TomlValue {
  param([object]$Value)
  if ($Value -is [bool]) {
    return $Value.ToString().ToLowerInvariant()
  }
  if ($Value -is [int] -or $Value -is [long]) {
    return [string]$Value
  }
  if ($Value -is [System.Array]) {
    $items = @()
    foreach ($entry in $Value) {
      $items += (ConvertTo-TomlValue $entry)
    }
    return '[' + ($items -join ', ') + ']'
  }
  $text = [string]$Value
  $text = $text.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
  return '"' + $text + '"'
}

function Set-TomlTable {
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$Header,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Values
  )
  $content = ''
  if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
    $content = [System.IO.File]::ReadAllText($ConfigPath, (New-Object System.Text.UTF8Encoding($false)))
  }
  $bodyLines = [ordered]@{}
  foreach ($key in ($Values.Keys | Sort-Object)) {
    $bodyLines[$key] = ('{0} = {1}' -f $key, (ConvertTo-TomlValue $Values[$key]))
  }
  $pattern = '(?ms)^' + [regex]::Escape($Header) + '\s*\r?\n(?:(?!^\[).)*'
  if ([regex]::IsMatch($content, $pattern)) {
    $match = [regex]::Match($content, $pattern)
    $replacement = $match.Value
    foreach ($key in $bodyLines.Keys) {
      $keyPattern = '(?m)^[ \t]*' + [regex]::Escape([string]$key) + '[ \t]*=.*(?:\r?\n|$)'
      $line = [string]$bodyLines[$key] + "`r`n"
      if ([regex]::IsMatch($replacement, $keyPattern)) {
        $replacement = [regex]::Replace($replacement, $keyPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line }, 1)
      } else {
        if (-not $replacement.EndsWith("`n")) { $replacement += "`r`n" }
        $replacement += $line
      }
    }
    $content = $content.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
  } else {
    $replacement = $Header + "`r`n" + ((@($bodyLines.Values)) -join "`r`n") + "`r`n"
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) { $content += "`r`n" }
    if ($content.Length -gt 0 -and -not $content.EndsWith("`r`n`r`n")) { $content += "`r`n" }
    $content += $replacement
  }
  Write-Utf8File $ConfigPath $content
}

function Get-TomlTableText {
  param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$Header
  )
  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) { return '' }
  $content = [System.IO.File]::ReadAllText($ConfigPath, (New-Object System.Text.UTF8Encoding($false)))
  $pattern = '(?ms)^' + [regex]::Escape($Header) + '\s*\r?\n(?:(?!^\[).)*'
  $match = [regex]::Match($content, $pattern)
  if ($match.Success) { return $match.Value }
  return ''
}

function Test-TomlTextContainsPath {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
    [Parameter(Mandatory = $true)][string]$Path
  )
  if ($Text.Contains($Path)) { return $true }
  return $Text.Contains($Path.Replace('\', '\\'))
}

function Get-PluginVersion {
  param([Parameter(Mandatory = $true)][string]$PluginRoot)
  $manifestPath = Join-Path $PluginRoot '.codex-plugin\plugin.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Plugin manifest is missing: $manifestPath"
  }
  $manifest = Read-JsonFile $manifestPath
  $version = [string]$manifest.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Plugin version is missing: $manifestPath"
  }
  return $version
}

function Get-OfficialRelativePath {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$FieldName
  )
  $relative = $Value.Replace('/', '\').Trim().TrimStart('\')
  if ([string]::IsNullOrWhiteSpace($relative) -or
      [System.IO.Path]::IsPathRooted($relative) -or
      @($relative.Split('\') | Where-Object { $_ -eq '..' }).Count -gt 0) {
    throw "Official cua_node manifest contains an unsafe $FieldName path: $Value"
  }
  return $relative
}

function Get-CurrentContext {
  $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if (-not $package) { throw 'OpenAI.Codex Appx package is not installed.' }
  if ([string]$package.Status -ne 'Ok') { throw "OpenAI.Codex package status is not Ok: $($package.Status)" }
  $resources = Join-Path $package.InstallLocation 'app\resources'
  $sourceMarketplace = Join-Path $resources 'plugins\openai-bundled'
  $sourceManifest = Join-Path $sourceMarketplace '.agents\plugins\marketplace.json'
  if (-not (Test-Path -LiteralPath $sourceManifest -PathType Leaf)) {
    throw "Installed package has no bundled marketplace manifest: $sourceManifest"
  }
  $codexHome = Join-Path $env:USERPROFILE '.codex'
  $versions = [ordered]@{}
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    $versions[$name] = Get-PluginVersion (Join-Path $sourceMarketplace "plugins\$name")
  }
  $cliFiles = @(
    'codex.exe',
    'codex-code-mode-host.exe',
    'codex-windows-sandbox-setup.exe',
    'codex-command-runner.exe'
  )
  $cuaRoot = Join-Path $resources 'cua_node'
  $cuaManifestPath = Join-Path $cuaRoot 'manifest.json'
  if (-not (Test-Path -LiteralPath $cuaManifestPath -PathType Leaf)) {
    throw "Installed package has no cua_node manifest: $cuaManifestPath"
  }
  $cuaManifest = Read-JsonFile $cuaManifestPath
  $cuaNodeRelative = Get-OfficialRelativePath ([string]$cuaManifest.node_path) 'node_path'
  $cuaNodeReplRelative = Get-OfficialRelativePath ([string]$cuaManifest.node_repl_path) 'node_repl_path'
  $cuaNodeModulesRelative = Get-OfficialRelativePath ([string]$cuaManifest.node_modules) 'node_modules'
  $cuaBinRelative = Split-Path -Parent $cuaNodeRelative
  if ([string]::IsNullOrWhiteSpace($cuaBinRelative) -or
      (Split-Path -Parent $cuaNodeReplRelative) -ne $cuaBinRelative -or
      (Split-Path -Parent $cuaNodeModulesRelative) -ne $cuaBinRelative) {
    throw 'Official cua_node manifest uses incompatible runtime roots.'
  }
  $cuaHashFiles = @('manifest.json', $cuaNodeRelative, $cuaNodeReplRelative)
  $cliContentHash = Get-ContentDirectoryHash $resources $cliFiles
  $cuaContentHash = Get-ContentDirectoryHash $cuaRoot $cuaHashFiles
  $bundledHashFiles = @(
    '.agents\plugins\marketplace.json',
    'plugins\browser\.codex-plugin\plugin.json',
    'plugins\browser\scripts\browser-client.mjs',
    'plugins\chrome\.codex-plugin\plugin.json',
    'plugins\chrome\scripts\browser-client.mjs',
    'plugins\computer-use\.codex-plugin\plugin.json',
    'plugins\computer-use\skills\computer-use\SKILL.md'
  )
  $bundledContentHash = Get-ContentDirectoryHash $sourceMarketplace $bundledHashFiles
  $officialCliRoot = Join-Path $env:LOCALAPPDATA ("OpenAI\Codex\bin\{0}" -f $cliContentHash)
  $safeRuntimeRoot = Join-Path $env:LOCALAPPDATA ("OpenAI\Codex\runtimes\cua_node\{0}" -f $cuaContentHash)
  $packageVersionToken = ([string]$package.Version).Replace('.', '-')
  $resourceMirrorKey = 'p{0}-b{1}-c{2}-n{3}' -f `
    $packageVersionToken,
    $bundledContentHash.Substring(0, 8),
    $cliContentHash.Substring(0, 8),
    $cuaContentHash.Substring(0, 8)
  $resourceMirrorRoot = Join-Path $script:ToolRoot (Join-Path 'R' $resourceMirrorKey)
  $resourceMirrorDirectories = @(
    'plugins\openai-bundled',
    'cua_node',
    'app.asar.unpacked',
    'native'
  )
  $resourceMirrorFiles = @($cliFiles + @('rg.exe'))
  $resourceMirrorCriticalFiles = @(
    'plugins\openai-bundled\.agents\plugins\marketplace.json',
    'plugins\openai-bundled\plugins\browser\.codex-plugin\plugin.json',
    'plugins\openai-bundled\plugins\browser\scripts\browser-client.mjs',
    'plugins\openai-bundled\plugins\chrome\.codex-plugin\plugin.json',
    'plugins\openai-bundled\plugins\chrome\scripts\browser-client.mjs',
    'plugins\openai-bundled\plugins\computer-use\.codex-plugin\plugin.json',
    'plugins\openai-bundled\plugins\computer-use\skills\computer-use\SKILL.md',
    'plugins\openai-bundled\plugins\sites\.app.json',
    'cua_node\manifest.json',
    (Join-Path 'cua_node' $cuaNodeRelative),
    (Join-Path 'cua_node' $cuaNodeReplRelative)
  ) + $resourceMirrorFiles
  return [pscustomobject]@{
    Package = $package
    PackageVersion = [string]$package.Version
    PackageFullName = [string]$package.PackageFullName
    PackageFamilyName = [string]$package.PackageFamilyName
    SignatureKind = [string]$package.SignatureKind
    InstallLocation = [string]$package.InstallLocation
    Resources = $resources
    SourceMarketplace = $sourceMarketplace
    SourceMarketplaceManifest = $sourceManifest
    PluginVersions = $versions
    CodexHome = $codexHome
    ConfigPath = Join-Path $codexHome 'config.toml'
    ActiveMarketplace = Join-Path $codexHome '.tmp\bundled-marketplaces\openai-bundled'
    CacheRoot = Join-Path $codexHome 'plugins\cache\openai-bundled'
    AppServerRoot = Join-Path $codexHome 'plugins\.plugin-appserver'
    SandboxBinRoot = Join-Path $codexHome '.sandbox-bin'
    CliFiles = $cliFiles
    CliContentHash = $cliContentHash
    CuaContentHash = $cuaContentHash
    BundledContentHash = $bundledContentHash
    OfficialCliRoot = $officialCliRoot
    SafeRuntimeRoot = $safeRuntimeRoot
    SafeNodeBin = Join-Path $safeRuntimeRoot $cuaBinRelative
    SafeNodePath = Join-Path $safeRuntimeRoot $cuaNodeRelative
    SafeNodeReplPath = Join-Path $safeRuntimeRoot $cuaNodeReplRelative
    SafeNodeModulesPath = Join-Path $safeRuntimeRoot $cuaNodeModulesRelative
    CuaBinRelative = $cuaBinRelative
    CuaBinSource = Join-Path $cuaRoot $cuaBinRelative
    CuaNodeRelative = $cuaNodeRelative
    CuaNodeReplRelative = $cuaNodeReplRelative
    CuaNodeModulesRelative = $cuaNodeModulesRelative
    MirrorNodeRelative = Join-Path 'cua_node' $cuaNodeRelative
    MirrorNodeReplRelative = Join-Path 'cua_node' $cuaNodeReplRelative
    MirrorNodeModulesRelative = Join-Path 'cua_node' $cuaNodeModulesRelative
    ResourceMirrorKey = $resourceMirrorKey
    ResourceMirrorRoot = $resourceMirrorRoot
    ResourceMirrorMarker = Join-Path $resourceMirrorRoot '.codex-official-resources.json'
    ResourceMirrorDirectories = $resourceMirrorDirectories
    ResourceMirrorFiles = $resourceMirrorFiles
    ResourceMirrorCriticalFiles = $resourceMirrorCriticalFiles
    DesktopExecutable = Join-Path $package.InstallLocation 'app\ChatGPT.exe'
    NativeV2Path = Join-Path $codexHome 'chrome-native-hosts-v2.json'
    NativeManifestPath = Join-Path $env:LOCALAPPDATA 'OpenAI\extension\com.openai.codexextension.json'
    AppUserModelId = ([string]$package.PackageFamilyName + '!App')
  }
}

function Assert-PackageUnchanged {
  param([Parameter(Mandatory = $true)][object]$Context)
  $current = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if (-not $current -or [string]$current.PackageFullName -ne $Context.PackageFullName) {
    throw 'The Store package changed during this run. Prepared files will not be committed. Run the launcher again.'
  }
}

function Get-DirectorySize {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not [System.IO.Directory]::Exists((Get-LongPath $Path))) { return [int64]0 }
  [int64]$total = 0
  foreach ($file in @(Get-DirectoryFileRecords $Path Skip)) {
    $total += [int64]$file.Length
  }
  return $total
}

function Assert-FreeSpace {
  param([Parameter(Mandatory = $true)][object]$Context)
  [int64]$marketSize = Get-DirectorySize $Context.SourceMarketplace
  [int64]$runtimeSize = Get-DirectorySize (Join-Path $Context.Resources 'cua_node')
  [int64]$currentSize = 0
  foreach ($path in @($Context.ActiveMarketplace, $Context.AppServerRoot, $Context.OfficialCliRoot)) {
    $currentSize += Get-DirectorySize $path
  }
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    $currentSize += Get-DirectorySize (Join-Path $Context.CacheRoot $name)
  }
  [int64]$currentRuntimeSize = Get-DirectorySize $Context.SafeRuntimeRoot
  [int64]$workingRequired = (($marketSize * 3) + ($runtimeSize * 2) + $currentSize + 1GB)
  $workingDriveRoot = [System.IO.Path]::GetPathRoot($Context.CodexHome)
  $workingDrive = New-Object System.IO.DriveInfo($workingDriveRoot)
  Write-Log ("Working-drive preflight: required={0:N0} bytes available={1:N0} bytes" -f $workingRequired, $workingDrive.AvailableFreeSpace)
  if ($workingDrive.AvailableFreeSpace -lt $workingRequired) {
    throw "Not enough working space on $workingDriveRoot. Required: $workingRequired bytes; available: $($workingDrive.AvailableFreeSpace) bytes."
  }
  $backupDriveRoot = [System.IO.Path]::GetPathRoot($script:BackupsRoot)
  if (-not (Test-Path -LiteralPath $backupDriveRoot -PathType Container)) {
    throw "Backup drive is unavailable: $backupDriveRoot"
  }
  [int64]$backupRequired = ($currentSize + $currentRuntimeSize + ($marketSize * 2) + ($runtimeSize * 2) + 2GB)
  $backupDrive = New-Object System.IO.DriveInfo($backupDriveRoot)
  Write-Log ("Backup-drive preflight for temporary recovery plus golden backup: required={0:N0} bytes available={1:N0} bytes" -f $backupRequired, $backupDrive.AvailableFreeSpace)
  if ($backupDrive.AvailableFreeSpace -lt $backupRequired) {
    throw "Not enough backup space on $backupDriveRoot. Required: $backupRequired bytes; available: $($backupDrive.AvailableFreeSpace) bytes."
  }
}

function Assert-RepairFilesUnlocked {
  param([Parameter(Mandatory = $true)][object]$Context)
  $paths = @()
  $chromeRoot = Join-Path $Context.CacheRoot 'chrome'
  if (Test-Path -LiteralPath $chromeRoot -PathType Container) {
    foreach ($version in (Get-ChildItem -LiteralPath $chromeRoot -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'latest' })) {
      $paths += Join-Path $version.FullName 'extension-host\windows\x64\extension-host.exe'
    }
  }
  $paths += Join-Path $Context.AppServerRoot 'codex.exe'
  $paths += Join-Path $Context.OfficialCliRoot 'codex.exe'
  foreach ($path in ($paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) {
    $stream = $null
    try {
      $stream = New-Object System.IO.FileStream(
        (Get-LongPath $path),
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
      )
    } catch {
      throw "A repair target is locked: $path. Close Chrome and Edge completely, then run the launcher again."
    } finally {
      if ($stream) { $stream.Dispose() }
    }
  }
}

function Get-DesktopProcesses {
  $matches = @()
  foreach ($process in (Get-Process -ErrorAction SilentlyContinue)) {
    if ($process.ProcessName -notin @('ChatGPT', 'Codex')) { continue }
    $path = $null
    try { $path = $process.Path } catch { }
    if ($process.ProcessName -eq 'ChatGPT' -or ($path -and $path -like '*\WindowsApps\OpenAI.Codex_*')) {
      $matches += $process
    }
  }
  return @($matches)
}

function Assert-DesktopClosed {
  $processes = @(Get-DesktopProcesses)
  if ($processes.Count -gt 0) {
    $ids = ($processes | ForEach-Object { [string]$_.Id }) -join ', '
    throw "ChatGPT Desktop is running (PID: $ids). Exit it from the system tray, then run this launcher again."
  }
}

function Stop-BrowserProcesses {
  Assert-DesktopClosed
  $names = @('chrome', 'msedge')
  $initial = @()
  foreach ($name in $names) {
    $initial += @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  }
  if ($initial.Count -eq 0) {
    Write-Log 'Chrome and Edge are already fully stopped.' 'OK'
    return
  }
  Write-Log 'Closing Chrome and Edge before plugin reconciliation. Unsaved browser work can be lost.' 'WARN'
  foreach ($process in $initial) {
    try {
      if ($process.MainWindowHandle -ne 0) { [void]$process.CloseMainWindow() }
    } catch { }
  }
  Write-Log 'Waiting 10 seconds for a graceful browser shutdown.'
  Start-Sleep -Seconds 10
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    $remaining = @()
    foreach ($name in $names) {
      $remaining += @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    }
    if ($remaining.Count -eq 0) {
      Write-Log 'Chrome and Edge are fully stopped.' 'OK'
      return
    }
    foreach ($process in $remaining) {
      Write-Log "Stopping browser process $($process.ProcessName) (PID $($process.Id))." 'WARN'
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
  }
  $stillRunning = @()
  foreach ($name in $names) {
    $stillRunning += @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  }
  if ($stillRunning.Count -gt 0) {
    $details = ($stillRunning | ForEach-Object { "$($_.ProcessName):$($_.Id)" }) -join ', '
    throw "Chrome or Edge keeps restarting ($details). Disable browser background startup temporarily and run the launcher again."
  }
}

function Stop-OrphanPluginHelpers {
  Assert-DesktopClosed
  foreach ($name in @('extension-host', 'node_repl', 'codex-computer-use')) {
    foreach ($process in (Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      Write-Log "Stopping orphan helper process $name (PID $($process.Id))." 'WARN'
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
    }
  }
  Start-Sleep -Milliseconds 800
  $remaining = @()
  foreach ($name in @('extension-host', 'node_repl', 'codex-computer-use')) {
    $remaining += @(Get-Process -Name $name -ErrorAction SilentlyContinue)
  }
  if ($remaining.Count -gt 0) {
    throw 'A browser helper restarted. Close Chrome and Edge completely, then run the launcher again.'
  }
}

function Get-LatestTarget {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $item = Get-Item -Force -LiteralPath $Path
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { return $null }
  return [string]($item.Target -join ';')
}

function Get-ResourceMirrorIssues {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [string]$Root = $Context.ResourceMirrorRoot
  )
  $issues = New-Object System.Collections.ArrayList
  $markerPath = Join-Path $Root '.codex-official-resources.json'
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    [void]$issues.Add("official resources mirror marker is missing: $markerPath")
    return @($issues)
  }
  try {
    $marker = Read-JsonFile $markerPath
    if ([string]$marker.packageFullName -ne $Context.PackageFullName) {
      [void]$issues.Add('official resources mirror package identity is stale')
    }
    if ([int]$marker.schemaVersion -lt 2) {
      [void]$issues.Add('official resources mirror schema is stale')
    }
    if ([string]$marker.packageVersion -ne $Context.PackageVersion) {
      [void]$issues.Add('official resources mirror package version is stale')
    }
    if ([string]$marker.resourceMirrorKey -ne $Context.ResourceMirrorKey) {
      [void]$issues.Add('official resources mirror content key is stale')
    }
    if ([string]$marker.cliContentHash -ne $Context.CliContentHash -or [string]$marker.cuaContentHash -ne $Context.CuaContentHash) {
      [void]$issues.Add('official resources mirror helper hashes are stale')
    }
    if ([string]$marker.bundledContentHash -ne $Context.BundledContentHash) {
      [void]$issues.Add('official resources mirror bundled plugin hash is stale')
    }
  } catch {
    [void]$issues.Add('official resources mirror marker is invalid JSON')
    return @($issues)
  }
  foreach ($relative in $Context.ResourceMirrorCriticalFiles) {
    $source = Join-Path $Context.Resources ([string]$relative)
    $target = Join-Path $Root ([string]$relative)
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      [void]$issues.Add("official package resource is missing: $relative")
      continue
    }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      [void]$issues.Add("official resources mirror file is missing: $relative")
      continue
    }
    if ((Get-Item -LiteralPath $source -Force).Length -ne (Get-Item -LiteralPath $target -Force).Length) {
      [void]$issues.Add("official resources mirror length mismatch: $relative")
      continue
    }
    if ((Get-FileSha256 $source) -ne (Get-FileSha256 $target)) {
      [void]$issues.Add("official resources mirror hash mismatch: $relative")
    }
  }
  return @($issues)
}

function Ensure-OfficialResourcesMirror {
  param([Parameter(Mandatory = $true)][object]$Context)
  $existingIssues = @(Get-ResourceMirrorIssues $Context)
  if ($existingIssues.Count -eq 0) {
    Write-Log "Official unencrypted resources mirror is ready: $($Context.ResourceMirrorRoot)" 'OK'
    return
  }
  Write-Log "Preparing the update-aware official resources mirror because $($existingIssues.Count) check(s) failed." 'WARN'
  [int64]$required = 512MB
  foreach ($relative in $Context.ResourceMirrorDirectories) {
    $required += Get-DirectorySize (Join-Path $Context.Resources ([string]$relative))
  }
  foreach ($relative in $Context.ResourceMirrorFiles) {
    $required += [int64](Get-Item -LiteralPath (Join-Path $Context.Resources ([string]$relative)) -Force).Length
  }
  $mirrorDrive = New-Object System.IO.DriveInfo([System.IO.Path]::GetPathRoot($Context.ResourceMirrorRoot))
  Write-Log ("Resources-mirror preflight: required={0:N0} bytes available={1:N0} bytes" -f $required, $mirrorDrive.AvailableFreeSpace)
  if ($mirrorDrive.AvailableFreeSpace -lt $required) {
    throw "Not enough free space to create the official resources mirror. Required: $required bytes; available: $($mirrorDrive.AvailableFreeSpace) bytes."
  }
  $parent = New-Directory (Split-Path -Parent $Context.ResourceMirrorRoot)
  $stage = New-ShortSiblingPath $parent 'r'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  New-Directory $stage | Out-Null
  foreach ($relative in $Context.ResourceMirrorDirectories) {
    Copy-DirectoryVerified (Join-Path $Context.Resources ([string]$relative)) (Join-Path $stage ([string]$relative))
  }
  foreach ($relative in $Context.ResourceMirrorFiles) {
    Copy-FileBytesVerified (Join-Path $Context.Resources ([string]$relative)) (Join-Path $stage ([string]$relative))
  }
  $marker = [ordered]@{
    schemaVersion = 2
    createdAt = [DateTime]::UtcNow.ToString('o')
    toolVersion = $script:ToolVersion
    packageFullName = $Context.PackageFullName
    packageVersion = $Context.PackageVersion
    resourceMirrorKey = $Context.ResourceMirrorKey
    cliContentHash = $Context.CliContentHash
    cuaContentHash = $Context.CuaContentHash
    bundledContentHash = $Context.BundledContentHash
    pluginVersions = $Context.PluginVersions
  }
  Write-JsonFile (Join-Path $stage '.codex-official-resources.json') $marker
  $stageIssues = @(Get-ResourceMirrorIssues $Context $stage)
  if ($stageIssues.Count -gt 0) {
    throw "Prepared official resources mirror failed validation: $($stageIssues -join '; ')"
  }
  Install-DirectoryAtomically $stage $Context.ResourceMirrorRoot $parent
  Complete-RunSwaps
  $finalIssues = @(Get-ResourceMirrorIssues $Context)
  if ($finalIssues.Count -gt 0) {
    throw "Installed official resources mirror failed validation: $($finalIssues -join '; ')"
  }
  Write-Log "Official unencrypted resources mirror installed: $($Context.ResourceMirrorRoot)" 'OK'
}

function Get-StateIssues {
  param([Parameter(Mandatory = $true)][object]$Context)
  $issues = New-Object System.Collections.ArrayList
  foreach ($mirrorIssue in @(Get-ResourceMirrorIssues $Context)) {
    [void]$issues.Add("resources mirror $mirrorIssue")
  }
  foreach ($marketplaceIssue in @(Get-RequiredMarketplaceIssues $Context)) {
    [void]$issues.Add("marketplace $marketplaceIssue")
  }
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    $version = [string]$Context.PluginVersions[$name]
    $sourcePlugin = Join-Path $Context.SourceMarketplace "plugins\$name"
    $cacheVersion = Join-Path $Context.CacheRoot "$name\$version"
    $cacheDiff = @(Get-DirectoryDifferences $sourcePlugin $cacheVersion -AllowExtra -IgnoreRelativePaths (Get-PluginVariantFiles $name))
    foreach ($difference in $cacheDiff) { [void]$issues.Add("$name cache $difference") }
    $latest = Join-Path $Context.CacheRoot "$name\latest"
    $target = Get-LatestTarget $latest
    if (-not $target -and $name -ne 'browser') {
      [void]$issues.Add("$name latest junction is missing")
    } elseif ($target -and [System.IO.Path]::GetFullPath($target).TrimEnd('\') -ne [System.IO.Path]::GetFullPath($cacheVersion).TrimEnd('\')) {
      [void]$issues.Add("$name latest junction targets $target")
    }
  }
  $sourceSky = Join-Path $Context.Resources (Join-Path $Context.MirrorNodeModulesRelative '@oai\sky')
  $cuVersion = [string]$Context.PluginVersions['computer-use']
  $cacheSky = Join-Path $Context.CacheRoot "computer-use\$cuVersion\node_modules\@oai\sky"
  foreach ($difference in @(Get-DirectoryDifferences $sourceSky $cacheSky)) {
    [void]$issues.Add("computer-use sky $difference")
  }
  foreach ($name in $Context.CliFiles) {
    $source = Join-Path $Context.Resources $name
    $target = Join-Path $Context.AppServerRoot $name
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      [void]$issues.Add("app-server helper missing: $name")
    } elseif ((Get-FileSha256 $source) -ne (Get-FileSha256 $target)) {
      [void]$issues.Add("app-server helper hash mismatch: $name")
    }
    $officialTarget = Join-Path $Context.OfficialCliRoot $name
    if (-not (Test-Path -LiteralPath $officialTarget -PathType Leaf)) {
      [void]$issues.Add("official CLI helper missing: $name")
    } elseif ((Get-FileSha256 $source) -ne (Get-FileSha256 $officialTarget)) {
      [void]$issues.Add("official CLI helper hash mismatch: $name")
    }
  }
  foreach ($runtimeFile in @(
    [pscustomobject]@{ Name = 'node'; Source = Join-Path $Context.Resources $Context.MirrorNodeRelative; Target = $Context.SafeNodePath },
    [pscustomobject]@{ Name = 'node_repl'; Source = Join-Path $Context.Resources $Context.MirrorNodeReplRelative; Target = $Context.SafeNodeReplPath }
  )) {
    $source = [string]$runtimeFile.Source
    $target = [string]$runtimeFile.Target
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
      [void]$issues.Add("safe runtime missing: $($runtimeFile.Name)")
    } elseif ((Get-FileSha256 $source) -ne (Get-FileSha256 $target)) {
      [void]$issues.Add("safe runtime hash mismatch: $($runtimeFile.Name)")
    }
  }
  $runtimeDiff = @(Get-DirectoryDifferences $Context.CuaBinSource $Context.SafeNodeBin)
  if ($runtimeDiff.Count -gt 0) {
    [void]$issues.Add("safe runtime tree differs from the current package ($($runtimeDiff.Count) file issue(s))")
  }
  $marketTable = Get-TomlTableText $Context.ConfigPath '[marketplaces.openai-bundled]'
  if (-not (Test-TomlTextContainsPath $marketTable $Context.ActiveMarketplace)) {
    [void]$issues.Add('config marketplace source is missing or stale')
  }
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    $table = Get-TomlTableText $Context.ConfigPath ('[plugins."' + $name + '@openai-bundled"]')
    if ($table -notmatch '(?m)^\s*enabled\s*=\s*true\s*$') {
      [void]$issues.Add("config plugin is not enabled: $name")
    }
  }
  $nodeTable = Get-TomlTableText $Context.ConfigPath '[mcp_servers.node_repl]'
  $nodeEnvTable = Get-TomlTableText $Context.ConfigPath '[mcp_servers.node_repl.env]'
  $validNodeReplPaths = @(
    $Context.SafeNodeReplPath,
    (Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeReplRelative)
  )
  $validCliPaths = @(
    (Join-Path $Context.OfficialCliRoot 'codex.exe'),
    (Join-Path $Context.ResourceMirrorRoot 'codex.exe')
  )
  if (-not @($validNodeReplPaths | Where-Object { Test-TomlTextContainsPath $nodeTable $_ }).Count) {
    [void]$issues.Add('node_repl MCP command is missing or stale')
  }
  if (-not @($validCliPaths | Where-Object { Test-TomlTextContainsPath $nodeEnvTable $_ }).Count) {
    [void]$issues.Add('node_repl CODEX_CLI_PATH is missing or stale')
  }
  $chromeVersion = [string]$Context.PluginVersions['chrome']
  $chromeVersionRoot = Join-Path $Context.CacheRoot "chrome\$chromeVersion"
  $expectedHost = Join-Path $chromeVersionRoot 'extension-host\windows\x64\extension-host.exe'
  $expectedBrowserClient = Join-Path $chromeVersionRoot 'scripts\browser-client.mjs'
  $expectedNode = $Context.SafeNodePath
  $expectedNodeRepl = $Context.SafeNodeReplPath
  $expectedNodeModules = $Context.SafeNodeModulesPath
  $expectedExtensionId = 'hehggadaopoacecdllhhajmbjkdcmajg'
  $expectedOrigin = 'chrome-extension://' + $expectedExtensionId + '/'
  if (-not (Test-Path -LiteralPath $Context.NativeManifestPath -PathType Leaf)) {
    [void]$issues.Add('Chrome native messaging manifest is missing')
  } else {
    try {
      $nativeManifest = Read-JsonFile $Context.NativeManifestPath
      $validNativeHosts = @($expectedHost, (Join-Path $Context.CacheRoot "chrome\latest\extension-host\windows\x64\extension-host.exe"))
      if ($validNativeHosts -notcontains [string]$nativeManifest.path) {
        [void]$issues.Add('Chrome native messaging manifest path is stale')
      }
      if ([string]$nativeManifest.name -ne 'com.openai.codexextension' -or [string]$nativeManifest.type -ne 'stdio') {
        [void]$issues.Add('Chrome native messaging manifest identity is invalid')
      }
      if (@($nativeManifest.allowed_origins) -notcontains $expectedOrigin) {
        [void]$issues.Add('Chrome native messaging manifest extension origin is missing')
      }
    } catch {
      [void]$issues.Add('Chrome native messaging manifest is invalid JSON')
    }
  }
  foreach ($registryPath in @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.openai.codexextension'
  )) {
    if (-not (Test-Path -LiteralPath $registryPath)) {
      [void]$issues.Add("Native Host registry key is missing: $registryPath")
    } else {
      try {
        $registryValue = [string](Get-Item -LiteralPath $registryPath).GetValue('')
        if ($registryValue -ne $Context.NativeManifestPath) {
          [void]$issues.Add("Native Host registry value is stale: $registryPath")
        }
      } catch {
        [void]$issues.Add("Native Host registry value cannot be read: $registryPath")
      }
    }
  }
  if (-not (Test-Path -LiteralPath $Context.NativeV2Path -PathType Leaf)) {
    [void]$issues.Add('chrome-native-hosts-v2.json is missing')
  } else {
    try {
      $v2 = Read-JsonFile $Context.NativeV2Path
      $entry = @($v2.entries) | Select-Object -First 1
      if (-not $entry) {
        [void]$issues.Add('chrome-native-hosts-v2 entry is missing')
      } else {
        if ([int]$v2.schemaVersion -ne 2 -or [int]$entry.schemaVersion -ne 2 -or [int]$entry.appServerProtocolVersion -ne 2 -or [int]$entry.nativeHostProtocolVersion -ne 2) {
          [void]$issues.Add('chrome-native-hosts-v2 protocol metadata is stale')
        }
        if (@($entry.extensionIds) -notcontains $expectedExtensionId -or @($entry.nativeHostNames) -notcontains 'com.openai.codexextension') {
          [void]$issues.Add('chrome-native-hosts-v2 extension identity is stale')
        }
        if (-not $entry.paths) {
          [void]$issues.Add('chrome-native-hosts-v2 paths are missing')
        } else {
          $expectedPaths = [ordered]@{
            browserClientPath = @($expectedBrowserClient, (Join-Path $Context.CacheRoot 'chrome\latest\scripts\browser-client.mjs'))
            codexCliPath = @((Join-Path $Context.OfficialCliRoot 'codex.exe'), (Join-Path $Context.AppServerRoot 'codex.exe'), (Join-Path $Context.ResourceMirrorRoot 'codex.exe'))
            codexHome = @($Context.CodexHome)
            extensionHostPath = @($expectedHost, (Join-Path $Context.CacheRoot 'chrome\latest\extension-host\windows\x64\extension-host.exe'))
            nodePath = @($expectedNode, (Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeRelative))
            nodeReplPath = @($expectedNodeRepl, (Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeReplRelative))
            resourcesPath = @($Context.ResourceMirrorRoot)
          }
          foreach ($pathName in $expectedPaths.Keys) {
            if (@($expectedPaths[$pathName]) -notcontains [string]$entry.paths.$pathName) {
              [void]$issues.Add("chrome-native-hosts-v2 path is stale: $pathName")
            }
          }
          $validNodeModuleDirs = @($expectedNodeModules, (Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeModulesRelative))
          if (@($entry.paths.nodeModuleDirs | Where-Object { $validNodeModuleDirs -contains [string]$_ }).Count -eq 0) {
            [void]$issues.Add('chrome-native-hosts-v2 nodeModuleDirs is stale')
          }
        }
      }
    } catch {
      [void]$issues.Add('chrome-native-hosts-v2.json is invalid JSON')
    }
  }
  return @($issues)
}

function Write-Diagnosis {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$Issues
  )
  Write-Log "Package: $($Context.PackageFullName)"
  Write-Log "Signature: $($Context.SignatureKind)"
  Write-Log "Official bundled plugin content hash: $($Context.BundledContentHash)"
  Write-Log "Official CLI content hash: $($Context.CliContentHash)"
  Write-Log "Official CUA content hash: $($Context.CuaContentHash)"
  Write-Log "Official resources mirror: $($Context.ResourceMirrorRoot)"
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    Write-Log ("Official plugin: {0}@{1}" -f $name, $Context.PluginVersions[$name])
  }
  if ($Issues.Count -eq 0) {
    Write-Log 'Static plugin state is healthy.' 'OK'
  } else {
    Write-Log ("Static plugin state has {0} issue(s)." -f $Issues.Count) 'WARN'
    foreach ($issue in $Issues) { Write-Log $issue 'WARN' }
  }
  $report = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o')
    toolVersion = $script:ToolVersion
    mode = $Mode
    packageFullName = $Context.PackageFullName
    packageVersion = $Context.PackageVersion
    signatureKind = $Context.SignatureKind
    cliContentHash = $Context.CliContentHash
    cuaContentHash = $Context.CuaContentHash
    resourceMirrorKey = $Context.ResourceMirrorKey
    resourceMirrorRoot = $Context.ResourceMirrorRoot
    pluginVersions = $Context.PluginVersions
    issues = @($Issues)
  }
  $reportPath = Join-Path $script:LogsRoot ("diagnosis-{0}.json" -f $script:RunId)
  Write-JsonFile $reportPath $report
  Write-Log "Diagnosis report: $reportPath"
}

function Get-RegistryValueSnapshot {
  $keys = @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.openai.codexextension'
  )
  $values = @()
  foreach ($key in $keys) {
    $present = Test-Path -LiteralPath $key
    $value = $null
    if ($present) {
      try { $value = (Get-Item -LiteralPath $key).GetValue('') } catch { }
    }
    $values += [pscustomobject]@{ path = $key; present = $present; value = $value }
  }
  return @($values)
}

function Copy-BackupItem {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Collections.ArrayList]$Mappings
  )
  if (Test-Path -LiteralPath $Source -PathType Leaf) {
    Copy-FileBytesVerified $Source $Destination
    [void]$Mappings.Add([pscustomobject]@{ source = $Source; backup = $Destination; type = 'file'; present = $true })
  } elseif (Test-Path -LiteralPath $Source -PathType Container) {
    Copy-DirectoryVerified $Source $Destination -SkipReparsePoints
    [void]$Mappings.Add([pscustomobject]@{ source = $Source; backup = $Destination; type = 'directory'; present = $true })
  } else {
    [void]$Mappings.Add([pscustomobject]@{ source = $Source; backup = $Destination; type = 'missing'; present = $false })
  }
}

function Remove-RepairBackupDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [ValidateSet('Recovery', 'Golden')][string]$Kind
  )
  if (-not (Test-Path -LiteralPath $BackupRoot)) { return }
  $fullRoot = [System.IO.Path]::GetFullPath($script:BackupsRoot).TrimEnd('\')
  $fullBackup = [System.IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
  if ([System.IO.Path]::GetDirectoryName($fullBackup) -ne $fullRoot) {
    throw "Refusing to remove a backup outside the launcher backup root: $fullBackup"
  }
  $expectedPrefix = if ($Kind -eq 'Golden') { 'G-' } else { 'T-' }
  if (-not [System.IO.Path]::GetFileName($fullBackup).StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a backup that is not a $Kind backup: $fullBackup"
  }
  Remove-PathSafely $fullBackup @($script:BackupsRoot)
}

function Invoke-BackupRetention {
  if (Test-Path -LiteralPath $script:PendingTransactionPath -PathType Leaf) {
    Write-Log 'Backup retention was skipped because a repair transaction is still pending.' 'WARN'
    return
  }
  if (-not (Test-Path -LiteralPath $script:BackupsRoot -PathType Container)) {
    Write-Log 'Backup retention: no backup directory exists yet.' 'INFO'
    return
  }

  $orphanRecoveryBackups = @(Get-ChildItem -LiteralPath $script:BackupsRoot -Directory -Force -ErrorAction Stop |
      Where-Object { $_.Name.StartsWith('T-', [System.StringComparison]::OrdinalIgnoreCase) })
  foreach ($backup in $orphanRecoveryBackups) {
    Remove-RepairBackupDirectory $backup.FullName Recovery
    Write-Log "Backup retention removed the orphaned temporary recovery backup: $($backup.FullName)" 'OK'
  }

  $backups = @(Get-ChildItem -LiteralPath $script:BackupsRoot -Directory -Force -ErrorAction Stop |
      Where-Object { $_.Name.StartsWith('G-', [System.StringComparison]::OrdinalIgnoreCase) } |
      Sort-Object LastWriteTimeUtc, Name -Descending)
  if ($backups.Count -le $script:MaxRetainedBackups) {
    Write-Log "Backup retention: $($backups.Count) of $($script:MaxRetainedBackups) backup slots are in use." 'OK'
    return
  }

  $obsolete = @($backups | Select-Object -Skip $script:MaxRetainedBackups)
  foreach ($backup in $obsolete) {
    Remove-RepairBackupDirectory $backup.FullName Golden
    Write-Log "Backup retention removed the older backup: $($backup.FullName)" 'OK'
  }

  $remaining = @(Get-ChildItem -LiteralPath $script:BackupsRoot -Directory -Force -ErrorAction Stop |
      Where-Object { $_.Name.StartsWith('G-', [System.StringComparison]::OrdinalIgnoreCase) })
  if ($remaining.Count -gt $script:MaxRetainedBackups) {
    throw "Backup retention did not reach the configured limit of $($script:MaxRetainedBackups). Remaining launcher backups: $($remaining.Count)"
  }
  Write-Log "Backup retention complete. The newest $($remaining.Count) launcher backup(s) remain." 'OK'
}

function Remove-LegacyLauncherAfterVerifiedStart {
  if ([string]::IsNullOrWhiteSpace($script:LegacyLauncherRoot)) { return }
  if (-not (Test-Path -LiteralPath $script:LegacyLauncherRoot -PathType Container)) { return }

  $currentRoot = [System.IO.Path]::GetFullPath($script:ToolRoot).TrimEnd('\')
  $expectedCurrentRoot = $currentRoot
  $legacyRoot = [System.IO.Path]::GetFullPath($script:LegacyLauncherRoot).TrimEnd('\')
  $desktopRoot = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath('Desktop')).TrimEnd('\')
  if ($currentRoot -ne $expectedCurrentRoot) {
    Write-Log "Legacy launcher cleanup was skipped because this copy is running from an unexpected location: $currentRoot" 'WARN'
    return
  }
  if ([System.IO.Path]::GetDirectoryName($legacyRoot) -ne $desktopRoot) {
    throw "Refusing to remove the legacy launcher outside the expected Desktop root: $legacyRoot"
  }

  $legacyProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath.StartsWith($legacyRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
    })
  if ($legacyProcesses.Count -gt 0) {
    Write-Log "Legacy launcher cleanup was deferred because $($legacyProcesses.Count) process(es) still use the old location." 'WARN'
    return
  }

  Remove-PathSafely $legacyRoot @($desktopRoot)
  Write-Log "The verified launcher removed the configured legacy Desktop copy: $legacyRoot" 'OK'
}

function New-RepairBackup {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [ValidateSet('Recovery', 'Golden')][string]$Kind = 'Recovery'
  )
  New-Directory $script:BackupsRoot | Out-Null
  $versionParts = $Context.PackageVersion.Split('.')
  $packageBuild = if ($versionParts.Count -ge 3) { $versionParts[2] } else { $Context.PackageVersion.Replace('.', '-') }
  $shortSuffix = $script:RunId.Substring($script:RunId.Length - 4)
  $prefix = if ($Kind -eq 'Golden') { 'G' } else { 'T' }
  $backupRoot = Join-Path $script:BackupsRoot ("{0}-{1}-p{2}-{3}" -f $prefix, (Get-Date -Format 'yyyyMMdd-HHmmss'), $packageBuild, $shortSuffix)
  New-Directory $backupRoot | Out-Null
  $incomplete = Join-Path $backupRoot '.incomplete'
  Write-Utf8File $incomplete 'backup in progress'
  $mappings = New-Object System.Collections.ArrayList
  try {
    Copy-BackupItem $Context.ConfigPath (Join-Path $backupRoot 'c\config.toml') $mappings
    Copy-BackupItem $Context.ActiveMarketplace (Join-Path $backupRoot 'm') $mappings
    Copy-BackupItem (Join-Path $Context.CacheRoot 'browser') (Join-Path $backupRoot 'p\b') $mappings
    Copy-BackupItem (Join-Path $Context.CacheRoot 'chrome') (Join-Path $backupRoot 'p\c') $mappings
    Copy-BackupItem (Join-Path $Context.CacheRoot 'computer-use') (Join-Path $backupRoot 'p\u') $mappings
    Copy-BackupItem $Context.AppServerRoot (Join-Path $backupRoot 'r\a') $mappings
    Copy-BackupItem $Context.OfficialCliRoot (Join-Path $backupRoot 'r\c') $mappings
    Copy-BackupItem $Context.SafeRuntimeRoot (Join-Path $backupRoot 'r\n') $mappings
    Copy-BackupItem $Context.NativeV2Path (Join-Path $backupRoot 'n\v2.json') $mappings
    Copy-BackupItem $Context.NativeManifestPath (Join-Path $backupRoot 'n\host.json') $mappings
    if ($Kind -eq 'Recovery') {
      Copy-BackupItem $script:StatePath (Join-Path $backupRoot 's\launcher-state.json') $mappings
    }
    $links = @()
    foreach ($name in @('browser', 'chrome', 'computer-use')) {
      $link = Join-Path $Context.CacheRoot "$name\latest"
      $links += [pscustomobject]@{ path = $link; target = Get-LatestTarget $link }
    }
    $metadata = [ordered]@{
      schemaVersion = 1
      backupKind = $Kind
      createdAt = [DateTime]::UtcNow.ToString('o')
      toolVersion = $script:ToolVersion
      packageFullName = $Context.PackageFullName
      packageVersion = $Context.PackageVersion
      signatureKind = $Context.SignatureKind
      pluginVersions = $Context.PluginVersions
      mappings = @($mappings)
      links = @($links)
      registry = @(Get-RegistryValueSnapshot)
      userEnvironment = [ordered]@{
        CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE = [Environment]::GetEnvironmentVariable('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE', 'User')
      }
    }
    Write-JsonFile (Join-Path $backupRoot 'metadata.json') $metadata
    $manifest = @()
    foreach ($file in (Get-DirectoryFileRecords $backupRoot)) {
      $fileName = [System.IO.Path]::GetFileName([string]$file.Relative)
      if ($fileName -eq '.incomplete' -or $fileName -eq 'sha256-manifest.json') { continue }
      $manifest += [pscustomobject]@{
        relativePath = [string]$file.Relative
        length = [int64]$file.Length
        sha256 = Get-FileSha256 ([string]$file.Path)
      }
    }
    Write-JsonFile (Join-Path $backupRoot 'sha256-manifest.json') $manifest
    foreach ($entry in $manifest) {
      $path = Join-Path $backupRoot ([string]$entry.relativePath)
      $pathLong = Get-LongPath $path
      if (-not [System.IO.File]::Exists($pathLong)) { throw "Backup validation missing file: $path" }
      if ((New-Object System.IO.FileInfo($pathLong)).Length -ne [int64]$entry.length) { throw "Backup length mismatch: $path" }
      if ((Get-FileSha256 $path) -ne [string]$entry.sha256) { throw "Backup hash mismatch: $path" }
    }
    Remove-Item -LiteralPath $incomplete -Force
    Write-Log "Validated $Kind backup: $backupRoot" 'OK'
    return $backupRoot
  } catch {
    Write-Log "Backup creation failed: $backupRoot" 'ERROR'
    try {
      Remove-RepairBackupDirectory $backupRoot $Kind
      Write-Log 'The incomplete backup was removed automatically.' 'OK'
    } catch {
      Write-Log "Could not remove incomplete backup: $($_.Exception.Message)" 'WARN'
    }
    throw
  }
}

function Test-Backup {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)
  if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) { throw "Backup directory is missing: $BackupRoot" }
  if (Test-Path -LiteralPath (Join-Path $BackupRoot '.incomplete')) { throw "Backup is incomplete: $BackupRoot" }
  $manifestPath = Join-Path $BackupRoot 'sha256-manifest.json'
  $metadataPath = Join-Path $BackupRoot 'metadata.json'
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Backup manifest is missing.' }
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) { throw 'Backup metadata is missing.' }
  $manifest = @(Read-JsonFile $manifestPath)
  foreach ($entry in $manifest) {
    $path = Join-Path $BackupRoot ([string]$entry.relativePath)
    $pathLong = Get-LongPath $path
    if (-not [System.IO.File]::Exists($pathLong)) { throw "Backup file is missing: $path" }
    if ((New-Object System.IO.FileInfo($pathLong)).Length -ne [int64]$entry.length) { throw "Backup file length mismatch: $path" }
    if ((Get-FileSha256 $path) -ne [string]$entry.sha256) { throw "Backup file hash mismatch: $path" }
  }
  return (Read-JsonFile $metadataPath)
}

function Install-DirectoryAtomically {
  param(
    [Parameter(Mandatory = $true)][string]$PreparedDirectory,
    [Parameter(Mandatory = $true)][string]$TargetDirectory,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )
  $parent = New-Directory (Split-Path -Parent $TargetDirectory)
  $targetFull = [System.IO.Path]::GetFullPath($TargetDirectory)
  $rootFull = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\') + '\'
  if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Atomic install target is outside approved root: $targetFull"
  }
  $old = New-ShortSiblingPath $parent 'o'
  if (Test-Path -LiteralPath $old) { Remove-PathSafely $old @($AllowedRoot) }
  if (Test-Path -LiteralPath $TargetDirectory) {
    Move-Item -LiteralPath $TargetDirectory -Destination $old
  } else {
    $old = $null
  }
  try {
    Move-Item -LiteralPath $PreparedDirectory -Destination $TargetDirectory
    [void]$script:SwapRecords.Add([pscustomobject]@{ target = $TargetDirectory; old = $old; allowedRoot = $AllowedRoot })
  } catch {
    if ($old -and (Test-Path -LiteralPath $old) -and -not (Test-Path -LiteralPath $TargetDirectory)) {
      Move-Item -LiteralPath $old -Destination $TargetDirectory
    }
    throw
  }
}

function Remove-PathAtomically {
  param(
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )
  if (-not (Test-Path -LiteralPath $TargetPath)) { return }
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
  $rootFull = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\') + '\'
  if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Atomic removal target is outside approved root: $targetFull"
  }
  $old = New-ShortSiblingPath (Split-Path -Parent $TargetPath) 'o'
  if (Test-Path -LiteralPath $old) { Remove-PathSafely $old @($AllowedRoot) }
  Move-Item -LiteralPath $TargetPath -Destination $old
  [void]$script:SwapRecords.Add([pscustomobject]@{ target = $TargetPath; old = $old; allowedRoot = $AllowedRoot })
}

function Undo-RunSwaps {
  $failed = New-Object System.Collections.ArrayList
  for ($index = $script:SwapRecords.Count - 1; $index -ge 0; $index--) {
    $record = $script:SwapRecords[$index]
    try {
      if (Test-Path -LiteralPath $record.target) {
        Remove-PathSafely $record.target @([string]$record.allowedRoot)
      }
      if ($record.old -and (Test-Path -LiteralPath $record.old)) {
        Move-Item -LiteralPath $record.old -Destination $record.target
      }
    } catch {
      Write-Log "Automatic directory rollback failed for $($record.target): $($_.Exception.Message)" 'ERROR'
      [void]$failed.Add($record)
    }
  }
  $script:SwapRecords.Clear()
  foreach ($record in $failed) { [void]$script:SwapRecords.Add($record) }
  return ($failed.Count -eq 0)
}

function Complete-RunSwaps {
  foreach ($record in $script:SwapRecords) {
    if ($record.old -and (Test-Path -LiteralPath $record.old)) {
      try { Remove-PathSafely $record.old @([string]$record.allowedRoot) } catch { Write-Log "Could not remove old staging path: $($record.old)" 'WARN' }
    }
  }
  $script:SwapRecords.Clear()
}

function New-PreparedMarketplace {
  param([Parameter(Mandatory = $true)][object]$Context)
  $parent = New-Directory (Split-Path -Parent $Context.ActiveMarketplace)
  $stage = New-ShortSiblingPath $parent 'm'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  Copy-DirectoryVerified $Context.SourceMarketplace $stage
  $diff = @(Get-DirectoryDifferences $Context.SourceMarketplace $stage)
  if ($diff.Count -gt 0) { throw "Prepared marketplace verification failed: $($diff -join '; ')" }
  return $stage
}

function New-PreparedAppServer {
  param([Parameter(Mandatory = $true)][object]$Context)
  $parent = New-Directory (Split-Path -Parent $Context.AppServerRoot)
  $stage = New-ShortSiblingPath $parent 'a'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  New-Directory $stage | Out-Null
  foreach ($name in $Context.CliFiles) {
    Copy-FileBytesVerified (Join-Path $Context.Resources $name) (Join-Path $stage $name)
  }
  return $stage
}

function Ensure-OfficialCliRuntime {
  param([Parameter(Mandatory = $true)][object]$Context)
  $matches = $true
  foreach ($name in $Context.CliFiles) {
    $source = Join-Path $Context.Resources $name
    $target = Join-Path $Context.OfficialCliRoot $name
    if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileSha256 $source) -ne (Get-FileSha256 $target)) {
      $matches = $false
      break
    }
  }
  if ($matches) {
    Write-Log "Official CLI runtime already matches content hash $($Context.CliContentHash)." 'OK'
    return
  }
  $parent = New-Directory (Split-Path -Parent $Context.OfficialCliRoot)
  $stage = New-ShortSiblingPath $parent 'c'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  New-Directory $stage | Out-Null
  foreach ($name in $Context.CliFiles) {
    Copy-FileBytesVerified (Join-Path $Context.Resources $name) (Join-Path $stage $name)
  }
  Install-DirectoryAtomically $stage $Context.OfficialCliRoot $parent
}

function Ensure-SafeNodeRuntime {
  param([Parameter(Mandatory = $true)][object]$Context)
  $sourceBin = $Context.CuaBinSource
  $existingIssues = @(Get-DirectoryDifferences $sourceBin $Context.SafeNodeBin)
  if ($existingIssues.Count -eq 0) {
    Write-Log "Safe Node runtime already matches package $($Context.PackageVersion)." 'OK'
    return
  }
  $parent = New-Directory (Split-Path -Parent $Context.SafeRuntimeRoot)
  $stage = New-ShortSiblingPath $parent 'n'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  Copy-DirectoryVerified (Join-Path $Context.Resources 'cua_node') $stage
  $stageBin = Join-Path $stage 'bin'
  $diff = @(Get-DirectoryDifferences $sourceBin $stageBin)
  if ($diff.Count -gt 0) { throw "Safe runtime staging verification failed: $($diff -join '; ')" }
  Install-DirectoryAtomically $stage $Context.SafeRuntimeRoot $parent
}

function New-PreparedPluginCache {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [Parameter(Mandatory = $true)][string]$PluginName
  )
  $pluginRoot = Join-Path $Context.CacheRoot $PluginName
  $parent = New-Directory (Split-Path -Parent $pluginRoot)
  $stage = New-ShortSiblingPath $parent 'p'
  Register-TransientPath $stage $parent
  if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
  New-Directory $stage | Out-Null
  $version = [string]$Context.PluginVersions[$PluginName]
  $versionRoot = Join-Path $stage $version
  $sourcePlugin = Join-Path $Context.SourceMarketplace "plugins\$PluginName"
  Copy-DirectoryVerified $sourcePlugin $versionRoot
  if ($PluginName -eq 'computer-use') {
    $sourceSky = Join-Path $Context.Resources (Join-Path $Context.MirrorNodeModulesRelative '@oai\sky')
    $targetSky = Join-Path $versionRoot 'node_modules\@oai\sky'
    Copy-DirectoryVerified $sourceSky $targetSky
  }
  return $stage
}

function Set-LatestJunction {
  param(
    [Parameter(Mandatory = $true)][string]$PluginRoot,
    [Parameter(Mandatory = $true)][string]$Version
  )
  $target = Join-Path $PluginRoot $Version
  $latest = Join-Path $PluginRoot 'latest'
  if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw "Latest target is missing: $target" }
  if (Test-Path -LiteralPath $latest) { Remove-PathSafely $latest @($PluginRoot) }
  New-Item -ItemType Junction -Path $latest -Target $target | Out-Null
  $actual = Get-LatestTarget $latest
  if (-not $actual -or [System.IO.Path]::GetFullPath($actual).TrimEnd('\') -ne [System.IO.Path]::GetFullPath($target).TrimEnd('\')) {
    throw "Failed to create latest junction: $latest"
  }
}

function Update-CodexConfig {
  param([Parameter(Mandatory = $true)][object]$Context)
  $longMarketplace = '\\?\' + [System.IO.Path]::GetFullPath($Context.ActiveMarketplace)
  Set-TomlTable $Context.ConfigPath '[marketplaces.openai-bundled]' ([ordered]@{
    last_updated = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    source = $longMarketplace
    source_type = 'local'
  })
  foreach ($name in @('browser', 'chrome', 'computer-use')) {
    Set-TomlTable $Context.ConfigPath ('[plugins."' + $name + '@openai-bundled"]') ([ordered]@{ enabled = $true })
  }
  $nodeRepl = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeReplRelative
  $node = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeRelative
  $nodeModules = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeModulesRelative
  $codexCli = Join-Path $Context.ResourceMirrorRoot 'codex.exe'
  $browserClient = Join-Path $Context.ResourceMirrorRoot 'plugins\openai-bundled\plugins\browser\scripts\browser-client.mjs'
  $chromeClient = Join-Path $Context.ResourceMirrorRoot 'plugins\openai-bundled\plugins\chrome\scripts\browser-client.mjs'
  $trustedHashes = ((Get-FileSha256 $browserClient).ToLowerInvariant()) + ',' + ((Get-FileSha256 $chromeClient).ToLowerInvariant())
  Set-TomlTable $Context.ConfigPath '[mcp_servers.node_repl]' ([ordered]@{
    args = @()
    command = $nodeRepl
    startup_timeout_sec = 120
  })
  Set-TomlTable $Context.ConfigPath '[mcp_servers.node_repl.env]' ([ordered]@{
    BROWSER_USE_AVAILABLE_BACKENDS = 'chrome,iab'
    BROWSER_USE_CODEX_APP_BUILD_FLAVOR = 'prod'
    BROWSER_USE_CODEX_APP_VERSION = [string]$Context.PluginVersions['browser']
    CODEX_CLI_PATH = $codexCli
    CODEX_HOME = $Context.CodexHome
    NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER = 'Control the in-app browser in conjunction with the Browser Plugin.'
    NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME = 'Control the Chrome browser in conjunction with the Chrome Plugin. Prefer this method of controlling Chrome over alternatives unless the user explicitly requests another surface.'
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS = '1000'
    NODE_REPL_NODE_MODULE_DIRS = $nodeModules
    NODE_REPL_NODE_PATH = $node
    NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S = $trustedHashes
    NODE_REPL_TRUSTED_CODE_PATHS = $Context.CodexHome
  })
  [Environment]::SetEnvironmentVariable('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE', '1', 'User')
  $env:CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE = '1'
}

function Update-NativeHost {
  param([Parameter(Mandatory = $true)][object]$Context)
  $chromeVersion = [string]$Context.PluginVersions['chrome']
  $chromeRoot = Join-Path $Context.CacheRoot 'chrome\latest'
  $hostExe = Join-Path $chromeRoot 'extension-host\windows\x64\extension-host.exe'
  $browserClient = Join-Path $chromeRoot 'scripts\browser-client.mjs'
  if (-not (Test-Path -LiteralPath $hostExe -PathType Leaf)) { throw "Chrome extension host is missing: $hostExe" }
  $manifest = [ordered]@{
    allowed_origins = @('chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/')
    description = 'Codex chrome native messaging host'
    name = 'com.openai.codexextension'
    path = $hostExe
    type = 'stdio'
  }
  Write-JsonFile $Context.NativeManifestPath $manifest
  foreach ($registryPath in @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.openai.codexextension'
  )) {
    if (-not (Test-Path -LiteralPath $registryPath)) { New-Item -Path $registryPath -Force | Out-Null }
    Set-Item -LiteralPath $registryPath -Value $Context.NativeManifestPath
  }
  $node = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeRelative
  $nodeRepl = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeReplRelative
  $nodeModules = Join-Path $Context.ResourceMirrorRoot $Context.MirrorNodeModulesRelative
  $codexCli = Join-Path $Context.AppServerRoot 'codex.exe'
  $extensionId = 'hehggadaopoacecdllhhajmbjkdcmajg'
  $entry = $null
  $v2 = $null
  if (Test-Path -LiteralPath $Context.NativeV2Path -PathType Leaf) {
    try {
      $v2 = Read-JsonFile $Context.NativeV2Path
      $entry = @($v2.entries) | Select-Object -First 1
    } catch {
      Write-Log 'Existing chrome-native-hosts-v2.json is invalid and will be rebuilt.' 'WARN'
    }
  }
  if (-not $entry) {
    $entry = [pscustomobject]@{
      schemaVersion = 2
      appServerProtocolVersion = 2
      appVersion = $chromeVersion
      channel = 'prod'
      cliVersion = $chromeVersion
      entryId = 'codex-runtime-' + [guid]::NewGuid().ToString('N')
      extensionBuildChannels = @('prod')
      extensionIds = @($extensionId)
      installId = 'codex-install-' + [guid]::NewGuid().ToString('N')
      nativeHostNames = @('com.openai.codexextension')
      nativeHostProtocolVersion = 2
      nativeHostVersion = $chromeVersion
      paths = [pscustomobject]@{}
      proxyHost = '127.0.0.1'
      proxyPort = 0
      updatedAt = [DateTime]::UtcNow.ToString('o')
    }
    $v2 = [pscustomobject]@{ schemaVersion = 2; entries = @($entry) }
  }
  Set-ObjectProperty $entry 'schemaVersion' 2
  Set-ObjectProperty $entry 'appServerProtocolVersion' 2
  Set-ObjectProperty $entry 'nativeHostProtocolVersion' 2
  Set-ObjectProperty $entry 'appVersion' $chromeVersion
  Set-ObjectProperty $entry 'channel' 'prod'
  Set-ObjectProperty $entry 'cliVersion' $chromeVersion
  Set-ObjectProperty $entry 'extensionBuildChannels' @('prod')
  Set-ObjectProperty $entry 'extensionIds' @($extensionId)
  Set-ObjectProperty $entry 'nativeHostNames' @('com.openai.codexextension')
  Set-ObjectProperty $entry 'nativeHostVersion' $chromeVersion
  Set-ObjectProperty $entry 'updatedAt' ([DateTime]::UtcNow.ToString('o'))
  $paths = [pscustomobject]@{
    browserClientPath = $browserClient
    codexCliPath = $codexCli
    codexHome = $Context.CodexHome
    extensionHostPath = $hostExe
    nodePath = $node
    nodeModuleDirs = @($nodeModules)
    nodeReplPath = $nodeRepl
    resourcesPath = $Context.ResourceMirrorRoot
  }
  Set-ObjectProperty $entry 'paths' $paths
  if ($entry.PSObject.Properties['presence']) { $entry.PSObject.Properties.Remove('presence') }
  Set-ObjectProperty $v2 'schemaVersion' 2
  Set-ObjectProperty $v2 'entries' @($entry)
  Write-JsonFile $Context.NativeV2Path $v2
}

function Invoke-CliValidation {
  param([Parameter(Mandatory = $true)][object]$Context)
  $cli = Join-Path $Context.OfficialCliRoot 'codex.exe'
  if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw "Validated CLI is missing: $cli" }
  $oldHome = $env:CODEX_HOME
  try {
    $env:CODEX_HOME = $Context.CodexHome
    $pluginOutput = @(& $cli plugin list 2>&1)
    $pluginExit = $LASTEXITCODE
    if ($pluginExit -ne 0) { throw "codex plugin list failed: $($pluginOutput -join ' ')" }
    foreach ($name in @('browser', 'chrome', 'computer-use')) {
      $version = [string]$Context.PluginVersions[$name]
      $pattern = [regex]::Escape($name + '@openai-bundled') + '.*installed, enabled\s+' + [regex]::Escape($version)
      if (($pluginOutput -join "`n") -notmatch $pattern) {
        throw "CLI registration validation failed for $name@$version"
      }
    }
    $mcpOutput = @(& $cli mcp list 2>&1)
    $mcpExit = $LASTEXITCODE
    if ($mcpExit -ne 0) { throw "codex mcp list failed: $($mcpOutput -join ' ')" }
    if (($mcpOutput -join "`n") -notmatch '(?m)^node_repl\s+') {
      throw 'node_repl MCP is not registered after config update.'
    }
  } finally {
    if ($null -eq $oldHome) { Remove-Item Env:\CODEX_HOME -ErrorAction SilentlyContinue } else { $env:CODEX_HOME = $oldHome }
  }
}

function Save-LauncherState {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [Parameter(Mandatory = $true)][string]$Status
  )
  New-Directory $script:StateRoot | Out-Null
  $state = [ordered]@{
    schemaVersion = 1
    toolVersion = $script:ToolVersion
    updatedAt = [DateTime]::UtcNow.ToString('o')
    packageFullName = $Context.PackageFullName
    packageVersion = $Context.PackageVersion
    pluginVersions = $Context.PluginVersions
    cliContentHash = $Context.CliContentHash
    cuaContentHash = $Context.CuaContentHash
    lastBackup = $BackupRoot
    lastStatus = $Status
  }
  Write-JsonFileAtomic $script:StatePath $state
}

function Write-PendingTransaction {
  param(
    [Parameter(Mandatory = $true)][object]$Context,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [ValidateSet('repairing', 'committed', 'rolledback')][string]$Phase = 'repairing',
    [AllowNull()][string]$GoldenRoot = $null
  )
  New-Directory $script:StateRoot | Out-Null
  Write-JsonFileAtomic $script:PendingTransactionPath ([ordered]@{
    schemaVersion = 1
    createdAt = [DateTime]::UtcNow.ToString('o')
    packageVersion = $Context.PackageVersion
    packageFullName = $Context.PackageFullName
    backupRoot = $BackupRoot
    backupKind = 'Recovery'
    phase = $Phase
    goldenRoot = $GoldenRoot
    runId = $script:RunId
  })
}

function Remove-PendingTransaction {
  if (Test-Path -LiteralPath $script:PendingTransactionPath -PathType Leaf) {
    Remove-Item -LiteralPath $script:PendingTransactionPath -Force
  }
}

function Restore-RegistrySnapshot {
  param([object[]]$Entries)
  foreach ($entry in @($Entries)) {
    $path = [string]$entry.path
    if ([bool]$entry.present) {
      if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
      Set-Item -LiteralPath $path -Value ([string]$entry.value)
    } elseif (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
}

function Restore-Backup {
  param(
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [Parameter(Mandatory = $true)][object]$CurrentContext
  )
  Assert-DesktopClosed
  Stop-BrowserProcesses
  Stop-OrphanPluginHelpers
  $metadata = Test-Backup $BackupRoot
  if ([string]$metadata.packageVersion -ne $CurrentContext.PackageVersion) {
    throw "Backup package version $($metadata.packageVersion) does not match installed package $($CurrentContext.PackageVersion)."
  }
  $approvedRoots = @($CurrentContext.CodexHome, (Join-Path $env:LOCALAPPDATA 'OpenAI'), $script:ToolRoot)
  $registryBeforeRestore = @(Get-RegistryValueSnapshot)
  $environmentBeforeRestore = [Environment]::GetEnvironmentVariable('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE', 'User')
  try {
    foreach ($mapping in @($metadata.mappings)) {
      $sourcePath = [string]$mapping.source
      $backupPath = [string]$mapping.backup
      $sourceFull = [System.IO.Path]::GetFullPath($sourcePath)
      $sourceApproved = $false
      foreach ($root in $approvedRoots) {
        $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
        if ($sourceFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
          $sourceApproved = $true
          break
        }
      }
      if (-not $sourceApproved) { throw "Backup mapping target is outside approved roots: $sourceFull" }
      $parent = New-Directory (Split-Path -Parent $sourcePath)
      if ([string]$mapping.type -eq 'missing') {
        Remove-PathAtomically $sourcePath $parent
        continue
      }
      $stage = New-ShortSiblingPath $parent 'r'
      Register-TransientPath $stage $parent
      if (Test-Path -LiteralPath $stage) { Remove-PathSafely $stage @($parent) }
      if ([string]$mapping.type -eq 'file') {
        Copy-FileBytesVerified $backupPath $stage
        Install-DirectoryAtomically $stage $sourcePath $parent
        continue
      }
      if ([string]$mapping.type -eq 'directory') {
        Copy-DirectoryVerified $backupPath $stage
        Install-DirectoryAtomically $stage $sourcePath $parent
        continue
      }
      throw "Unsupported backup mapping type: $($mapping.type)"
    }
    foreach ($link in @($metadata.links)) {
      $path = [string]$link.path
      $target = [string]$link.target
      $parent = Split-Path -Parent $path
      if (Test-Path -LiteralPath $path) { Remove-PathSafely $path @($parent) }
      if ($target -and (Test-Path -LiteralPath $target -PathType Container)) {
        New-Item -ItemType Junction -Path $path -Target $target | Out-Null
      }
    }
    Restore-RegistrySnapshot @($metadata.registry)
    $previousEnv = $metadata.userEnvironment.CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE
    [Environment]::SetEnvironmentVariable('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE', $previousEnv, 'User')
    Complete-RunSwaps
    Write-Log "Backup restored: $BackupRoot" 'OK'
  } catch {
    $restoreError = $_
    $swapRollbackSucceeded = Undo-RunSwaps
    try { Restore-RegistrySnapshot $registryBeforeRestore } catch { Write-Log "Registry rollback failed during backup restore: $($_.Exception.Message)" 'ERROR' }
    try { [Environment]::SetEnvironmentVariable('CODEX_ELECTRON_ENABLE_WINDOWS_COMPUTER_USE', $environmentBeforeRestore, 'User') } catch { Write-Log "Environment rollback failed during backup restore: $($_.Exception.Message)" 'ERROR' }
    if (-not $swapRollbackSucceeded) {
      Write-Log 'One or more file or directory swaps could not be rolled back. The recovery backup was retained.' 'ERROR'
    }
    throw $restoreError
  }
}

function Invoke-Repair {
  param([Parameter(Mandatory = $true)][object]$Context)
  Assert-DesktopClosed
  Stop-BrowserProcesses
  Stop-OrphanPluginHelpers
  if ($Context.SignatureKind -ne 'Store') {
    throw "Repair requires the official Store-signed package. Current SignatureKind: $($Context.SignatureKind)"
  }
  Assert-RepairFilesUnlocked $Context
  Assert-FreeSpace $Context
  $recoveryRoot = New-RepairBackup $Context -Kind Recovery
  $goldenRoot = $null
  $transactionCommitted = $false
  Write-PendingTransaction $Context $recoveryRoot -Phase repairing
  try {
    Write-Log 'Preparing current package marketplace.'
    $marketStage = New-PreparedMarketplace $Context
    Assert-PackageUnchanged $Context
    Install-DirectoryAtomically $marketStage $Context.ActiveMarketplace (Split-Path -Parent $Context.ActiveMarketplace)

    Write-Log 'Preparing current package app-server helpers.'
    $appServerStage = New-PreparedAppServer $Context
    Install-DirectoryAtomically $appServerStage $Context.AppServerRoot (Split-Path -Parent $Context.AppServerRoot)

    Write-Log 'Preparing the official content-addressed CLI runtime.'
    Ensure-OfficialCliRuntime $Context

    Write-Log 'Preparing current package Node runtime. The first update-aware run may take several minutes.'
    Ensure-SafeNodeRuntime $Context

    foreach ($name in @('browser', 'chrome', 'computer-use')) {
      Write-Log "Preparing plugin cache: $name@$($Context.PluginVersions[$name])"
      $stage = New-PreparedPluginCache $Context $name
      $target = Join-Path $Context.CacheRoot $name
      Install-DirectoryAtomically $stage $target $Context.CacheRoot
      Set-LatestJunction $target ([string]$Context.PluginVersions[$name])
    }

    Write-Log 'Updating scoped Codex configuration.'
    Update-CodexConfig $Context
    Write-Log 'Updating Chrome native host paths.'
    Update-NativeHost $Context
    Write-Log 'Validating registration with the current package CLI.'
    Invoke-CliValidation $Context
    Assert-PackageUnchanged $Context

    $issues = @(Get-StateIssues $Context)
    if ($issues.Count -gt 0) {
      throw "Post-repair static validation failed: $($issues -join '; ')"
    }
    Write-Log 'Static repair passed. Creating the persistent golden backup.'
    $goldenRoot = New-RepairBackup $Context -Kind Golden
    Write-PendingTransaction $Context $recoveryRoot -Phase repairing -GoldenRoot $goldenRoot
    Complete-RunSwaps
    Save-LauncherState $Context $goldenRoot 'repaired'
    Write-PendingTransaction $Context $recoveryRoot -Phase committed -GoldenRoot $goldenRoot
    $transactionCommitted = $true
    try {
      Remove-RepairBackupDirectory $recoveryRoot Recovery
      Write-Log 'The temporary recovery backup was removed.' 'OK'
      Remove-PendingTransaction
    } catch {
      Write-Log "Repair succeeded, but the temporary recovery backup could not be removed: $($_.Exception.Message)" 'WARN'
      Write-Log 'The committed transaction marker was retained so cleanup can be retried next launch.' 'WARN'
    }
    Write-Log 'Repair completed and all static gates passed.' 'OK'
    return $goldenRoot
  } catch {
    $repairError = $_
    if ($transactionCommitted) {
      Write-Log "Post-commit cleanup failed without invalidating the repair: $($repairError.Exception.Message)" 'WARN'
      return $goldenRoot
    }
    Write-Log "Repair failed: $($repairError.Exception.Message)" 'ERROR'
    $swapRollbackSucceeded = Undo-RunSwaps
    $restoreSucceeded = $false
    if ($swapRollbackSucceeded) {
      try {
        Restore-Backup $recoveryRoot $Context
        $restoreSucceeded = $true
        Write-Log 'The temporary recovery backup was restored automatically.' 'OK'
      } catch {
        Write-Log "Automatic backup restore failed: $($_.Exception.Message)" 'ERROR'
        Write-Log "The recovery backup was retained for manual recovery: $recoveryRoot" 'ERROR'
      }
    } else {
      Write-Log 'The repair swaps could not be rolled back cleanly. Automatic backup restore was not attempted.' 'ERROR'
      Write-Log "The recovery backup was retained for manual recovery: $recoveryRoot" 'ERROR'
    }
    if ($restoreSucceeded) {
      Write-PendingTransaction $Context $recoveryRoot -Phase rolledback -GoldenRoot $goldenRoot
      $pendingRemoved = $false
      try {
        Remove-RepairBackupDirectory $recoveryRoot Recovery
        Remove-PendingTransaction
        $pendingRemoved = $true
      } catch {
        Write-Log "Could not finish recovery cleanup: $($_.Exception.Message)" 'WARN'
      }
      if ($pendingRemoved) {
        try {
          if ($goldenRoot) { Remove-RepairBackupDirectory $goldenRoot Golden }
          Write-Log 'Temporary repair backups were removed after successful rollback.' 'OK'
        } catch {
          Write-Log "Could not remove the uncommitted golden backup: $($_.Exception.Message)" 'WARN'
        }
      }
    }
    throw $repairError
  }
}

function Start-DesktopAndVerify {
  param([Parameter(Mandatory = $true)][object]$Context)
  $resourceVariable = 'CODEX_ELECTRON_BUNDLED_PLUGINS_RESOURCES_PATH'
  $previousResourceOverride = [Environment]::GetEnvironmentVariable($resourceVariable, 'Process')
  if (-not (Test-Path -LiteralPath $Context.DesktopExecutable -PathType Leaf)) {
    throw "Desktop executable is missing: $($Context.DesktopExecutable)"
  }
  if (@(Get-ResourceMirrorIssues $Context).Count -gt 0) {
    throw 'The official resources mirror is not valid; Desktop will not be launched.'
  }
  Write-Log "Launching the packaged Desktop executable with the official resources mirror: $($Context.ResourceMirrorRoot)"
  try {
    [Environment]::SetEnvironmentVariable($resourceVariable, $Context.ResourceMirrorRoot, 'Process')
    Start-Process -FilePath $Context.DesktopExecutable -WorkingDirectory (Split-Path -Parent $Context.DesktopExecutable) | Out-Null
  } finally {
    [Environment]::SetEnvironmentVariable($resourceVariable, $previousResourceOverride, 'Process')
  }
  $started = $false
  for ($index = 0; $index -lt 60; $index++) {
    Start-Sleep -Seconds 1
    if (@(Get-DesktopProcesses).Count -gt 0) { $started = $true; break }
  }
  if (-not $started) { throw 'ChatGPT Desktop did not start within 60 seconds.' }
  Write-Log 'Desktop started. Waiting up to 120 seconds for two consecutive clean reconciliation checks.'
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  $cleanPasses = 0
  $issues = @()
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 5
    if (@(Get-DesktopProcesses).Count -eq 0) {
      throw 'ChatGPT Desktop exited during startup reconciliation.'
    }
    try {
      $issues = @(Get-StateIssues $Context)
    } catch {
      $cleanPasses = 0
      $issues = @('transient state read failure: ' + $_.Exception.Message)
      Write-Log "Startup state is temporarily unreadable: $($_.Exception.Message)" 'WARN'
      continue
    }
    if ($issues.Count -eq 0) {
      $cleanPasses++
      Write-Log "Post-start clean check $cleanPasses of 2." 'OK'
      if ($cleanPasses -ge 2) {
        Write-Log 'Post-start static verification passed.' 'OK'
        return
      }
    } else {
      $cleanPasses = 0
      Write-Log "Startup reconciliation is still changing plugin state ($($issues.Count) issue(s))." 'WARN'
    }
  }
  foreach ($issue in $issues) { Write-Log "Post-start drift: $issue" 'ERROR' }
  throw 'Desktop did not reach a stable plugin state within 120 seconds. Exit Desktop and use Rollback-Last.cmd or rerun diagnosis.'
}

function Invoke-SelfTest {
  $root = Join-Path $script:ToolRoot ('SelfTest-' + $script:RunId)
  New-Directory $root | Out-Null
  try {
    $source = Join-Path $root 'source'
    $copy = Join-Path $root 'copy'
    New-Directory (Join-Path $source 'nested') | Out-Null
    Write-Utf8File (Join-Path $source 'one.txt') 'alpha'
    Write-Utf8File (Join-Path $source 'nested\two.txt') ('unicode-' + [char]0x6D4B + [char]0x8BD5)
    Copy-DirectoryVerified $source $copy
    $diff = @(Get-DirectoryDifferences $source $copy)
    if ($diff.Count -ne 0) { throw "Self-test copy mismatch: $($diff -join '; ')" }
    $backupMappings = New-Object System.Collections.ArrayList
    $backupCopy = Join-Path $root 'backup-copy\one.txt'
    Copy-BackupItem (Join-Path $source 'one.txt') $backupCopy $backupMappings
    if ($backupMappings.Count -ne 1 -or -not (Test-Path -LiteralPath $backupCopy -PathType Leaf)) {
      throw 'Self-test empty backup mapping failed.'
    }
    $longRoot = Join-Path $root 'long-path'
    $longDirectory = $longRoot
    while ((Join-Path $longDirectory 'copied.txt').Length -lt 280) {
      $longDirectory = Join-Path $longDirectory ('segment-' + ('x' * 32))
    }
    $longCopy = Join-Path $longDirectory 'copied.txt'
    Copy-FileBytesVerified (Join-Path $source 'one.txt') $longCopy
    if (-not [System.IO.File]::Exists((Get-LongPath $longCopy))) {
      throw 'Self-test long-path copy failed.'
    }
    [System.IO.Directory]::Delete((Get-LongPath $longRoot), $true)
    $longTreeSource = Join-Path $root 'long-tree-source'
    $longTreeDirectory = $longTreeSource
    while ((Join-Path $longTreeDirectory 'deep.txt').Length -lt 285) {
      $longTreeDirectory = Join-Path $longTreeDirectory ('module-' + ('y' * 32))
    }
    New-Directory $longTreeDirectory | Out-Null
    $longTreeFile = Join-Path $longTreeDirectory 'deep.txt'
    [System.IO.File]::WriteAllText((Get-LongPath $longTreeFile), 'deep-value', (New-Object System.Text.UTF8Encoding($false)))
    $longTreeCopy = Join-Path $root 'long-tree-copy'
    Copy-DirectoryVerified $longTreeSource $longTreeCopy
    $longTreeDiff = @(Get-DirectoryDifferences $longTreeSource $longTreeCopy)
    if ($longTreeDiff.Count -ne 0) { throw "Self-test long directory mismatch: $($longTreeDiff -join '; ')" }
    [System.IO.Directory]::Delete((Get-LongPath $longTreeSource), $true)
    [System.IO.Directory]::Delete((Get-LongPath $longTreeCopy), $true)
    $deleteTarget = Join-Path $root 'junction-target'
    $deleteTree = Join-Path $root 'delete-tree'
    New-Directory $deleteTarget | Out-Null
    New-Directory (Join-Path $deleteTree 'nested') | Out-Null
    Write-Utf8File (Join-Path $deleteTarget 'keep.txt') 'keep'
    Write-Utf8File (Join-Path $deleteTree 'nested\remove.txt') 'remove'
    New-Item -ItemType Junction -Path (Join-Path $deleteTree 'linked-target') -Target $deleteTarget | Out-Null
    Remove-PathSafely $deleteTree @($root)
    if (Test-Path -LiteralPath $deleteTree) { throw 'Self-test long tree removal failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $deleteTarget 'keep.txt') -PathType Leaf)) { throw 'Self-test junction-safe removal followed the target.' }
    $atomicRoot = Join-Path $root 'atomic'
    $atomicTarget = Join-Path $atomicRoot 'target'
    $atomicStage = Join-Path $atomicRoot 'stage'
    New-Directory $atomicTarget | Out-Null
    New-Directory $atomicStage | Out-Null
    Write-Utf8File (Join-Path $atomicTarget 'value.txt') 'old'
    Write-Utf8File (Join-Path $atomicStage 'value.txt') 'new'
    Install-DirectoryAtomically $atomicStage $atomicTarget $atomicRoot
    if ((Get-Content -Raw -LiteralPath (Join-Path $atomicTarget 'value.txt')) -ne 'new') { throw 'Self-test atomic install failed.' }
    if (-not (Undo-RunSwaps)) { throw 'Self-test atomic install rollback reported a failure.' }
    if ((Get-Content -Raw -LiteralPath (Join-Path $atomicTarget 'value.txt')) -ne 'old') { throw 'Self-test atomic install rollback failed.' }
    Remove-PathAtomically $atomicTarget $atomicRoot
    if (Test-Path -LiteralPath $atomicTarget) { throw 'Self-test atomic removal failed.' }
    if (-not (Undo-RunSwaps)) { throw 'Self-test atomic removal rollback reported a failure.' }
    if ((Get-Content -Raw -LiteralPath (Join-Path $atomicTarget 'value.txt')) -ne 'old') { throw 'Self-test atomic removal rollback failed.' }
    $commitStage = Join-Path $atomicRoot 'commit-stage'
    New-Directory $commitStage | Out-Null
    Write-Utf8File (Join-Path $commitStage 'value.txt') 'committed'
    Install-DirectoryAtomically $commitStage $atomicTarget $atomicRoot
    Complete-RunSwaps
    if ((Get-Content -Raw -LiteralPath (Join-Path $atomicTarget 'value.txt')) -ne 'committed') { throw 'Self-test atomic commit failed.' }
    $atomicJson = Join-Path $root 'atomic-state.json'
    Write-JsonFileAtomic $atomicJson ([ordered]@{ value = 1 })
    Write-JsonFileAtomic $atomicJson ([ordered]@{ value = 2 })
    if ([int](Read-JsonFile $atomicJson).value -ne 2) { throw 'Self-test atomic JSON replacement failed.' }
    $config = Join-Path $root 'config.toml'
    Write-Utf8File $config "model = 'test'`r`n`r`n[sample]`r`nunknown = 'keep'`r`n"
    Set-TomlTable $config '[sample]' ([ordered]@{ enabled = $true; path = 'C:\sample'; args = @() })
    $sample = Get-TomlTableText $config '[sample]'
    if ($sample -notmatch 'enabled\s*=\s*true' -or $sample -notmatch 'args\s*=\s*\[\]' -or $sample -notmatch "unknown\s*=\s*'keep'") {
      throw 'Self-test TOML update failed.'
    }
    $context = Get-CurrentContext
    $encryptedCopy = Join-Path $root 'encrypted-source-copy.json'
    Copy-FileBytesVerified $context.SourceMarketplaceManifest $encryptedCopy
    Write-Log 'Self-test passed.' 'OK'
  } finally {
    if (Test-Path -LiteralPath $root) { Remove-PathSafely $root @($script:ToolRoot) }
  }
}

function Invoke-Main {
  Initialize-Logging
  Acquire-LauncherMutex
  Write-Log "ChatGPT Plugin Safe Launcher $($script:ToolVersion)"
  Write-Log "Mode: $Mode"
  if ($Mode -eq 'SelfTest') {
    Invoke-SelfTest
    return
  }
  $context = Get-CurrentContext
  Write-Log ("Adaptive package contract: package={0}; bundled={1}; cli={2}; cua={3}" -f `
    $context.PackageVersion,
    $context.BundledContentHash,
    $context.CliContentHash,
    $context.CuaContentHash)
  if (Test-Path -LiteralPath $script:PendingTransactionPath -PathType Leaf) {
    $pending = Read-JsonFile $script:PendingTransactionPath
    $pendingPhase = if ($pending.PSObject.Properties['phase']) { [string]$pending.phase } else { 'repairing' }
    if ($pendingPhase -notin @('repairing', 'committed', 'rolledback')) { $pendingPhase = 'repairing' }
    Write-Log "A $pendingPhase transaction was found from run $($pending.runId)." 'WARN'
    if ($Mode -eq 'DiagnoseOnly') {
      Write-Log 'Diagnosis mode will not recover it. Use the normal launcher after Desktop is closed.' 'WARN'
    } else {
      if ([string]$pending.packageVersion -ne $context.PackageVersion) {
        throw "The unfinished transaction belongs to package $($pending.packageVersion), but the installed package is $($context.PackageVersion). Manual review is required."
      }
      $pendingBackup = [string]$pending.backupRoot
      $pendingGolden = if ($pending.PSObject.Properties['goldenRoot']) { [string]$pending.goldenRoot } else { $null }
      $removePendingGolden = ($pendingPhase -ne 'committed')
      if ($pendingPhase -eq 'repairing') {
        Restore-Backup $pendingBackup $context
        Write-PendingTransaction $context $pendingBackup -Phase rolledback -GoldenRoot $pendingGolden
        $pendingPhase = 'rolledback'
        Write-Log 'The unfinished repair was rolled back before continuing.' 'OK'
      } else {
        Write-Log "The transaction is already $pendingPhase; only temporary cleanup is required." 'OK'
      }
      $cleanupSucceeded = $true
      if ($pendingBackup -and (Test-Path -LiteralPath $pendingBackup) -and [System.IO.Path]::GetFileName($pendingBackup).StartsWith('T-', [System.StringComparison]::OrdinalIgnoreCase)) {
        try {
          Remove-RepairBackupDirectory $pendingBackup Recovery
        } catch {
          $cleanupSucceeded = $false
          Write-Log "Resolved transaction cleanup failed: $($_.Exception.Message)" 'WARN'
        }
      }
      if ($cleanupSucceeded -and $removePendingGolden -and $pendingGolden -and (Test-Path -LiteralPath $pendingGolden)) {
        try {
          Remove-RepairBackupDirectory $pendingGolden Golden
        } catch {
          $cleanupSucceeded = $false
          Write-Log "Uncommitted golden backup cleanup failed: $($_.Exception.Message)" 'WARN'
        }
      }
      if (-not $cleanupSucceeded) {
        throw 'The transaction is resolved, but its temporary recovery backup is still locked. Close related processes and run the launcher again.'
      }
      Remove-PendingTransaction
      Write-Log 'The resolved transaction marker and temporary recovery backup were removed.' 'OK'
    }
  }
  $issues = @(Get-StateIssues $context)
  Write-Diagnosis $context $issues
  if ($Mode -eq 'DiagnoseOnly') { return }
  if ($Mode -eq 'RollbackLast') {
    if (-not (Test-Path -LiteralPath $script:StatePath -PathType Leaf)) { throw 'No launcher state file exists.' }
    $state = Read-JsonFile $script:StatePath
    $backup = [string]$state.lastBackup
    if ([string]::IsNullOrWhiteSpace($backup)) { throw 'No last backup is recorded.' }
    Restore-Backup $backup $context
    return
  }
  Assert-DesktopClosed
  Stop-BrowserProcesses
  Stop-OrphanPluginHelpers
  Ensure-OfficialResourcesMirror $context
  $issues = @(Get-StateIssues $context)
  if ($issues.Count -gt 0) {
    Invoke-Repair $context | Out-Null
  } else {
    Write-Log 'No repair is needed. The launcher will start Desktop.' 'OK'
  }
  Start-DesktopAndVerify $context
  Invoke-BackupRetention
  Remove-LegacyLauncherAfterVerifiedStart
}

$exitCode = 0
try {
  Invoke-Main
} catch {
  $exitCode = 1
  try {
    Write-Log $_.Exception.Message 'ERROR'
    if ($_.InvocationInfo -and $_.InvocationInfo.PositionMessage) {
      Write-Log ($_.InvocationInfo.PositionMessage -replace "`r?`n", ' ') 'ERROR'
    }
    if ($_.ScriptStackTrace) { Write-Log ($_.ScriptStackTrace -replace "`r?`n", ' | ') 'ERROR' }
    if ($script:LogPath) { Write-Log "Log: $script:LogPath" 'ERROR' }
  } catch {
    Write-Host "Fatal error: $($_.Exception.Message)"
  }
} finally {
  Remove-TransientPaths
  if ($script:LauncherMutexAcquired -and $script:LauncherMutex) {
    try { $script:LauncherMutex.ReleaseMutex() } catch { }
  }
  if ($script:LauncherMutex) { $script:LauncherMutex.Dispose() }
  if (-not $NoPause) {
    Write-Host ''
    [void](Read-Host 'Press Enter to close')
  }
}
exit $exitCode
