'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assertTrustedIpcSender } = require('../src/main/ipc-policy.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'ipc-policy');

function makeFixture(url) {
  const mainFrame = { url };
  const webContents = { mainFrame };
  return {
    mainWindow: { isDestroyed: () => false, webContents },
    event: { sender: webContents, senderFrame: mainFrame }
  };
}

test.after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});

test('IPC source accepts only the canonical bound main-frame entry', async () => {
  const appRoot = path.join(testRoot, 'app');
  const entry = path.join(appRoot, 'index.html');
  await fs.mkdir(appRoot, { recursive: true });
  await fs.writeFile(entry, '<!doctype html>', 'utf8');
  const canonicalAppRoot = await fs.realpath(appRoot);
  const trustedEntryPath = await fs.realpath(entry);
  const fixture = makeFixture(pathToFileURL(entry).href);
  assert.equal(assertTrustedIpcSender(fixture.event, { mainWindow: fixture.mainWindow, canonicalAppRoot, trustedEntryPath }), true);

  const childFrame = { url: pathToFileURL(entry).href };
  assert.throws(() => assertTrustedIpcSender({ sender: fixture.mainWindow.webContents, senderFrame: childFrame }, {
    mainWindow: fixture.mainWindow, canonicalAppRoot, trustedEntryPath
  }), /main frame/);
});

test('canonical checks reject sibling-prefix and non-entry files', async () => {
  const appRoot = path.join(testRoot, 'bound-app');
  const sibling = path.join(testRoot, 'bound-app-evil');
  const entry = path.join(appRoot, 'index.html');
  const other = path.join(appRoot, 'other.html');
  const evil = path.join(sibling, 'index.html');
  await fs.mkdir(appRoot, { recursive: true });
  await fs.mkdir(sibling, { recursive: true });
  await Promise.all([fs.writeFile(entry, 'entry'), fs.writeFile(other, 'other'), fs.writeFile(evil, 'evil')]);
  const canonicalAppRoot = await fs.realpath(appRoot);
  const trustedEntryPath = await fs.realpath(entry);

  for (const candidate of [other, evil]) {
    const fixture = makeFixture(pathToFileURL(candidate).href);
    assert.throws(() => assertTrustedIpcSender(fixture.event, { mainWindow: fixture.mainWindow, canonicalAppRoot, trustedEntryPath }), /bound application entry/);
  }
});
