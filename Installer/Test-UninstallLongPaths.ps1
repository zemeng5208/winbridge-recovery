[CmdletBinding()]
param(
  [string]$AssemblyPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$installerRoot = $PSScriptRoot
$projectRoot = Split-Path $installerRoot -Parent
$testRoot = Join-Path $projectRoot 'TestArtifacts\UninstallLongPaths'
$binary = Join-Path $testRoot 'WinBridgeUninstall.test.exe'
$source = Join-Path $installerRoot 'WinBridgeUninstall.cs'

function Convert-ToExtendedPath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
  return '\\?\' + $full
}

function Invoke-LongPathDelete([System.Reflection.MethodInfo]$Method, [string]$Path) {
  try {
    [void]$Method.Invoke($null, @($Path))
  } catch [System.Reflection.TargetInvocationException] {
    throw $_.Exception.InnerException
  }
}

if (Test-Path -LiteralPath $testRoot) {
  Remove-Item -LiteralPath $testRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

try {
  if ([string]::IsNullOrWhiteSpace($AssemblyPath)) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
    $parameters.GenerateExecutable = $true
    $parameters.OutputAssembly = $binary
    $parameters.CompilerOptions = '/target:winexe'
    [void]$parameters.ReferencedAssemblies.Add([System.Uri].Assembly.Location)
    [void]$parameters.ReferencedAssemblies.Add([System.Windows.Forms.Form].Assembly.Location)
    [void]$parameters.ReferencedAssemblies.Add([System.Drawing.Bitmap].Assembly.Location)
    $provider = New-Object Microsoft.CSharp.CSharpCodeProvider
    try {
      $result = $provider.CompileAssemblyFromFile($parameters, $source)
    } finally {
      $provider.Dispose()
    }
    if ($result.Errors.HasErrors) {
      throw (($result.Errors | ForEach-Object {
        '{0}({1},{2}): {3} {4}' -f $_.FileName,$_.Line,$_.Column,$_.ErrorNumber,$_.ErrorText
      }) -join [Environment]::NewLine)
    }
    $AssemblyPath = $binary
  }

  $AssemblyPath = (Resolve-Path -LiteralPath $AssemblyPath).Path
  $assembly = [System.Reflection.Assembly]::LoadFile($AssemblyPath)
  $engine = $assembly.GetType('WinBridgeUninstall.UninstallEngine', $true)
  $flags = [System.Reflection.BindingFlags]'Static,NonPublic'
  $delete = $engine.GetMethod('DeleteDirectoryTree', $flags)
  if ($null -eq $delete) { throw 'DeleteDirectoryTree was not found.' }

  $backup = Join-Path $testRoot 'CodexPluginRepairBackups'
  $extendedBackup = Convert-ToExtendedPath $backup
  $longRelative = 'G-20260812-103744-p10989-95a1\p\u\26.803.81509\node_modules\@oai\sky\dist\js-dependency-cache\share-v1\applied-bk-agent-openai-js\pnpm-store\v11\links\@rollup\plugin-typescript\12.1.2\node_modules\tslib'
  $deep = [System.IO.Path]::Combine($extendedBackup, $longRelative)
  [void][System.IO.Directory]::CreateDirectory($deep)
  $longFile = [System.IO.Path]::Combine($deep, ('read-only-' + ('x' * 96) + '.txt'))
  [System.IO.File]::WriteAllText($longFile, 'long-path uninstall regression')
  [System.IO.File]::SetAttributes($longFile, [System.IO.FileAttributes]::ReadOnly)
  if ($longFile.Length -le 260) { throw "Test path was not long enough: $($longFile.Length)" }

  Invoke-LongPathDelete $delete $backup
  if ([System.IO.Directory]::Exists($extendedBackup)) { throw 'Long backup tree still exists.' }

  Invoke-LongPathDelete $delete $backup

  $partial = [System.IO.Path]::Combine($extendedBackup, 'partial', ('y' * 120), 'leaf')
  [void][System.IO.Directory]::CreateDirectory($partial)
  [System.IO.Directory]::Delete($partial)
  Invoke-LongPathDelete $delete $backup
  if ([System.IO.Directory]::Exists($extendedBackup)) { throw 'Partially missing backup tree still exists.' }

  Write-Host ('PASS: {0}; long path length {1}; read-only and missing-directory cases removed.' -f $AssemblyPath,$longFile.Length)
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
