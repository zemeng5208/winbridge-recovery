'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PACKAGE_NAME, discoveryScript } = require('../src/worker/app-package-discovery.cjs');

test('GPT discovery reuses the frozen core package and executable convention', () => {
  const script = discoveryScript();
  assert.equal(PACKAGE_NAME, 'OpenAI.Codex');
  assert.match(script, /Get-AppxPackage -Name 'OpenAI\.Codex'/);
  assert.match(script, /app\\ChatGPT\.exe/);
  assert.doesNotMatch(script, /OpenAI\.ChatGPT-Desktop|ms-windows-store|shell:AppsFolder/i);
});

test('system profile and openGPT share one package discovery module', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'src', 'worker', 'engine-worker.cjs'), 'utf8');
  assert.match(worker, /discoverInstalledGPT/);
  assert.match(worker, /openInstalledGPT/);
  assert.doesNotMatch(worker, /OpenAI\.ChatGPT-Desktop|ms-windows-store|shell:AppsFolder/i);
});
