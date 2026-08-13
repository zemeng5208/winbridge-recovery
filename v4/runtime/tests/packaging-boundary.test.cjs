'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('packaging validation invokes deterministic frontend verification before validate-only exit', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts', 'Pack-Windows.ps1'), 'utf8');
  const verifier = source.indexOf('& node $frontendVerifier');
  const validateOnly = source.indexOf('if ($ValidateOnly)');
  assert.ok(verifier >= 0);
  assert.ok(validateOnly > verifier);
  assert.match(source, /Frontend verification failed/);
});

test('packaged main process cannot silently use the development fallback', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.cjs'), 'utf8');
  assert.match(source, /app\.isPackaged.*integratedManifest/);
  assert.match(source, /missing its verified integrated frontend/);
  assert.match(source, /installProductionCsp\(runtimeSession/);
  assert.match(source, /appIsPackaged:\s*app\.isPackaged/);
});

test('frontend sync and verify commands expose no caller-supplied path', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['sync:frontend'], 'node scripts/sync-frontend.cjs');
  assert.equal(packageJson.scripts['verify:frontend'], 'node scripts/verify-frontend.cjs');
  for (const script of ['sync-frontend.cjs', 'verify-frontend.cjs']) {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts', script), 'utf8');
    assert.match(source, /process\.argv\.length !== 2/);
    assert.match(source, /fixedPaths\(\)/);
  }
});
