'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { MAX_MANIFEST_BYTES, MAX_ICON_BYTES, readPluginAsset, getPluginAssets } = require('../src/worker/plugin-assets.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'plugin-assets');

const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x69, 0x78, 0x74, 0x75, 0x72, 0x65]);

async function writePlugin(home, id, version, logo = 'assets/icon.png', bytes = VALID_PNG) {
  const root = path.join(home, '.codex', 'plugins', 'cache', 'openai-bundled', id, version);
  await fs.mkdir(path.join(root, '.codex-plugin'), { recursive: true });
  await fs.mkdir(path.dirname(path.join(root, logo)), { recursive: true });
  await fs.writeFile(path.join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({
    version,
    interface: { displayName: id, logo }
  }), 'utf8');
  await fs.writeFile(path.join(root, logo), bytes);
  return root;
}

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('plugin asset bridge returns only approved ids and no local paths', async () => {
  const home = path.join(testRoot, 'approved');
  await Promise.all([
    writePlugin(home, 'browser', '1.0.0'),
    writePlugin(home, 'chrome', '1.0.0'),
    writePlugin(home, 'computer-use', '1.0.0')
  ]);
  const result = await getPluginAssets({ home });
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.items.map((item) => item.id), ['browser', 'chrome', 'computer-use']);
  for (const item of result.items) {
    assert.equal(item.available, true);
    assert.match(item.dataUrl, /^data:image\/png;base64,/);
    assert.doesNotMatch(JSON.stringify(item), /[A-Z]:\\|\.codex|plugin\.json/i);
  }
  await assert.rejects(() => readPluginAsset('unapproved', { home }), /Unsupported plugin id/);
});

test('plugin asset bridge rejects traversal and unsupported file types', async () => {
  const home = path.join(testRoot, 'invalid');
  const traversalRoot = await writePlugin(home, 'browser', '1.0.0');
  await fs.writeFile(path.join(traversalRoot, '.codex-plugin', 'plugin.json'), JSON.stringify({ interface: { logo: '../escape.png' } }), 'utf8');
  await fs.writeFile(path.join(traversalRoot, '..', 'escape.png'), 'escape');
  assert.equal((await readPluginAsset('browser', { home })).available, false);

  await writePlugin(home, 'chrome', '1.0.0', 'assets/icon.svg', Buffer.from('<svg/>'));
  assert.equal((await readPluginAsset('chrome', { home })).available, false);
});

test('plugin asset bridge enforces manifest, icon size, and content signatures', async () => {
  const home = path.join(testRoot, 'bounded');
  const browser = await writePlugin(home, 'browser', '1.0.0');
  await fs.writeFile(path.join(browser, '.codex-plugin', 'plugin.json'), Buffer.alloc(MAX_MANIFEST_BYTES + 1, 0x20));
  assert.equal((await readPluginAsset('browser', { home })).available, false);

  await writePlugin(home, 'chrome', '1.0.0', 'assets/icon.png', Buffer.alloc(MAX_ICON_BYTES + 1, 0x89));
  assert.equal((await readPluginAsset('chrome', { home })).available, false);

  await writePlugin(home, 'computer-use', '1.0.0', 'assets/icon.png', Buffer.from('not-a-real-png'));
  assert.equal((await readPluginAsset('computer-use', { home })).available, false);
});

test('one broken plugin remains isolated from other approved plugins', async () => {
  const home = path.join(testRoot, 'isolated-failure');
  const browser = await writePlugin(home, 'browser', '1.0.0');
  await fs.writeFile(path.join(browser, '.codex-plugin', 'plugin.json'), '{ broken json', 'utf8');
  await writePlugin(home, 'chrome', '1.0.0');
  const result = await getPluginAssets({ home });
  assert.equal(result.items.find((item) => item.id === 'browser').available, false);
  assert.equal(result.items.find((item) => item.id === 'chrome').available, true);
  assert.equal(result.items.find((item) => item.id === 'computer-use').available, false);
});

test('plugin asset bridge rejects symlink escapes when supported', async (t) => {
  const home = path.join(testRoot, 'symlink');
  const root = await writePlugin(home, 'computer-use', '1.0.0');
  const outside = path.join(testRoot, 'outside.png');
  const linked = path.join(root, 'assets', 'linked.png');
  await fs.writeFile(outside, 'outside');
  await fs.writeFile(path.join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({ interface: { logo: 'assets/linked.png' } }), 'utf8');
  await fs.rm(linked, { force: true });
  try {
    await fs.symlink(outside, linked, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('Symlink creation is unavailable on this Windows account');
    throw error;
  }
  assert.equal((await readPluginAsset('computer-use', { home })).available, false);
});

test('canonical CODEX_HOME boundary rejects an openai-bundled base redirected outside', async (t) => {
  const home = path.join(testRoot, 'base-symlink');
  const outsideHome = path.join(testRoot, 'external-cache-owner');
  await writePlugin(outsideHome, 'browser', '1.0.0');
  const cacheParent = path.join(home, '.codex', 'plugins', 'cache');
  const link = path.join(cacheParent, 'openai-bundled');
  await fs.mkdir(cacheParent, { recursive: true });
  const outsideBase = path.join(outsideHome, '.codex', 'plugins', 'cache', 'openai-bundled');
  try {
    await fs.symlink(outsideBase, link, 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('Directory link creation is unavailable on this Windows account');
    throw error;
  }
  assert.equal((await readPluginAsset('browser', { home })).available, false);
});
