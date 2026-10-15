[CmdletBinding()]
param(
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'out'))
if (-not $outRoot.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Packaging output escaped the V4App project boundary.'
}

$packageJson = Join-Path $projectRoot 'package.json'
$electronExecutable = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
$packagerExecutable = Join-Path $projectRoot 'node_modules\.bin\electron-packager.cmd'
$packagerEntry = Join-Path $projectRoot 'node_modules\@electron\packager\bin\electron-packager.mjs'
$frontendVerifier = Join-Path $projectRoot 'scripts\verify-frontend.cjs'
$packagedEngineVerifier = Join-Path $projectRoot 'scripts\verify-packaged-engine.cjs'
$icon = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '..\..\LauncherUI\Assets\WinBridge.ico'))
foreach ($required in @($packageJson, $electronExecutable, $packagerExecutable, $packagerEntry, $frontendVerifier, $packagedEngineVerifier, $icon)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required packaging input is missing: $required" }
}

& node $frontendVerifier
if ($LASTEXITCODE -ne 0) { throw "Frontend verification failed with exit code $LASTEXITCODE" }

if ($ValidateOnly) {
  $electronMetadata = Get-Content -LiteralPath (Join-Path $projectRoot 'node_modules\electron\package.json') -Raw | ConvertFrom-Json
  $packagerMetadata = Get-Content -LiteralPath (Join-Path $projectRoot 'node_modules\@electron\packager\package.json') -Raw | ConvertFrom-Json
  [pscustomobject]@{
    ProjectRoot = $projectRoot
    OutputRoot = $outRoot
    ElectronVersion = [string]$electronMetadata.version
    PackagerVersion = [string]$packagerMetadata.version
    Action = 'Frontend and packaging inputs validated; no package was created'
  } | Format-List
  exit 0
}

Push-Location $projectRoot
try {
  & node $packagerEntry . WinBridge-Recovery-V4 --platform=win32 --arch=x64 --out=$outRoot --overwrite --prune=true --asar --app-version=4.0.0 --build-version=4.0.0 --icon=$icon --ignore='(^|[\\/])\.test-artifacts($|[\\/])' --ignore='(^|[\\/])runtime-data($|[\\/])' --ignore='(^|[\\/])docs($|[\\/])' --ignore='(^|[\\/])engine[\\/]frozen-3\.1\.1($|[\\/])'
  if ($LASTEXITCODE -ne 0) { throw "electron-packager failed with exit code $LASTEXITCODE" }
  # Verify the engine snapshot as packaged inside app.asar: pinned hashes and
  # Windows PowerShell 5.1 safe encodings must survive packaging unchanged.
  & node $packagedEngineVerifier
  if ($LASTEXITCODE -ne 0) { throw "Packaged engine verification failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
