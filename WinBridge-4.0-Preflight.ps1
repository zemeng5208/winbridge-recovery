[CmdletBinding()]
param(
  [switch]$JsonOnly,
  [switch]$NoConsole
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ToolVersion = '4.0.0-preview.1'
$script:ToolRoot = $PSScriptRoot
$script:LogsRoot = Join-Path $script:ToolRoot 'Logs'
$script:RunId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$script:Checks = New-Object System.Collections.ArrayList

function Add-Check {
  param(
    [Parameter(Mandatory = $true)][string]$Layer,
    [Parameter(Mandatory = $true)][string]$Name,
    [ValidateSet('OK','INFO','WARN','ERROR')][string]$Status,
    [Parameter(Mandatory = $true)][string]$Summary,
    [AllowNull()][object]$Details
  )

  [void]$script:Checks.Add([pscustomobject]@{
    layer = $Layer
    name = $Name
    status = $Status
    summary = $Summary
    details = $Details
  })
}

function Write-Status {
  param(
    [ValidateSet('OK','INFO','WARN','ERROR')][string]$Status,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if ($NoConsole -or $JsonOnly) { return }
  Write-Host ('[{0}] {1}' -f $Status, $Message)
}

function Read-JsonSafe {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    return (Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-PluginVersionFromManifest {
  param([Parameter(Mandatory = $true)][string]$PluginRoot)
  $manifest = Join-Path $PluginRoot '.codex-plugin\plugin.json'
  if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { return $null }
  $json = Read-JsonSafe $manifest
  if ($null -eq $json) { return $null }
  return [string]$json.version
}

function Get-RegistryValueSafe {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )
  try {
    return (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name
  } catch {
    return $null
  }
}

function Get-DriveFreeBytes {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($Path))
    $drive = New-Object System.IO.DriveInfo($root)
    if ($drive.IsReady) { return [int64]$drive.AvailableFreeSpace }
  } catch {
  }
  return $null
}

function Get-WindowsIdentity {
  $result = [ordered]@{
    caption = $null
    version = [string][Environment]::OSVersion.Version
    build = [Environment]::OSVersion.Version.Build
    architecture = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  }
  try {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $result.caption = [string]$os.Caption
    $result.version = [string]$os.Version
    $result.build = [int]$os.BuildNumber
    $result.architecture = [string]$os.OSArchitecture
  } catch {
  }
  return [pscustomobject]$result
}

function Get-LayerState {
  param([Parameter(Mandatory = $true)][string]$Layer)
  $layerChecks = @($script:Checks | Where-Object layer -EQ $Layer)
  if (@($layerChecks | Where-Object status -EQ 'ERROR').Count -gt 0) { return 'error' }
  if (@($layerChecks | Where-Object status -EQ 'WARN').Count -gt 0) { return 'warning' }
  if ($layerChecks.Count -eq 0) { return 'unknown' }
  return 'healthy'
}

try {
  if (-not (Test-Path -LiteralPath $script:LogsRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $script:LogsRoot -Force | Out-Null
  }

  $windows = Get-WindowsIdentity
  $psVersion = $PSVersionTable.PSVersion.ToString()
  $isWindows10Family = ($windows.build -ge 10240 -and $windows.build -lt 22000)
  $isWindows11Family = ($windows.build -ge 22000)

  if ($windows.build -lt 10240) {
    Add-Check 'host' 'windows-version' 'ERROR' 'This Windows build predates the Windows 10 platform family.' $windows
  } elseif ($isWindows10Family) {
    Add-Check 'host' 'windows-version' 'INFO' 'Windows 10 detected. WinBridge can inspect this host, but actual Codex Desktop availability still depends on the installed official package.' $windows
  } elseif ($isWindows11Family) {
    Add-Check 'host' 'windows-version' 'OK' 'Windows 11-family build detected.' $windows
  } else {
    Add-Check 'host' 'windows-version' 'INFO' 'Windows 10/11 platform family detected.' $windows
  }

  if ($PSVersionTable.PSVersion -lt [Version]'5.1') {
    Add-Check 'host' 'powershell' 'ERROR' ('Windows PowerShell 5.1 or newer is required; current version is {0}.' -f $psVersion) $psVersion
  } else {
    Add-Check 'host' 'powershell' 'OK' ('PowerShell host: {0}' -f $psVersion) $psVersion
  }

  $longPathsEnabled = Get-RegistryValueSafe 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' 'LongPathsEnabled'
  if ($longPathsEnabled -eq 1) {
    Add-Check 'host' 'long-path-policy' 'OK' 'Windows long-path policy is enabled.' $longPathsEnabled
  } else {
    Add-Check 'host' 'long-path-policy' 'WARN' 'Windows long-path policy is not enabled. WinBridge 4.0 uses long-path-safe cleanup internally, but third-party tooling may still fail on deeply nested plugin paths.' $longPathsEnabled
  }

  $launcherRootLength = ([System.IO.Path]::GetFullPath($script:ToolRoot)).Length
  if ($launcherRootLength -gt 120) {
    Add-Check 'host' 'launcher-path-length' 'WARN' ('The WinBridge folder is already {0} characters long; a shorter install path is recommended.' -f $launcherRootLength) $script:ToolRoot
  } else {
    Add-Check 'host' 'launcher-path-length' 'OK' ('Launcher root length: {0} characters.' -f $launcherRootLength) $script:ToolRoot
  }

  $freeBytes = Get-DriveFreeBytes $script:ToolRoot
  if ($null -ne $freeBytes -and $freeBytes -lt 2147483648L) {
    Add-Check 'host' 'free-space' 'WARN' ('Less than 2 GiB is free on the WinBridge volume ({0:N0} bytes).' -f $freeBytes) $freeBytes
  } elseif ($null -ne $freeBytes) {
    Add-Check 'host' 'free-space' 'OK' ('Free space: {0:N0} bytes.' -f $freeBytes) $freeBytes
  }

  $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1

  $packageInfo = $null
  $sourceMarketplace = $null
  $sourceVersions = [ordered]@{}
  if ($null -eq $package) {
    Add-Check 'package' 'codex-appx' 'ERROR' 'The official OpenAI.Codex AppX package was not found for the current user.' $null
  } else {
    $resources = Join-Path ([string]$package.InstallLocation) 'app\resources'
    $desktopExecutable = Join-Path ([string]$package.InstallLocation) 'app\ChatGPT.exe'
    $sourceMarketplace = Join-Path $resources 'plugins\openai-bundled'
    $packageInfo = [ordered]@{
      packageFullName = [string]$package.PackageFullName
      packageFamilyName = [string]$package.PackageFamilyName
      version = [string]$package.Version
      signatureKind = [string]$package.SignatureKind
      installLocation = [string]$package.InstallLocation
      resources = $resources
      desktopExecutable = $desktopExecutable
    }
    Add-Check 'package' 'codex-appx' 'OK' ('Installed package: {0}' -f $packageInfo.packageFullName) $packageInfo

    if (-not (Test-Path -LiteralPath $desktopExecutable -PathType Leaf)) {
      Add-Check 'package' 'desktop-executable' 'ERROR' 'The installed package is present but app\ChatGPT.exe is missing.' $desktopExecutable
    } else {
      Add-Check 'package' 'desktop-executable' 'OK' 'Desktop executable exists.' $desktopExecutable
    }

    if (-not (Test-Path -LiteralPath $sourceMarketplace -PathType Container)) {
      Add-Check 'package' 'bundled-marketplace' 'ERROR' 'The installed package does not expose the expected bundled marketplace directory.' $sourceMarketplace
    } else {
      foreach ($pluginName in @('browser','chrome','computer-use')) {
        $sourceVersion = Get-PluginVersionFromManifest (Join-Path $sourceMarketplace ('plugins\' + $pluginName))
        $sourceVersions[$pluginName] = $sourceVersion
      }
      Add-Check 'package' 'bundled-marketplace' 'OK' 'Bundled marketplace is present.' $sourceVersions
    }
  }

  $codexHome = Join-Path $env:USERPROFILE '.codex'
  $activeMarketplace = Join-Path $codexHome '.tmp\bundled-marketplaces\openai-bundled'
  if (-not (Test-Path -LiteralPath $codexHome -PathType Container)) {
    Add-Check 'marketplace' 'codex-home' 'WARN' 'The .codex user state directory does not exist yet.' $codexHome
  } else {
    Add-Check 'marketplace' 'codex-home' 'OK' 'Codex user state directory exists.' $codexHome
  }

  $activeVersions = [ordered]@{}
  if (-not (Test-Path -LiteralPath $activeMarketplace -PathType Container)) {
    Add-Check 'marketplace' 'active-marketplace' 'WARN' 'The active bundled marketplace has not been materialized.' $activeMarketplace
  } else {
    $activeMismatch = New-Object System.Collections.ArrayList
    foreach ($pluginName in @('browser','chrome','computer-use')) {
      $actualVersion = Get-PluginVersionFromManifest (Join-Path $activeMarketplace ('plugins\' + $pluginName))
      $activeVersions[$pluginName] = $actualVersion
      if ($sourceVersions.Contains($pluginName) -and $sourceVersions[$pluginName] -and $actualVersion -ne $sourceVersions[$pluginName]) {
        [void]$activeMismatch.Add(('{0}: source={1}, active={2}' -f $pluginName, $sourceVersions[$pluginName], $actualVersion))
      }
    }
    if ($activeMismatch.Count -gt 0) {
      Add-Check 'marketplace' 'active-marketplace' 'WARN' ('Active marketplace differs from the installed package: {0}' -f ($activeMismatch -join '; ')) $activeVersions
    } else {
      Add-Check 'marketplace' 'active-marketplace' 'OK' 'Active marketplace versions match the installed package where version data is available.' $activeVersions
    }
  }

  $cacheRoot = Join-Path $codexHome 'plugins\cache\openai-bundled'
  $cacheState = [ordered]@{}
  foreach ($pluginName in @('browser','chrome','computer-use')) {
    $pluginRoot = Join-Path $cacheRoot $pluginName
    $latestRoot = Join-Path $pluginRoot 'latest'
    $latestVersion = Get-PluginVersionFromManifest $latestRoot
    $expectedVersion = if ($sourceVersions.Contains($pluginName)) { $sourceVersions[$pluginName] } else { $null }
    $expectedRoot = if ($expectedVersion) { Join-Path $pluginRoot ([string]$expectedVersion) } else { $null }
    $expectedExists = ($expectedRoot -and (Test-Path -LiteralPath $expectedRoot -PathType Container))

    $cacheState[$pluginName] = [ordered]@{
      expectedVersion = $expectedVersion
      expectedVersionDirectoryExists = [bool]$expectedExists
      latestVersion = $latestVersion
      latestPath = $latestRoot
    }

    if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
      Add-Check 'cache' ($pluginName + '-cache') 'WARN' ('Plugin cache is missing: {0}' -f $pluginName) $cacheState[$pluginName]
    } elseif ($expectedVersion -and -not $expectedExists) {
      Add-Check 'cache' ($pluginName + '-cache') 'WARN' ('Current package version is not materialized in the cache: {0}@{1}' -f $pluginName, $expectedVersion) $cacheState[$pluginName]
    } elseif ($expectedVersion -and $latestVersion -ne $expectedVersion) {
      Add-Check 'cache' ($pluginName + '-cache') 'WARN' ('latest does not resolve to the current package version: {0}, expected={1}, latest={2}' -f $pluginName, $expectedVersion, $latestVersion) $cacheState[$pluginName]
    } else {
      Add-Check 'cache' ($pluginName + '-cache') 'OK' ('Cache/latest state looks current for {0}.' -f $pluginName) $cacheState[$pluginName]
    }
  }

  $nativeManifest = Join-Path $env:LOCALAPPDATA 'OpenAI\extension\com.openai.codexextension.json'
  $nativeV2 = Join-Path $codexHome 'chrome-native-hosts-v2.json'
  $chromeRegistry = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.openai.codexextension'
  $edgeRegistry = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.openai.codexextension'

  $nativeState = [ordered]@{
    manifest = $nativeManifest
    manifestExists = (Test-Path -LiteralPath $nativeManifest -PathType Leaf)
    v2 = $nativeV2
    v2Exists = (Test-Path -LiteralPath $nativeV2 -PathType Leaf)
    chromeRegistryExists = (Test-Path -LiteralPath $chromeRegistry)
    edgeRegistryExists = (Test-Path -LiteralPath $edgeRegistry)
  }

  if (-not $nativeState.manifestExists) {
    Add-Check 'native-host' 'manifest' 'WARN' 'Native Messaging Host manifest is missing.' $nativeState
  } else {
    Add-Check 'native-host' 'manifest' 'OK' 'Native Messaging Host manifest exists.' $nativeState
  }
  if (-not $nativeState.v2Exists) {
    Add-Check 'native-host' 'v2-state' 'WARN' 'chrome-native-hosts-v2.json is missing.' $nativeState
  } else {
    Add-Check 'native-host' 'v2-state' 'OK' 'chrome-native-hosts-v2.json exists.' $nativeState
  }
  if (-not $nativeState.chromeRegistryExists -and -not $nativeState.edgeRegistryExists) {
    Add-Check 'native-host' 'browser-registration' 'WARN' 'No Chrome or Edge NativeMessagingHosts registration was found for the current user.' $nativeState
  } else {
    Add-Check 'native-host' 'browser-registration' 'OK' 'At least one browser NativeMessagingHosts registration exists.' $nativeState
  }

  $pendingTransactionPath = Join-Path $script:ToolRoot 'State\pending-transaction.json'
  if (Test-Path -LiteralPath $pendingTransactionPath -PathType Leaf) {
    $pending = Read-JsonSafe $pendingTransactionPath
    Add-Check 'recovery' 'pending-transaction' 'WARN' 'A pending WinBridge recovery transaction exists and should be reconciled before assuming the previous run completed cleanly.' $pending
  } else {
    Add-Check 'recovery' 'pending-transaction' 'OK' 'No pending recovery transaction was found.' $pendingTransactionPath
  }

  $browserProcesses = @()
  foreach ($name in @('chrome','msedge')) {
    foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      $browserProcesses += [pscustomobject]@{ name = $name; pid = $process.Id }
    }
  }
  if ($browserProcesses.Count -gt 0) {
    Add-Check 'runtime' 'browser-processes' 'INFO' 'Chrome/Edge is currently running. Repair mode will ask for these processes to be closed before changing Native Host/plugin state.' $browserProcesses
  } else {
    Add-Check 'runtime' 'browser-processes' 'OK' 'Chrome and Edge are not currently running.' $null
  }

  $layerOrder = @('host','package','marketplace','cache','native-host','recovery','runtime')
  $layers = [ordered]@{}
  foreach ($layer in $layerOrder) {
    $layers[$layer] = Get-LayerState $layer
  }

  $firstDivergence = $null
  foreach ($layer in @('package','marketplace','cache','native-host')) {
    if ($layers[$layer] -in @('warning','error')) {
      $firstDivergence = $layer
      break
    }
  }
  if (-not $firstDivergence) { $firstDivergence = 'none-detected' }

  $summaryStatus = 'healthy'
  if (@($script:Checks | Where-Object status -EQ 'ERROR').Count -gt 0) {
    $summaryStatus = 'error'
  } elseif (@($script:Checks | Where-Object status -EQ 'WARN').Count -gt 0) {
    $summaryStatus = 'warning'
  }

  $report = [ordered]@{
    schemaVersion = 1
    toolVersion = $script:ToolVersion
    generatedUtc = [DateTime]::UtcNow.ToString('o')
    runId = $script:RunId
    status = $summaryStatus
    firstDivergence = $firstDivergence
    layers = $layers
    host = [ordered]@{
      windows = $windows
      powershell = $psVersion
      launcherRoot = $script:ToolRoot
      launcherRootLength = $launcherRootLength
      longPathsEnabled = $longPathsEnabled
      freeBytes = $freeBytes
    }
    package = $packageInfo
    pluginVersions = [ordered]@{
      source = $sourceVersions
      active = $activeVersions
      cache = $cacheState
    }
    nativeHost = $nativeState
    checks = @($script:Checks)
  }

  $reportPath = Join-Path $script:LogsRoot ('preflight-{0}.json' -f $script:RunId)
  $json = $report | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText($reportPath, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

  if ($JsonOnly) {
    Write-Output $json
  } elseif (-not $NoConsole) {
    Write-Host ('WinBridge Recovery {0} preflight' -f $script:ToolVersion)
    Write-Host ('Status: {0}; first divergence: {1}' -f $summaryStatus, $firstDivergence)
    foreach ($check in $script:Checks) {
      Write-Status $check.status ('{0}/{1}: {2}' -f $check.layer, $check.name, $check.summary)
    }
    Write-Host ('Preflight report: {0}' -f $reportPath)
  }

  if ($summaryStatus -eq 'error') { exit 2 }
  if ($summaryStatus -eq 'warning') { exit 1 }
  exit 0
} catch {
  $fallbackPath = Join-Path $script:LogsRoot ('preflight-{0}-failed.json' -f $script:RunId)
  $failure = [ordered]@{
    schemaVersion = 1
    toolVersion = $script:ToolVersion
    generatedUtc = [DateTime]::UtcNow.ToString('o')
    runId = $script:RunId
    status = 'error'
    error = $_.Exception.Message
  }
  try {
    if (-not (Test-Path -LiteralPath $script:LogsRoot -PathType Container)) {
      New-Item -ItemType Directory -Path $script:LogsRoot -Force | Out-Null
    }
    [System.IO.File]::WriteAllText(
      $fallbackPath,
      (($failure | ConvertTo-Json -Depth 10) + [Environment]::NewLine),
      (New-Object System.Text.UTF8Encoding($false)))
  } catch {
  }
  if (-not $NoConsole) {
    Write-Host ('[ERROR] WinBridge 4.0 preflight failed: {0}' -f $_.Exception.Message)
  }
  exit 3
}
