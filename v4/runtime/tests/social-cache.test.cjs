'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { makePost } = require('../src/worker/social-feed-service.cjs');
const { MAX_CACHE_POSTS, SocialFeedCache } = require('../src/worker/social-cache.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'social-cache');

function posts(count) {
  return Array.from({ length: count }, (_, index) => makePost('tibo', {
    text: `Synthetic cache post ${index}`,
    link: `https://x.com/thsottiaux/status/${1000000000000000000n + BigInt(index)}`,
    publishedAt: new Date(Date.parse('2026-08-13T10:00:00.000Z') - index * 1000).toISOString(),
    source: 'xxu-rss'
  }));
}

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('social cache atomically retains at most 24 registered posts', async () => {
  const cache = new SocialFeedCache(path.join(testRoot, 'bounded'));
  assert.equal(await cache.write(posts(MAX_CACHE_POSTS + 6), '2026-08-13T12:00:00.000Z'), true);
  const value = await cache.read();
  assert.equal(value.posts.length, MAX_CACHE_POSTS);
  const siblings = await fs.readdir(path.dirname(cache.file));
  assert.deepEqual(siblings, ['feed-cache.json']);
});

test('social cache rejects bound-content tampering and a size limit overflow', async () => {
  const cache = new SocialFeedCache(path.join(testRoot, 'tamper'));
  const [post] = posts(1);
  await cache.write([post], '2026-08-13T12:00:00.000Z');
  const payload = JSON.parse(await fs.readFile(cache.file, 'utf8'));
  payload.posts[0].text = 'tampered without changing postId';
  await fs.writeFile(cache.file, JSON.stringify(payload), 'utf8');
  assert.equal(await cache.read(), null);

  const tiny = new SocialFeedCache(path.join(testRoot, 'size'), { maxBytes: 64 });
  await assert.rejects(() => tiny.write([post], '2026-08-13T12:00:00.000Z'), /size boundary/);
});

test('social cache refuses unconfirmed and invalid publication timestamps', async () => {
  const cache = new SocialFeedCache(path.join(testRoot, 'untrusted-time'));
  const unconfirmed = makePost('tibo', {
    text: 'Unconfirmed', link: 'https://x.com/thsottiaux/status/2234567890123456781',
    publishedAt: null, timeUnconfirmed: true, source: 'jina'
  });
  const invalid = {
    ...posts(1)[0],
    postId: 'social-00000000000000000000000000000000',
    publishedAt: '2026-02-30T10:00:00.000Z'
  };
  assert.equal(await cache.write([unconfirmed, invalid], '2026-08-13T12:00:00.000Z'), false);
  assert.equal(await cache.read(), null);
});

test('social cache refuses a redirected social directory when junctions are available', async (t) => {
  const dataRoot = path.join(testRoot, 'redirected');
  const outside = path.join(testRoot, 'outside');
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  try {
    await fs.symlink(outside, path.join(dataRoot, 'social'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) return t.skip('Junction creation is unavailable on this Windows account');
    throw error;
  }
  const cache = new SocialFeedCache(dataRoot);
  await assert.rejects(() => cache.write(posts(1), '2026-08-13T12:00:00.000Z'), /escaped application data/);
});
