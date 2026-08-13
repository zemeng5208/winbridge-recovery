'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  MANIFEST_NAME,
  DEFAULT_LIMITS,
  buildSourcePlan,
  verifyFrontendDist,
  syncFrontend
} = require('../scripts/frontend-dist.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'frontend-dist');

async function createBuild(root, marker = 'v1') {
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), [
    '<!doctype html>',
    '<link rel="stylesheet" href="./assets/app.css">',
    '<script type="module" src="./assets/app.js"></script>'
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(root, 'assets', 'app.js'), `document.body.dataset.build=${JSON.stringify(marker)};`, 'utf8');
  await fs.writeFile(path.join(root, 'assets', 'app.css'), 'body{background-image:url("./texture.bin")}', 'utf8');
  await fs.writeFile(path.join(root, 'assets', 'texture.bin'), Buffer.from(`texture-${marker}`));
}

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('source plan requires index and every local HTML/CSS asset reference', async () => {
  const source = path.join(testRoot, 'references');
  await createBuild(source);
  const plan = await buildSourcePlan(source);
  assert.equal(plan.manifest.fileCount, 4);
  assert.ok(plan.manifest.localReferences.some((item) => item.target === 'assets/app.js'));
  assert.ok(plan.manifest.localReferences.some((item) => item.target === 'assets/texture.bin'));
  await fs.rm(path.join(source, 'assets', 'app.js'));
  await assert.rejects(() => buildSourcePlan(source), /reference is missing/);
});

test('sync creates a staged manifest-bound dist and target verification detects tampering', async () => {
  const source = path.join(testRoot, 'sync-source');
  const frontendRoot = path.join(testRoot, 'sync-target');
  const targetDist = path.join(frontendRoot, 'dist');
  await createBuild(source);
  const result = await syncFrontend({ sourceDist: source, frontendRoot, targetDist });
  assert.equal(result.fileCount, 4);
  assert.equal((await fs.stat(path.join(targetDist, MANIFEST_NAME))).isFile(), true);
  assert.equal((await verifyFrontendDist(targetDist)).fileCount, 4);
  await fs.writeFile(path.join(targetDist, 'assets', 'app.js'), 'tampered', 'utf8');
  await assert.rejects(() => verifyFrontendDist(targetDist), /integration manifest totals/);
});

test('failed source validation preserves the previous complete target', async () => {
  const source = path.join(testRoot, 'rollback-source');
  const frontendRoot = path.join(testRoot, 'rollback-target');
  const targetDist = path.join(frontendRoot, 'dist');
  await createBuild(source, 'old');
  await syncFrontend({ sourceDist: source, frontendRoot, targetDist });
  const before = await fs.readFile(path.join(targetDist, 'assets', 'app.js'), 'utf8');
  await fs.writeFile(path.join(source, 'index.html'), '<script src="./assets/missing.js"></script>', 'utf8');
  await assert.rejects(() => syncFrontend({ sourceDist: source, frontendRoot, targetDist }), /reference is missing/);
  assert.equal(await fs.readFile(path.join(targetDist, 'assets', 'app.js'), 'utf8'), before);
  await verifyFrontendDist(targetDist);
});

test('source file count and total size limits are enforced before copying', async () => {
  const source = path.join(testRoot, 'limits');
  await createBuild(source);
  await assert.rejects(() => buildSourcePlan(source, { ...DEFAULT_LIMITS, maxFiles: 2 }), /file count exceeds/);
  await assert.rejects(() => buildSourcePlan(source, { ...DEFAULT_LIMITS, maxTotalBytes: 8 }), /total size exceeds/);
});

test('root-absolute assets are rejected because packaged Runtime loads file URLs', async () => {
  const source = path.join(testRoot, 'root-absolute');
  await createBuild(source);
  await fs.writeFile(path.join(source, 'index.html'), '<script src="/assets/app.js"></script>', 'utf8');
  await assert.rejects(() => buildSourcePlan(source), /must be relative for file loading/);
});

test('source links are rejected when link creation is supported', async (t) => {
  const source = path.join(testRoot, 'links');
  await createBuild(source);
  const outside = path.join(testRoot, 'outside.js');
  const linked = path.join(source, 'assets', 'linked.js');
  await fs.writeFile(outside, 'outside', 'utf8');
  try { await fs.symlink(outside, linked, 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('File link creation is unavailable on this Windows account');
    throw error;
  }
  await assert.rejects(() => buildSourcePlan(source), /must not contain links/);
});
