'use strict';

const crypto = require('node:crypto');

const ACCOUNTS = Object.freeze({
  tibo: Object.freeze({ id: 'tibo', displayName: 'Tibo', handle: 'thsottiaux' }),
  openai: Object.freeze({ id: 'openai', displayName: 'OpenAI', handle: 'OpenAI' }),
  chatgpt: Object.freeze({ id: 'chatgpt', displayName: 'ChatGPT', handle: 'ChatGPT' })
});

const ACCOUNT_IDS = Object.freeze(Object.keys(ACCOUNTS));
const SOCIAL_LOCALES = Object.freeze(['zh', 'en', 'fr', 'es', 'ru', 'ar']);
const SOCIAL_SOURCES = Object.freeze(['xxu-rss', 'rsshub', 'jina']);
const MAX_SOCIAL_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SOCIAL_BROKER_OPERATIONS = Object.freeze({
  REGISTER_POSTS: 'social.register-posts',
  FETCH_SOURCE: 'social.fetch-source',
  TRANSLATE_POST: 'social.translate-post'
});
const DEFAULT_SOCIAL_SETTINGS = Object.freeze({
  enabled: true,
  accounts: Object.freeze({ tibo: true, openai: true, chatgpt: true }),
  maxPosts: 4,
  hours: 48,
  useJinaFallback: true,
  locale: 'zh'
});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, name) {
  if (!isPlainObject(value)) throw new TypeError(`${name} must be a plain object`);
}

function assertKeys(value, allowed, name) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not allowed`);
}

function assertInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`);
}

function assertLocale(value, name = 'locale') {
  if (!SOCIAL_LOCALES.includes(value)) throw new TypeError(`${name} is invalid`);
  return value;
}

function validateSocialSettings(value) {
  assertPlainObject(value, 'settings.social');
  const required = ['enabled', 'accounts', 'maxPosts', 'hours', 'useJinaFallback', 'locale'];
  assertKeys(value, new Set(required), 'settings.social');
  for (const key of required) if (!(key in value)) throw new TypeError(`settings.social.${key} is required`);
  const result = { ...DEFAULT_SOCIAL_SETTINGS, ...value };
  if (typeof result.enabled !== 'boolean') throw new TypeError('settings.social.enabled must be boolean');
  if (typeof result.useJinaFallback !== 'boolean') throw new TypeError('settings.social.useJinaFallback must be boolean');
  assertInteger(result.maxPosts, 'settings.social.maxPosts', 1, 10);
  assertInteger(result.hours, 'settings.social.hours', 24, 72);
  assertLocale(result.locale, 'settings.social.locale');
  assertPlainObject(result.accounts, 'settings.social.accounts');
  assertKeys(result.accounts, new Set(ACCOUNT_IDS), 'settings.social.accounts');
  for (const id of ACCOUNT_IDS) if (!(id in result.accounts)) throw new TypeError(`settings.social.accounts.${id} is required`);
  const accounts = { ...DEFAULT_SOCIAL_SETTINGS.accounts, ...result.accounts };
  for (const id of ACCOUNT_IDS) if (typeof accounts[id] !== 'boolean') throw new TypeError(`settings.social.accounts.${id} must be boolean`);
  return { enabled: result.enabled, accounts, maxPosts: result.maxPosts, hours: result.hours, useJinaFallback: result.useJinaFallback, locale: result.locale };
}

function validateSocialFeedOptions(value = {}) {
  assertPlainObject(value, 'socialFeedOptions');
  assertKeys(value, new Set(['accounts', 'maxPosts', 'hours', 'useJinaFallback', 'locale']), 'socialFeedOptions');
  const result = {};
  if ('accounts' in value) {
    if (!Array.isArray(value.accounts) || value.accounts.length < 1 || value.accounts.length > 3) throw new TypeError('socialFeedOptions.accounts must contain 1 to 3 fixed account ids');
    if (new Set(value.accounts).size !== value.accounts.length || value.accounts.some((id) => !ACCOUNT_IDS.includes(id))) throw new TypeError('socialFeedOptions.accounts is invalid');
    result.accounts = [...value.accounts];
  }
  if ('maxPosts' in value) { assertInteger(value.maxPosts, 'socialFeedOptions.maxPosts', 1, 10); result.maxPosts = value.maxPosts; }
  if ('hours' in value) { assertInteger(value.hours, 'socialFeedOptions.hours', 24, 72); result.hours = value.hours; }
  if ('useJinaFallback' in value) {
    if (typeof value.useJinaFallback !== 'boolean') throw new TypeError('socialFeedOptions.useJinaFallback must be boolean');
    result.useJinaFallback = value.useJinaFallback;
  }
  if ('locale' in value) result.locale = assertLocale(value.locale, 'socialFeedOptions.locale');
  return result;
}

function validatePostId(value) {
  if (typeof value !== 'string' || !/^social-[0-9A-F]{32}$/.test(value)) throw new TypeError('postId is invalid');
  return value;
}

function parseCanonicalPublishedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) return null;
  return timestamp;
}

function validateTranslationRequest(value) {
  assertPlainObject(value, 'translationRequest');
  assertKeys(value, new Set(['postId', 'targetLocale']), 'translationRequest');
  return { postId: validatePostId(value.postId), targetLocale: assertLocale(value.targetLocale, 'translationRequest.targetLocale') };
}

function validateOpenSocialRequest(value) {
  assertPlainObject(value, 'openSocialRequest');
  assertKeys(value, new Set(['postId']), 'openSocialRequest');
  return { postId: validatePostId(value.postId) };
}

function computeSocialPostId({ account: accountId, link, text, publishedAt }) {
  account(accountId);
  const canonicalLink = canonicalSocialLink(link, accountId);
  if (!canonicalLink) throw new TypeError('Social post link is invalid');
  if (typeof text !== 'string' || text.length < 1 || text.length > 2000) throw new TypeError('Social post text is invalid');
  const canonicalTime = publishedAt === null ? null : new Date(publishedAt).toISOString();
  return `social-${crypto.createHash('sha256').update(`${accountId}\0${canonicalLink}\0${text}\0${canonicalTime || ''}`).digest('hex').slice(0, 32).toUpperCase()}`;
}

function validateRegisteredSocialPost(value, name = 'registeredPost') {
  assertPlainObject(value, name);
  const required = ['postId', 'account', 'text', 'link', 'publishedAt'];
  assertKeys(value, new Set(required), name);
  for (const key of required) if (!(key in value)) throw new TypeError(`${name}.${key} is required`);
  const accountId = value.account;
  account(accountId);
  const link = canonicalSocialLink(value.link, accountId);
  if (!link) throw new TypeError(`${name}.link is invalid`);
  if (typeof value.text !== 'string' || value.text.length < 1 || value.text.length > 2000) throw new TypeError(`${name}.text is invalid`);
  const parsedPublishedAt = parseCanonicalPublishedAt(value.publishedAt);
  if (parsedPublishedAt === null) throw new TypeError(`${name}.publishedAt is invalid`);
  const publishedAt = new Date(parsedPublishedAt).toISOString();
  const postId = validatePostId(value.postId);
  if (postId !== computeSocialPostId({ account: accountId, link, text: value.text, publishedAt })) throw new TypeError(`${name}.postId does not match its bound content`);
  return { postId, account: accountId, text: value.text, link, publishedAt };
}

function validateSocialRegistrationPayload(value) {
  assertPlainObject(value, 'socialRegistration');
  assertKeys(value, new Set(['posts']), 'socialRegistration');
  if (!('posts' in value)) throw new TypeError('socialRegistration.posts is required');
  if (!Array.isArray(value.posts) || value.posts.length > 10) throw new TypeError('socialRegistration.posts must contain at most 10 posts');
  return { posts: value.posts.map((post, index) => validateRegisteredSocialPost(post, `socialRegistration.posts[${index}]`)) };
}

function validateSocialSourceBrokerPayload(value) {
  assertPlainObject(value, 'socialSourceRequest');
  assertKeys(value, new Set(['account', 'source']), 'socialSourceRequest');
  account(value.account);
  if (!SOCIAL_SOURCES.includes(value.source)) throw new TypeError('socialSourceRequest.source is invalid');
  return { account: value.account, source: value.source };
}

function account(id) {
  const value = ACCOUNTS[id];
  if (!value) throw new TypeError('Unsupported social account');
  return value;
}

function buildSocialSourceUrl(accountId, source) {
  const profile = account(accountId);
  if (!SOCIAL_SOURCES.includes(source)) throw new TypeError('Unsupported social source');
  if (source === 'xxu-rss') return `https://rss.xxu.do/twitter/user/${profile.handle}`;
  if (source === 'rsshub') return `https://rsshub.app/twitter/user/${profile.handle}`;
  return `https://r.jina.ai/https://x.com/${profile.handle}`;
}

function assertFixedSocialSourceUrl(value, accountId, source) {
  if (value !== buildSocialSourceUrl(accountId, source)) throw new TypeError('Outbound social source URL is not allowlisted');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) throw new TypeError('Outbound social source URL is invalid');
  return value;
}

function canonicalSocialLink(value, accountId) {
  const profile = account(accountId);
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'x.com' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 && segments.length !== 3) return null;
  if (segments[0].toLowerCase() !== profile.handle.toLowerCase()) return null;
  if (segments.length === 3 && (segments[1].toLowerCase() !== 'status' || !/^\d{5,32}$/.test(segments[2]))) return null;
  return segments.length === 1
    ? `https://x.com/${profile.handle}`
    : `https://x.com/${profile.handle}/status/${segments[2]}`;
}

function canonicalizeSourcePostLink(value, accountId) {
  let text = String(value || '').trim();
  text = text.replace(/^https:\/\/(?:www\.)?twitter\.com\//i, 'https://x.com/');
  text = text.replace(/^https:\/\/www\.x\.com\//i, 'https://x.com/');
  return canonicalSocialLink(text, accountId);
}

function buildTranslationUrl(text, targetLocale) {
  assertLocale(targetLocale, 'translation target');
  if (typeof text !== 'string' || text.length < 1 || text.length > 1800) throw new TypeError('Bound translation text is invalid');
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLocale);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  return url.toString();
}

function assertFixedTranslationUrl(value, boundText, targetLocale) {
  if (value !== buildTranslationUrl(boundText, targetLocale)) throw new TypeError('Outbound translation URL is not bound to the registered post');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'translate.googleapis.com' || parsed.pathname !== '/translate_a/single' || parsed.username || parsed.password || parsed.port || parsed.hash) throw new TypeError('Outbound translation URL is invalid');
  const keys = [...parsed.searchParams.keys()].sort();
  if (keys.join(',') !== 'client,dt,q,sl,tl') throw new TypeError('Outbound translation query is invalid');
  return value;
}

module.exports = {
  ACCOUNTS,
  ACCOUNT_IDS,
  SOCIAL_LOCALES,
  SOCIAL_SOURCES,
  MAX_SOCIAL_FUTURE_SKEW_MS,
  SOCIAL_BROKER_OPERATIONS,
  DEFAULT_SOCIAL_SETTINGS,
  validateSocialSettings,
  validateSocialFeedOptions,
  validatePostId,
  parseCanonicalPublishedAt,
  validateTranslationRequest,
  validateOpenSocialRequest,
  computeSocialPostId,
  validateRegisteredSocialPost,
  validateSocialRegistrationPayload,
  validateSocialSourceBrokerPayload,
  buildSocialSourceUrl,
  assertFixedSocialSourceUrl,
  canonicalSocialLink,
  canonicalizeSourcePostLink,
  buildTranslationUrl,
  assertFixedTranslationUrl
};
