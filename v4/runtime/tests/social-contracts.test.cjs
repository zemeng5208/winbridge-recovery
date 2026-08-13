'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSettings, DEFAULT_SETTINGS } = require('../src/shared/contracts.cjs');
const {
  DEFAULT_SOCIAL_SETTINGS,
  validateSocialFeedOptions,
  validateTranslationRequest,
  validateOpenSocialRequest,
  validateSocialSourceBrokerPayload,
  validateSocialRegistrationPayload,
  buildSocialSourceUrl,
  assertFixedSocialSourceUrl,
  canonicalSocialLink,
  computeSocialPostId
} = require('../src/shared/social-contracts.cjs');

function registeredPost(overrides = {}) {
  const value = {
    account: 'openai',
    link: 'https://x.com/OpenAI/status/1234567890123456789',
    text: 'Synthetic bounded social post.',
    publishedAt: '2026-08-13T00:00:00.000Z',
    ...overrides
  };
  return { ...value, postId: computeSocialPostId(value) };
}

test('social settings have strict fixed defaults and reject unknown fields', () => {
  const settings = validateSettings({ ...DEFAULT_SETTINGS });
  assert.deepEqual(settings.social, DEFAULT_SOCIAL_SETTINGS);
  assert.throws(() => validateSettings({
    ...settings,
    social: { ...settings.social, endpoint: 'https://example.test' }
  }), /is not allowed/);
  assert.throws(() => validateSettings({
    ...settings,
    social: { ...settings.social, accounts: { ...settings.social.accounts, arbitrary: true } }
  }), /is not allowed/);
  assert.throws(() => validateSettings({ ...settings, social: { enabled: true } }), /is required/);
});

test('renderer social options expose only fixed accounts, ranges, and locales', () => {
  assert.deepEqual(validateSocialFeedOptions({ accounts: ['tibo', 'chatgpt'], maxPosts: 4, hours: 48, locale: 'zh' }), {
    accounts: ['tibo', 'chatgpt'], maxPosts: 4, hours: 48, locale: 'zh'
  });
  assert.throws(() => validateSocialFeedOptions({ accounts: ['attacker'] }), /invalid/);
  assert.throws(() => validateSocialFeedOptions({ maxPosts: 11 }), /between 1 and 10/);
  assert.throws(() => validateSocialFeedOptions({ hours: 23 }), /between 24 and 72/);
  assert.throws(() => validateSocialFeedOptions({ locale: 'de' }), /invalid/);
  assert.throws(() => validateSocialFeedOptions({ url: 'https://127.0.0.1/' }), /not allowed/);
});

test('source URL construction and public links cannot be redirected into SSRF targets', () => {
  assert.equal(buildSocialSourceUrl('tibo', 'xxu-rss'), 'https://rss.xxu.do/twitter/user/thsottiaux');
  assert.equal(buildSocialSourceUrl('openai', 'rsshub'), 'https://rsshub.app/twitter/user/OpenAI');
  assert.equal(buildSocialSourceUrl('chatgpt', 'jina'), 'https://r.jina.ai/https://x.com/ChatGPT');
  assert.throws(() => assertFixedSocialSourceUrl('https://rss.xxu.do/twitter/user/OpenAI?next=http://127.0.0.1', 'openai', 'xxu-rss'), /not allowlisted/);
  assert.throws(() => validateSocialSourceBrokerPayload({ account: 'openai', source: 'xxu-rss', url: 'https://example.test' }), /not allowed/);
  assert.equal(canonicalSocialLink('https://x.com/OpenAI/status/1234567890', 'openai'), 'https://x.com/OpenAI/status/1234567890');
  assert.equal(canonicalSocialLink('https://x.com.evil.test/OpenAI/status/1234567890', 'openai'), null);
  assert.equal(canonicalSocialLink('https://x.com/OpenAI/status/1234567890?next=https://127.0.0.1', 'openai'), null);
  assert.equal(canonicalSocialLink('https://x.com/not-openai/status/1234567890', 'openai'), null);
});

test('translation and open requests bind only an existing-shaped post id and fixed locale', () => {
  const post = registeredPost();
  assert.deepEqual(validateTranslationRequest({ postId: post.postId, targetLocale: 'fr' }), { postId: post.postId, targetLocale: 'fr' });
  assert.deepEqual(validateOpenSocialRequest({ postId: post.postId }), { postId: post.postId });
  assert.throws(() => validateTranslationRequest({ postId: post.postId, targetLocale: 'de' }), /invalid/);
  assert.throws(() => validateTranslationRequest({ postId: post.postId, targetLocale: 'fr', text: 'proxy me' }), /not allowed/);
  assert.throws(() => validateOpenSocialRequest({ postId: post.postId, url: 'https://example.test' }), /not allowed/);
});

test('broker registration requires post id to match its account, link, text, and timestamp binding', () => {
  const post = registeredPost();
  assert.equal(validateSocialRegistrationPayload({ posts: [post] }).posts[0].postId, post.postId);
  assert.throws(() => validateSocialRegistrationPayload({ posts: [{ ...post, text: 'tampered' }] }), /does not match/);
  assert.throws(() => validateSocialRegistrationPayload({ posts: [{ ...post, link: 'https://example.test/' }] }), /link is invalid/);
  assert.throws(() => validateSocialRegistrationPayload({ posts: [{ ...post, publishedAt: null }] }), /publishedAt is invalid/);
  assert.throws(() => validateSocialRegistrationPayload({ posts: [{ ...post, publishedAt: '2026-02-30T10:00:00.000Z' }] }), /publishedAt is invalid/);
  assert.throws(() => validateSocialRegistrationPayload({ posts: [post], url: 'https://example.test/' }), /not allowed/);
});
