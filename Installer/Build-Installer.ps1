[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'WinBridge-Recovery-Setup.exe')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$installerRoot = $PSScriptRoot
$projectRoot = Split-Path $installerRoot -Parent
$stageRoot = Join-Path $env:TEMP ('WinBridge-Installer-' + [guid]::NewGuid().ToString('N'))
$payloadRoot = Join-Path $stageRoot 'payload\WinBridge-Recovery'
$payloadZip = Join-Path $stageRoot 'payload.zip'
$source = Join-Path $installerRoot 'WinBridgeSetup.cs'
$uninstallSource = Join-Path $installerRoot 'WinBridgeUninstall.cs'
$uninstallBinary = Join-Path $installerRoot 'WinBridgeUninstall.exe'
$icon = Join-Path $projectRoot 'LauncherUI\Assets\WinBridge.ico'
$signingRoot = Join-Path $installerRoot 'Signing'
$publicCertificate = Join-Path $signingRoot 'zemeng5208-Test-Code-Signing.cer'
$displayVersion = '4.0.0-preview.1'
$assemblyVersion = '4.0.0.0'
$versionedSource = Join-Path $stageRoot 'WinBridgeSetup.versioned.cs'
$versionedUninstallSource = Join-Path $stageRoot 'WinBridgeUninstall.versioned.cs'

function Get-ProjectSigningCertificate {
  $now = Get-Date
  Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Subject -eq 'CN=zemeng5208 Test Builds, O=GitHub, OU=Authorized Testing and Secondary Development' -and
      $_.NotBefore -le $now -and $_.NotAfter -gt $now -and $_.HasPrivateKey
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
}

function Set-ProjectSignature([string]$Path, $Certificate) {
  if ($null -eq $Certificate) {
    Write-Warning "Testing certificate is unavailable; leaving unsigned: $Path"
    return
  }
  $signature = Set-AuthenticodeSignature -LiteralPath $Path -Certificate $Certificate -HashAlgorithm SHA256
  if ($null -eq $signature.SignerCertificate) {
    throw "Authenticode signing failed: $Path ($($signature.StatusMessage))"
  }
  Write-Host "Signed: $Path"
}

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
  New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

  Write-VersionedSource -SourcePath $source -DestinationPath $versionedSource -Replacements @{
    'AssemblyVersion("3.1.1.0")' = ('AssemblyVersion("' + $assemblyVersion + '")')
    'AssemblyFileVersion("3.1.1.0")' = ('AssemblyFileVersion("' + $assemblyVersion + '")')
    '"version=3.1.1"' = ('"version=' + $displayVersion + '"')
    'key.SetValue("DisplayVersion", "3.1.1");' = ('key.SetValue("DisplayVersion", "' + $displayVersion + '");')
    'A self-contained installer for Windows 11. Choose where the app and its backups are stored.' = 'WinBridge 4.0 preview with Windows 10/11 host checks and safer recovery diagnostics.'
  }
  Write-VersionedSource -SourcePath $uninstallSource -DestinationPath $versionedUninstallSource -Replacements @{
    'AssemblyVersion("3.1.1.0")' = ('AssemblyVersion("' + $assemblyVersion + '")')
    'AssemblyFileVersion("3.1.1.0")' = ('AssemblyFileVersion("' + $assemblyVersion + '")')
  }

  & (Join-Path $projectRoot 'LauncherUI\Build-LauncherUI.ps1')
  $signingCertificate = Get-ProjectSigningCertificate
  Set-ProjectSignature (Join-Path $projectRoot 'LauncherUI\WinBridgeRecovery.exe') $signingCertificate
  Set-ProjectSignature (Join-Path $projectRoot 'LauncherUI\WinBridgeGuardian.exe') $signingCertificate

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $uninstallParameters = New-Object System.CodeDom.Compiler.CompilerParameters
  $uninstallParameters.GenerateExecutable = $true
  $uninstallParameters.OutputAssembly = $uninstallBinary
  $uninstallParameters.CompilerOptions = '/target:winexe /win32icon:"' + $icon + '"'
  [void]$uninstallParameters.ReferencedAssemblies.Add([System.Uri].Assembly.Location)
  [void]$uninstallParameters.ReferencedAssemblies.Add([System.Windows.Forms.Form].Assembly.Location)
  [void]$uninstallParameters.ReferencedAssemblies.Add([System.Drawing.Bitmap].Assembly.Location)
  $uninstallProvider = New-Object Microsoft.CSharp.CSharpCodeProvider
  try {
    $uninstallResult = $uninstallProvider.CompileAssemblyFromFile(
      $uninstallParameters,
      $versionedUninstallSource)
  } finally {
    $uninstallProvider.Dispose()
  }
  if ($uninstallResult.Errors.HasErrors) {
    throw (($uninstallResult.Errors | ForEach-Object {
      '{0}({1},{2}): {3} {4}' -f $_.FileName,$_.Line,$_.Column,$_.ErrorNumber,$_.ErrorText
    }) -join [Environment]::NewLine)
  }
  Set-ProjectSignature $uninstallBinary $signingCertificate

  New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
  $rootFiles = @(
    'Audit-Launcher-Writes.ps1',
    'DIAGNOSE-ONLY.cmd',
    'Invoke-WinBridge-With-BrowserLatest.ps1',
    'Invoke-WinBridge-Configured.ps1',
    'Maintain-Launcher-State.ps1',
    'README.md',
    'README-zh-CN.md',
    'LEGAL-NOTICE.md',
    'LICENSE',
    'SECURITY.md',
    'TESTING-NOTICE.md',
    'Repair-BrowserLatest.ps1',
    'ROLLBACK-LAST.cmd',
    'SELF-TEST.cmd',
    'START-BEFORE-DESKTOP.cmd',
    'Start-WinBridge-Recovery.ps1',
    'WinBridge-4.0-Preflight.ps1'
  )
  foreach ($name in $rootFiles) {
    $sourcePath = Join-Path $projectRoot $name
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required package file is missing: $sourcePath"
    }
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $payloadRoot $name) -Force
  }
  Copy-Item -LiteralPath $uninstallBinary `
    -Destination (Join-Path $stageRoot 'payload\Uninstall WinBridge Recovery.exe') -Force
  if (Test-Path -LiteralPath $publicCertificate -PathType Leaf) {
    Copy-Item -LiteralPath $publicCertificate `
      -Destination (Join-Path $stageRoot 'payload\zemeng5208-Test-Code-Signing.cer') -Force
  }

  $uiTarget = Join-Path $payloadRoot 'LauncherUI'
  New-Item -ItemType Directory -Path $uiTarget -Force | Out-Null
  foreach ($name in @('WinBridgeRecovery.exe','WinBridgeGuardian.exe','WinBridgeUpdateBootstrapper.exe','README.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot ('LauncherUI\' + $name)) `
      -Destination (Join-Path $uiTarget $name) -Force
  }
  Copy-Item -LiteralPath (Join-Path $projectRoot 'LauncherUI\Assets') `
    -Destination (Join-Path $uiTarget 'Assets') -Recurse -Force

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    (Join-Path $stageRoot 'payload'),
    $payloadZip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false)

  $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
  $parameters.GenerateExecutable = $true
  $parameters.OutputAssembly = $OutputPath
  $parameters.CompilerOptions = '/target:winexe /win32icon:"' + $icon + '"'
  [void]$parameters.ReferencedAssemblies.Add([System.Uri].Assembly.Location)
  [void]$parameters.ReferencedAssemblies.Add([System.Windows.Forms.Form].Assembly.Location)
  [void]$parameters.ReferencedAssemblies.Add([System.Drawing.Bitmap].Assembly.Location)
  [void]$parameters.ReferencedAssemblies.Add([System.IO.Compression.ZipArchive].Assembly.Location)
  [void]$parameters.ReferencedAssemblies.Add('System.IO.Compression.FileSystem.dll')
  [void]$parameters.EmbeddedResources.Add($payloadZip)

  $provider = New-Object Microsoft.CSharp.CSharpCodeProvider
  try {
    $result = $provider.CompileAssemblyFromFile($parameters, $versionedSource)
  } finally {
    $provider.Dispose()
  }
  if ($result.Errors.HasErrors) {
    throw (($result.Errors | ForEach-Object {
      '{0}({1},{2}): {3} {4}' -f $_.FileName,$_.Line,$_.Column,$_.ErrorNumber,$_.ErrorText
    }) -join [Environment]::NewLine)
  }
  Set-ProjectSignature $OutputPath $signingCertificate

  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
  $hashSidecar = $OutputPath + '.sha256'
  [System.IO.File]::WriteAllText(
    $hashSidecar,
    ($hash + '  ' + [System.IO.Path]::GetFileName($OutputPath) + [Environment]::NewLine),
    (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Installer: $OutputPath"
  Write-Host "Version: $displayVersion"
  Write-Host "SHA256: $hash"
  Write-Host "SHA256 file: $hashSidecar"
  Write-Host "Size: $((Get-Item -LiteralPath $OutputPath).Length) bytes"
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
