[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$root = $PSScriptRoot
$source = Join-Path $root 'WinBridgeRecovery.cs'
$minesweeperSource = Join-Path $root 'MinesweeperGameWindow.cs'
$socialFeedSource = Join-Path $root 'SocialFeedWindow.cs'
$advancedSettingsSource = Join-Path $root 'AdvancedSettingsWindow.cs'
$localizationSource = Join-Path $root 'LauncherLocalization.cs'
$updateSource = Join-Path $root 'UpdateWindow.cs'
$updateBootstrapperSource = Join-Path $root 'WinBridgeUpdateBootstrapper.cs'
$updateBootstrapperOutput = Join-Path $root 'WinBridgeUpdateBootstrapper.exe'
$output = Join-Path $root 'WinBridgeRecovery.exe'
$guardianSource = Join-Path $root 'WinBridgeGuardian.cs'
$guardianOutput = Join-Path $root 'WinBridgeGuardian.exe'
$icon = Join-Path $root 'Assets\WinBridge.ico'
$temporary = Join-Path $root ('WinBridgeRecovery.build-' + [guid]::NewGuid().ToString('N') + '.exe')
$previousBase = $output + '.previous'
$previous = $previousBase
$releaseVersion = '4.0.0'
$displayVersion = '4.0.0-preview.1'
$assemblyVersion = '4.0.0.0'
$versionedSource = Join-Path $root ('WinBridgeRecovery.versioned-' + [guid]::NewGuid().ToString('N') + '.cs')
$versionedUpdateSource = Join-Path $root ('UpdateWindow.versioned-' + [guid]::NewGuid().ToString('N') + '.cs')

function Write-VersionedSource {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][hashtable]$Replacements
  )

  $text = [System.IO.File]::ReadAllText($SourcePath)
  foreach ($entry in $Replacements.GetEnumerator()) {
    if (-not $text.Contains([string]$entry.Key)) {
      throw "Version stamp token was not found in $SourcePath: $($entry.Key)"
    }
    $text = $text.Replace([string]$entry.Key, [string]$entry.Value)
  }
  [System.IO.File]::WriteAllText(
    $DestinationPath,
    $text,
    (New-Object System.Text.UTF8Encoding($false)))
}

try {
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Source file not found: $source"
  }
  if (-not (Test-Path -LiteralPath $minesweeperSource -PathType Leaf)) {
    throw "Source file not found: $minesweeperSource"
  }
  if (-not (Test-Path -LiteralPath $socialFeedSource -PathType Leaf)) {
    throw "Source file not found: $socialFeedSource"
  }
  if (-not (Test-Path -LiteralPath $advancedSettingsSource -PathType Leaf)) {
    throw "Source file not found: $advancedSettingsSource"
  }
  if (-not (Test-Path -LiteralPath $localizationSource -PathType Leaf)) {
    throw "Source file not found: $localizationSource"
  }
  foreach ($required in @($updateSource,$updateBootstrapperSource)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Source file not found: $required" }
  }
  if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
    throw "Icon file not found: $icon"
  }
  if (-not (Test-Path -LiteralPath $guardianSource -PathType Leaf)) {
    throw "Guardian source file not found: $guardianSource"
  }

  Write-VersionedSource -SourcePath $source -DestinationPath $versionedSource -Replacements @{
    'AssemblyVersion("3.1.1.0")' = ('AssemblyVersion("' + $assemblyVersion + '")')
    'AssemblyFileVersion("3.1.1.0")' = ('AssemblyFileVersion("' + $assemblyVersion + '")')
    'WinBridge Recovery 3.1.1' = ('WinBridge Recovery ' + $displayVersion)
  }
  Write-VersionedSource -SourcePath $updateSource -DestinationPath $versionedUpdateSource -Replacements @{
    'CurrentVersion = "3.1.1"' = ('CurrentVersion = "' + $releaseVersion + '"')
    'WinBridge-Recovery/3.1.1' = ('WinBridge-Recovery/' + $displayVersion)
  }

  Add-Type -AssemblyName WindowsBase
  Add-Type -AssemblyName PresentationCore
  Add-Type -AssemblyName PresentationFramework
  Add-Type -AssemblyName System.Xaml
  Add-Type -AssemblyName System.Xml
  Add-Type -AssemblyName System.Xml.Linq
  Add-Type -AssemblyName System.Web.Extensions

  $references = @(
    [System.Uri].Assembly.Location
    [System.Linq.Enumerable].Assembly.Location
    [System.Xml.XmlDocument].Assembly.Location
    [System.Xml.Linq.XDocument].Assembly.Location
    [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location
    [System.Xaml.XamlReader].Assembly.Location
    [System.Windows.Threading.DispatcherTimer].Assembly.Location
    [System.Windows.Media.Brush].Assembly.Location
    [System.Windows.Window].Assembly.Location
  ) | Select-Object -Unique

  $compilerParameters = New-Object System.CodeDom.Compiler.CompilerParameters
  $compilerParameters.GenerateExecutable = $true
  $compilerParameters.OutputAssembly = $temporary
  $compilerParameters.CompilerOptions = '/target:winexe /win32icon:"' + $icon + '"'
  foreach ($reference in $references) {
    [void]$compilerParameters.ReferencedAssemblies.Add($reference)
  }

  $provider = New-Object Microsoft.CSharp.CSharpCodeProvider
  try {
    $result = $provider.CompileAssemblyFromFile(
      $compilerParameters,
      [string[]]@($versionedSource, $minesweeperSource, $socialFeedSource, $advancedSettingsSource, $localizationSource, $versionedUpdateSource))
  } finally {
    $provider.Dispose()
  }
  if ($result.Errors.HasErrors) {
    $messages = @($result.Errors | ForEach-Object {
      '{0}({1},{2}): {3} {4}' -f $_.FileName, $_.Line, $_.Column, $_.ErrorNumber, $_.ErrorText
    })
    throw ($messages -join [Environment]::NewLine)
  }

  $updateParameters = New-Object System.CodeDom.Compiler.CompilerParameters
  $updateParameters.GenerateExecutable = $true
  $updateParameters.OutputAssembly = $updateBootstrapperOutput
  $updateParameters.CompilerOptions = '/target:winexe /win32icon:"' + $icon + '"'
  [void]$updateParameters.ReferencedAssemblies.Add([System.Uri].Assembly.Location)
  $updateProvider = New-Object Microsoft.CSharp.CSharpCodeProvider
  try {
    $updateResult = $updateProvider.CompileAssemblyFromFile($updateParameters, $updateBootstrapperSource)
  } finally {
    $updateProvider.Dispose()
  }
  if ($updateResult.Errors.HasErrors) {
    throw (($updateResult.Errors | ForEach-Object { '{0}({1},{2}): {3} {4}' -f $_.FileName,$_.Line,$_.Column,$_.ErrorNumber,$_.ErrorText }) -join [Environment]::NewLine)
  }

  if (-not (Test-Path -LiteralPath $temporary -PathType Leaf)) {
    throw 'The compiler did not create the expected executable.'
  }

  if (Test-Path -LiteralPath $output -PathType Leaf) {
    if (Test-Path -LiteralPath $previousBase -PathType Leaf) {
      try {
        Remove-Item -LiteralPath $previousBase -Force -ErrorAction Stop
      } catch {
        $previous = $output + '.previous-' + [guid]::NewGuid().ToString('N')
        Write-Warning 'The previous executable is still in use; using a temporary rollback name.'
      }
    }
    [System.IO.File]::Replace($temporary, $output, $previous, $true)
    if (Test-Path -LiteralPath $previous -PathType Leaf) {
      Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue
    }
  } else {
    [System.IO.File]::Move($temporary, $output)
  }

  $hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash

  $guardianParameters = New-Object System.CodeDom.Compiler.CompilerParameters
  $guardianParameters.GenerateExecutable = $true
  $guardianParameters.OutputAssembly = $guardianOutput
  $guardianParameters.CompilerOptions = '/target:winexe'
  [void]$guardianParameters.ReferencedAssemblies.Add([System.Uri].Assembly.Location)
  [void]$guardianParameters.ReferencedAssemblies.Add([System.Linq.Enumerable].Assembly.Location)
  [void]$guardianParameters.ReferencedAssemblies.Add('System.Management.dll')
  $guardianProvider = New-Object Microsoft.CSharp.CSharpCodeProvider
  try {
    $guardianResult = $guardianProvider.CompileAssemblyFromFile(
      $guardianParameters,
      $guardianSource)
  } finally {
    $guardianProvider.Dispose()
  }
  if ($guardianResult.Errors.HasErrors) {
    $guardianMessages = @($guardianResult.Errors | ForEach-Object {
      '{0}({1},{2}): {3} {4}' -f $_.FileName, $_.Line, $_.Column, $_.ErrorNumber, $_.ErrorText
    })
    throw ($guardianMessages -join [Environment]::NewLine)
  }
  $guardianHash = (Get-FileHash -LiteralPath $guardianOutput -Algorithm SHA256).Hash
  Write-Host "Built: $output"
  Write-Host "Version: $displayVersion"
  Write-Host "SHA256: $hash"
  Write-Host "Built: $guardianOutput"
  Write-Host "SHA256: $guardianHash"
} finally {
  foreach ($generatedPath in @($temporary, $versionedSource, $versionedUpdateSource)) {
    if (Test-Path -LiteralPath $generatedPath -PathType Leaf) {
      Remove-Item -LiteralPath $generatedPath -Force -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path -LiteralPath $previous -PathType Leaf) {
    Remove-Item -LiteralPath $previous -Force -ErrorAction SilentlyContinue
  }
}
