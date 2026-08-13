'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const PACKAGE_NAME = 'OpenAI.Codex';

function discoveryScript() {
  return [
    "$packages = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue)",
    "$package = $packages | Where-Object { $_.Status -eq 'Ok' -and $_.InstallLocation } | Sort-Object Version -Descending | Select-Object -First 1",
    "if ($null -eq $package) { throw 'OpenAI.Codex is not installed or has no healthy package registration.' }",
    "$desktopExecutable = Join-Path ([string]$package.InstallLocation) 'app\\ChatGPT.exe'",
    "if (-not (Test-Path -LiteralPath $desktopExecutable -PathType Leaf)) { throw ('OpenAI.Codex desktop executable is missing: ' + $desktopExecutable) }",
    "[pscustomobject]@{ PackageName = 'OpenAI.Codex'; PackageFamilyName = [string]$package.PackageFamilyName; Version = [string]$package.Version; InstallLocation = [string]$package.InstallLocation; DesktopExecutable = $desktopExecutable } | ConvertTo-Json -Compress"
  ].join('; ');
}

function discoverInstalledGPT({ registerChild = () => {}, unregisterChild = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', discoveryScript()], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false
    });
    registerChild(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.once('error', (error) => { unregisterChild(child); reject(error); });
    child.once('exit', (code) => {
      unregisterChild(child);
      if (code !== 0) return reject(new Error(stderr.trim() || `${PACKAGE_NAME} package discovery failed with exit code ${code}`));
      try {
        const profile = JSON.parse(stdout.trim());
        if (profile.PackageName !== PACKAGE_NAME || typeof profile.DesktopExecutable !== 'string') {
          throw new Error('Package discovery returned an invalid profile');
        }
        resolve(profile);
      } catch (error) {
        reject(new Error(`Unable to parse ${PACKAGE_NAME} package discovery: ${error.message}`));
      }
    });
  });
}

async function openInstalledGPT(options = {}) {
  const profile = await discoverInstalledGPT(options);
  return new Promise((resolve, reject) => {
    const executable = path.resolve(profile.DesktopExecutable);
    const child = spawn(executable, [], {
      cwd: path.dirname(executable),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ opened: true, packageName: PACKAGE_NAME, version: profile.Version });
    });
  });
}

module.exports = { PACKAGE_NAME, discoveryScript, discoverInstalledGPT, openInstalledGPT };
