'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_SOCIAL_SETTINGS, SOCIAL_BROKER_OPERATIONS, MAX_SOCIAL_FUTURE_SKEW_MS } = require('../src/shared/social-contracts.cjs');
const {
  MAX_SOURCE_RESPONSE_BYTES,
  MAX_SOURCE_ENTRIES,
  makePost,
  parseRss,
  parseRssPublishedAt,
  parseJina,
  orderAndFilter,
  readBrokerResponseBounded,
  SocialFeedService
} = require('../src/worker/social-feed-service.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'social-feed');
const now = Date.parse('2026-08-13T12:00:00.000Z');

function settings(overrides = {}) {
  return {
    social: {
      ...DEFAULT_SOCIAL_SETTINGS,
      accounts: { tibo: false, openai: true, chatgpt: false },
      ...overrides
    }
  };
}

function rssBody({ text = 'Synthetic OpenAI post', publishedAt = '2026-08-13T10:00:00.000Z' } = {}) {
  return Buffer.from(`<?xml version="1.0"?><rss><channel><item><description>${text}</description><link>https://x.com/OpenAI/status/1234567890123456789</link><pubDate>${publishedAt}</pubDate></item></channel></rss>`);
}

function successfulBroker(records = []) {
  return async (operation, payload) => {
    records.push({ operation, payload });
    if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return { registered: payload.posts.length };
    if (operation === SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE) return { status: 200, contentType: 'application/rss+xml', body: rssBody() };
    if (operation === SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST) {
      return { status: 200, contentType: 'application/json', body: Buffer.from('[[["Texte traduit","Synthetic OpenAI post"]]]') };
    }
    throw new Error('unexpected operation');
  };
}

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('48 hour window admits only strict confirmed timestamps and never backfills', () => {
  const post = (text, status, publishedAt, timeUnconfirmed = false) => makePost('openai', {
    text,
    link: `https://x.com/OpenAI/status/${status}`,
    publishedAt,
    timeUnconfirmed,
    source: 'xxu-rss'
  });
  const recentOne = post('Recent one', '1234567890123456781', new Date(now - 47 * 60 * 60 * 1000).toISOString());
  const recentTwo = post('Recent two', '1234567890123456782', new Date(now - 2 * 60 * 60 * 1000).toISOString());
  const exactEarliest = post('Exact earliest', '1234567890123456783', new Date(now - 48 * 60 * 60 * 1000).toISOString());
  const old = post('Old', '1234567890123456784', new Date(now - 48 * 60 * 60 * 1000 - 1).toISOString());
  const unconfirmed = post('Unconfirmed', '1234567890123456785', new Date(now - 60 * 1000).toISOString(), true);
  const missing = post('Missing', '1234567890123456786', null);
  const invalid = { ...post('Invalid', '1234567890123456787', new Date(now - 60 * 1000).toISOString()), publishedAt: '2026-02-30T10:00:00.000Z' };
  const toleratedSkew = post('Tolerated skew', '1234567890123456788', new Date(now + MAX_SOCIAL_FUTURE_SKEW_MS).toISOString());
  const farFuture = post('Far future', '1234567890123456789', new Date(now + MAX_SOCIAL_FUTURE_SKEW_MS + 1).toISOString());

  const selected = orderAndFilter(
    [old, unconfirmed, missing, invalid, farFuture, recentOne, recentTwo, exactEarliest, toleratedSkew],
    { maxPosts: 10, hours: 48, now }
  );
  assert.deepEqual(selected.map((item) => item.text), ['Tolerated skew', 'Recent two', 'Recent one', 'Exact earliest']);
  assert.equal(selected.some((item) => item.timeUnconfirmed || !item.publishedAt), false);

  assert.deepEqual(orderAndFilter([old, unconfirmed, missing, invalid, farFuture], { maxPosts: 4, hours: 48, now }), []);
  assert.deepEqual(orderAndFilter([old, recentOne], { maxPosts: 4, hours: 48, now }).map((item) => item.text), ['Recent one']);
  assert.deepEqual(orderAndFilter([old, recentOne, recentTwo], { maxPosts: 4, hours: 48, now }).map((item) => item.text), ['Recent two', 'Recent one']);
});

test('Jina posts without a trusted publication timestamp produce zero current posts', () => {
  const jina = parseJina('openai', '* [![Image 1](image)](https://x.com/OpenAI) Synthetic Jina post without a trusted time');
  assert.ok(jina.length > 0);
  assert.ok(jina.every((post) => post.timeUnconfirmed && post.publishedAt === null));
  assert.deepEqual(orderAndFilter(jina, { maxPosts: 4, hours: 48, now }), []);
});

test('RSS parsing and Worker broker responses stay bounded', () => {
  const items = Array.from({ length: MAX_SOURCE_ENTRIES + 20 }, (_, index) => `<item><description>Post ${index}</description><link>https://x.com/OpenAI/status/${1000000000 + index}</link><pubDate>2026-08-13T10:00:00.000Z</pubDate></item>`).join('');
  assert.equal(parseRss('openai', `<rss><channel>${items}</channel></rss>`, 'xxu-rss').length, MAX_SOURCE_ENTRIES);
  assert.throws(() => readBrokerResponseBounded({ status: 200, contentType: 'application/rss+xml', body: Buffer.alloc(MAX_SOURCE_RESPONSE_BYTES + 1) }, MAX_SOURCE_RESPONSE_BYTES, ['application/rss+xml']), /response-too-large/);
  assert.throws(() => readBrokerResponseBounded({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('x') }, 10, ['application/rss+xml']), /content-type-rejected/);
});

test('RSS publication parsing accepts canonical ISO or strict RFC 2822 and rejects normalized-invalid dates', () => {
  assert.equal(parseRssPublishedAt('2026-08-13T10:00:00.000Z'), '2026-08-13T10:00:00.000Z');
  assert.equal(parseRssPublishedAt('2026-08-13T18:00:00+08:00'), '2026-08-13T10:00:00.000Z');
  assert.equal(parseRssPublishedAt('Thu, 13 Aug 2026 18:00:00 +0800'), '2026-08-13T10:00:00.000Z');
  assert.equal(parseRssPublishedAt('Mon, 30 Feb 2026 10:00:00 GMT'), null);
  assert.equal(parseRssPublishedAt('2026-02-30T10:00:00.000Z'), null);
  assert.equal(parseRssPublishedAt('13/08/2026 10:00:00'), null);
});

test('feed uses only structured broker operations and translation sends no free text or URL', async () => {
  const records = [];
  const service = new SocialFeedService({
    dataRoot: path.join(testRoot, 'operations'),
    settingsProvider: async () => settings(),
    networkBroker: successfulBroker(records),
    now: () => now
  });
  const feed = await service.getFeed();
  assert.equal(feed.available, true);
  assert.equal(feed.posts.length, 1);
  const translated = await service.translate({ postId: feed.posts[0].postId, targetLocale: 'fr' });
  assert.equal(translated.status, 'translated');
  const sourceCall = records.find((record) => record.operation === SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE);
  assert.deepEqual(sourceCall.payload, { account: 'openai', source: 'xxu-rss' });
  const translationCall = records.find((record) => record.operation === SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST);
  assert.deepEqual(translationCall.payload, { postId: feed.posts[0].postId, targetLocale: 'fr' });
  assert.equal('url' in translationCall.payload, false);
  assert.equal('text' in translationCall.payload, false);
  service.shutdown();
});

test('three accounts are bounded to three concurrent source operations', async () => {
  let active = 0;
  let peak = 0;
  const broker = async (operation, payload) => {
    if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return { registered: payload.posts.length };
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    active -= 1;
    return { status: 200, contentType: 'application/rss+xml', body: Buffer.from('<rss><channel></channel></rss>') };
  };
  const service = new SocialFeedService({
    dataRoot: path.join(testRoot, 'concurrency'),
    settingsProvider: async () => settings({ accounts: { tibo: true, openai: true, chatgpt: true }, useJinaFallback: false }),
    networkBroker: broker,
    now: () => now
  });
  await service.getFeed();
  assert.ok(peak <= 3);
  assert.equal(active, 0);
  service.shutdown();
});

test('online failure returns an age-marked bounded cache without broadening the time window', async () => {
  const directory = path.join(testRoot, 'cache-fallback');
  const first = new SocialFeedService({ dataRoot: directory, settingsProvider: async () => settings(), networkBroker: successfulBroker(), now: () => now });
  const online = await first.getFeed();
  assert.equal(online.available, true);
  first.shutdown();

  const offlineBroker = async (operation, payload) => {
    if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return { registered: payload.posts.length };
    throw new Error('synthetic offline');
  };
  const second = new SocialFeedService({ dataRoot: directory, settingsProvider: async () => settings(), networkBroker: offlineBroker, now: () => now + 60000 });
  const cached = await second.getFeed();
  assert.equal(cached.available, true);
  assert.equal(cached.degraded, true);
  assert.equal(cached.reason, 'cached-after-online-failure');
  assert.equal(cached.cacheAgeSeconds, 60);
  assert.equal(cached.posts.length, 1);
  second.shutdown();
});

test('cache fallback cannot reintroduce old, unconfirmed, invalid, or far-future records', async () => {
  const directory = path.join(testRoot, 'cache-hard-window');
  const seed = new SocialFeedService({ dataRoot: directory, settingsProvider: async () => settings(), networkBroker: successfulBroker(), now: () => now });
  const current = makePost('openai', {
    text: 'Current cache record', link: 'https://x.com/OpenAI/status/3234567890123456781',
    publishedAt: new Date(now - 60 * 1000).toISOString(), source: 'xxu-rss'
  });
  const old = makePost('openai', {
    text: 'Old cache record', link: 'https://x.com/OpenAI/status/3234567890123456782',
    publishedAt: new Date(now - 49 * 60 * 60 * 1000).toISOString(), source: 'xxu-rss'
  });
  const future = makePost('openai', {
    text: 'Future cache record', link: 'https://x.com/OpenAI/status/3234567890123456783',
    publishedAt: new Date(now + MAX_SOCIAL_FUTURE_SKEW_MS + 1).toISOString(), source: 'xxu-rss'
  });
  const unconfirmed = makePost('openai', {
    text: 'Unconfirmed cache record', link: 'https://x.com/OpenAI/status/3234567890123456784',
    publishedAt: null, timeUnconfirmed: true, source: 'jina'
  });
  const invalid = { ...current, postId: 'social-00000000000000000000000000000000', publishedAt: 'invalid', text: 'Invalid cache record' };
  assert.equal(await seed.cache.write([current, old, future, unconfirmed, invalid], new Date(now).toISOString()), true);
  seed.shutdown();

  const offlineBroker = async (operation, payload) => {
    if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return { registered: payload.posts.length };
    throw new Error('synthetic offline');
  };
  const service = new SocialFeedService({ dataRoot: directory, settingsProvider: async () => settings(), networkBroker: offlineBroker, now: () => now });
  const result = await service.getFeed();
  assert.equal(result.available, true);
  assert.deepEqual(result.posts.map((item) => item.text), ['Current cache record']);
  service.shutdown();
});

test('per-request timeout and shutdown abort in-flight broker work without blocking', async () => {
  let active = 0;
  const hangingBroker = (operation, payload, { signal } = {}) => {
    if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return Promise.resolve({ registered: payload.posts.length });
    active += 1;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { active -= 1; reject(signal.reason); }, { once: true }));
  };
  const timeoutService = new SocialFeedService({
    dataRoot: path.join(testRoot, 'timeout'), settingsProvider: async () => settings({ useJinaFallback: false }), networkBroker: hangingBroker,
    now: () => now, timeouts: { request: 5, total: 30 }
  });
  const unavailable = await timeoutService.getFeed();
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.reason, 'temporarily-unavailable');
  assert.equal(active, 0);
  timeoutService.shutdown();

  const shutdownService = new SocialFeedService({
    dataRoot: path.join(testRoot, 'shutdown'), settingsProvider: async () => settings({ useJinaFallback: false }), networkBroker: hangingBroker,
    now: () => now, timeouts: { request: 10000, total: 20000 }
  });
  const pending = shutdownService.getFeed();
  await new Promise((resolve) => setImmediate(resolve));
  shutdownService.shutdown();
  await assert.rejects(pending, /shutdown is in progress/);
  assert.equal(active, 0);
});
