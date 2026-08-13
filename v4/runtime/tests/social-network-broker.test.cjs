'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SOCIAL_BROKER_OPERATIONS,
  computeSocialPostId
} = require('../src/shared/social-contracts.cjs');
const {
  MAX_SOURCE_RESPONSE_BYTES,
  readResponseBytes,
  SocialNetworkBroker
} = require('../src/main/social-network-broker.cjs');

const root = path.resolve(__dirname, '..');

function fakeResponse(body, contentType = 'application/rss+xml', status = 200, contentLength = null) {
  const bytes = Buffer.from(body);
  return {
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return contentLength === null ? String(bytes.length) : String(contentLength);
        return null;
      }
    },
    body: null,
    arrayBuffer: async () => bytes
  };
}

function boundPost() {
  const value = {
    account: 'chatgpt',
    link: 'https://x.com/ChatGPT/status/1234567890123456789',
    text: 'A registered synthetic post.',
    publishedAt: '2026-08-13T10:00:00.000Z'
  };
  return { ...value, postId: computeSocialPostId(value) };
}

test('broker constructs fixed URLs and transport options from structured allowlisted operations', async () => {
  const calls = [];
  const broker = new SocialNetworkBroker({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return fakeResponse('<rss><channel/></rss>');
  } });
  const result = await broker.handle('host-request-00000001', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: 'tibo', source: 'xxu-rss' });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, 'application/rss+xml');
  assert.equal(result.body.toString('utf8'), '<rss><channel/></rss>');
  assert.equal(calls[0].url, 'https://rss.xxu.do/twitter/user/thsottiaux');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal('Cookie' in calls[0].options.headers, false);
  await assert.rejects(() => broker.handle('host-request-00000002', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, {
    account: 'tibo', source: 'xxu-rss', url: 'http://127.0.0.1/'
  }), /not allowed/);
  await assert.rejects(() => broker.handle('host-request-00000003', 'fetch', { url: 'https://example.test/' }), /Unsupported/);
  broker.shutdown();
});

test('translation URL is rebuilt from the registered post binding and fixed target locale', async () => {
  const calls = [];
  const post = boundPost();
  const broker = new SocialNetworkBroker({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return fakeResponse('[[["Bonjour","A registered synthetic post."]]]', 'application/json');
  } });
  await broker.handle('host-register-0000001', SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS, { posts: [post] });
  await broker.handle('host-translate-000001', SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST, { postId: post.postId, targetLocale: 'fr' });
  const translatedUrl = new URL(calls[0].url);
  assert.equal(translatedUrl.hostname, 'translate.googleapis.com');
  assert.equal(translatedUrl.searchParams.get('q'), post.text);
  assert.equal(translatedUrl.searchParams.get('tl'), 'fr');
  await assert.rejects(() => broker.handle('host-translate-000002', SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST, {
    postId: post.postId, targetLocale: 'fr', text: 'unbound proxy text'
  }), /not allowed/);
  await assert.rejects(() => broker.handle('host-translate-000003', SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST, {
    postId: 'social-00000000000000000000000000000000', targetLocale: 'fr'
  }), /post-not-registered/);
  broker.shutdown();
});

test('open link resolution requires exact current post registration', async () => {
  const post = boundPost();
  const broker = new SocialNetworkBroker({ fetchImpl: async () => fakeResponse('unused') });
  await broker.handle('host-register-0000002', SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS, { posts: [post] });
  assert.equal(broker.resolveRegisteredLink(post.postId, post.account, post.link), post.link);
  assert.throws(() => broker.resolveRegisteredLink(post.postId, 'openai', post.link), /post-not-registered/);
  assert.throws(() => broker.resolveRegisteredLink('social-00000000000000000000000000000000', post.account, post.link), /post-not-registered/);
  broker.shutdown();
});

test('broker rejects oversized and unexpected response types before returning bytes to Worker', async () => {
  await assert.rejects(() => readResponseBytes(fakeResponse('small', 'application/rss+xml', 200, MAX_SOURCE_RESPONSE_BYTES + 1), MAX_SOURCE_RESPONSE_BYTES), /response-too-large/);
  const broker = new SocialNetworkBroker({ fetchImpl: async () => fakeResponse('not xml', 'application/octet-stream') });
  await assert.rejects(() => broker.handle('host-request-00000004', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: 'openai', source: 'xxu-rss' }), /content-type-rejected/);
  broker.shutdown();
});

test('broker timeout and shutdown abort only their owned active requests', async () => {
  let aborted = 0;
  const hangingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted += 1; reject(signal.reason); }, { once: true });
  });
  const timed = new SocialNetworkBroker({ fetchImpl: hangingFetch, timeouts: { source: 5 } });
  await assert.rejects(() => timed.handle('host-timeout-0000001', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: 'openai', source: 'xxu-rss' }), /timeout/);
  assert.equal(aborted, 1);
  timed.shutdown();

  const stopping = new SocialNetworkBroker({ fetchImpl: hangingFetch, timeouts: { source: 10000 } });
  const pending = stopping.handle('host-shutdown-000001', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: 'openai', source: 'xxu-rss' });
  await new Promise((resolve) => setImmediate(resolve));
  stopping.shutdown();
  await assert.rejects(pending, /shutdown is in progress/);
  await assert.rejects(() => stopping.handle('host-after-shutdown', SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: 'openai', source: 'xxu-rss' }), /shutdown is in progress/);
  assert.equal(aborted, 2);
});

test('construction uses Electron net.fetch and Worker has no Node global fetch fallback', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
  const broker = fs.readFileSync(path.join(root, 'src', 'main', 'social-network-broker.cjs'), 'utf8');
  const workerService = fs.readFileSync(path.join(root, 'src', 'worker', 'social-feed-service.cjs'), 'utf8');
  assert.match(main, /const\s+\{[^}]*\bnet\b[^}]*\}\s*=\s*require\('electron'\)/s);
  assert.match(main, /fetchImpl: \(url, options\) => net\.fetch\(url, options\)/);
  assert.match(broker, /redirect: 'manual'/);
  assert.match(broker, /credentials: 'omit'/);
  assert.doesNotMatch(workerService, /globalThis\.fetch|require\(['"]node:https['"]\)|https\.request/);
});
