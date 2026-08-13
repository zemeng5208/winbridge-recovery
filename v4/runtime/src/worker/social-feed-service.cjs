'use strict';

const {
  ACCOUNTS,
  ACCOUNT_IDS,
  SOCIAL_BROKER_OPERATIONS,
  MAX_SOCIAL_FUTURE_SKEW_MS,
  validateSocialSettings,
  validateSocialFeedOptions,
  validateTranslationRequest,
  validateOpenSocialRequest,
  canonicalSocialLink,
  canonicalizeSourcePostLink,
  computeSocialPostId,
  parseCanonicalPublishedAt
} = require('../shared/social-contracts.cjs');
const { MAX_POST_TEXT, SocialFeedCache } = require('./social-cache.cjs');

const MAX_SOURCE_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSLATION_RESPONSE_BYTES = 256 * 1024;
const MAX_TRANSLATION_OUTPUT = 4000;
const MAX_SOURCE_ENTRIES = 64;
const PER_REQUEST_TIMEOUT_MS = 9000;
const JINA_TIMEOUT_MS = 12000;
const TRANSLATION_TIMEOUT_MS = 12000;
const TOTAL_FEED_TIMEOUT_MS = 18000;

class SocialRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SocialRequestError';
    this.code = code;
  }
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_all, entity) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    }
    return named[entity.toLowerCase()] || '';
  });
}

function cleanText(value, maximum = MAX_POST_TEXT) {
  let text = String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
  text = text.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text).replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, maximum);
}

function extractXmlValue(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i').exec(block);
    if (match) return match[1].trim();
  }
  return '';
}

function extractSourceLink(block) {
  const textLink = extractXmlValue(block, ['link', 'guid']);
  if (textLink) return cleanText(textLink, 2048);
  const atom = /<link\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i.exec(block);
  return atom ? decodeEntities(atom[1] || atom[2] || '').trim().slice(0, 2048) : '';
}

const RFC_MONTHS = Object.freeze({ Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 });
const RFC_WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

function parseRssPublishedAt(value) {
  const text = cleanText(value, 128);
  const canonical = parseCanonicalPublishedAt(text);
  if (canonical !== null) return new Date(canonical).toISOString();
  const isoMatch = /^(20\d{2})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (isoMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '0', zone] = isoMatch;
    const year = Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const millisecond = Number(fraction.padEnd(3, '0'));
    if (month < 0 || month > 11 || hour > 23 || minute > 59 || second > 59) return null;
    const localBase = Date.UTC(year, month, day, hour, minute, second, millisecond);
    const localDate = new Date(localBase);
    if (localDate.getUTCFullYear() !== year || localDate.getUTCMonth() !== month || localDate.getUTCDate() !== day ||
        localDate.getUTCHours() !== hour || localDate.getUTCMinutes() !== minute || localDate.getUTCSeconds() !== second ||
        localDate.getUTCMilliseconds() !== millisecond) return null;
    let offsetMinutes = 0;
    if (zone !== 'Z') {
      const offsetHours = Number(zone.slice(1, 3));
      const offsetRemainder = Number(zone.slice(4, 6));
      if (offsetHours > 14 || offsetRemainder > 59 || (offsetHours === 14 && offsetRemainder !== 0)) return null;
      offsetMinutes = (offsetHours * 60 + offsetRemainder) * (zone[0] === '+' ? 1 : -1);
    }
    return new Date(localBase - offsetMinutes * 60 * 1000).toISOString();
  }
  const match = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(20\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(GMT|UT|UTC|[+-]\d{4})$/.exec(text);
  if (!match) return null;
  const [, weekday, dayText, monthText, yearText, hourText, minuteText, secondText, zone] = match;
  const day = Number(dayText);
  const month = RFC_MONTHS[monthText];
  const year = Number(yearText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const localBase = Date.UTC(year, month, day, hour, minute, second);
  const localDate = new Date(localBase);
  if (localDate.getUTCFullYear() !== year || localDate.getUTCMonth() !== month || localDate.getUTCDate() !== day ||
      localDate.getUTCHours() !== hour || localDate.getUTCMinutes() !== minute || localDate.getUTCSeconds() !== second) return null;
  if (weekday && RFC_WEEKDAYS[localDate.getUTCDay()] !== weekday) return null;
  let offsetMinutes = 0;
  if (/^[+-]\d{4}$/.test(zone)) {
    const offsetHours = Number(zone.slice(1, 3));
    const offsetRemainder = Number(zone.slice(3, 5));
    if (offsetHours > 23 || offsetRemainder > 59) return null;
    offsetMinutes = (offsetHours * 60 + offsetRemainder) * (zone[0] === '+' ? 1 : -1);
  }
  return new Date(localBase - offsetMinutes * 60 * 1000).toISOString();
}

function makePost(accountId, { text, link, publishedAt = null, timeUnconfirmed = false, source }) {
  const profile = ACCOUNTS[accountId];
  const normalizedText = cleanText(text);
  const normalizedLink = canonicalizeSourcePostLink(link, accountId) || canonicalSocialLink(`https://x.com/${profile.handle}`, accountId);
  if (!normalizedText || !normalizedLink) return null;
  const parsedTime = parseCanonicalPublishedAt(publishedAt);
  const validTime = parsedTime === null ? null : new Date(parsedTime).toISOString();
  const postId = computeSocialPostId({ account: accountId, link: normalizedLink, text: normalizedText, publishedAt: validTime });
  return {
    postId,
    account: accountId,
    displayName: profile.displayName,
    handle: profile.handle,
    text: normalizedText,
    link: normalizedLink,
    publishedAt: validTime,
    timeUnconfirmed: Boolean(timeUnconfirmed || !validTime),
    source
  };
}

function parseRss(accountId, xml, source) {
  if (typeof xml !== 'string' || xml.length < 1) return [];
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, MAX_SOURCE_ENTRIES);
  const posts = [];
  for (const match of blocks) {
    const block = match[2];
    const text = extractXmlValue(block, ['description', 'content:encoded', 'summary', 'title']);
    const rawTime = extractXmlValue(block, ['pubDate', 'published', 'updated']);
    const parsedTime = parseRssPublishedAt(rawTime);
    const post = makePost(accountId, {
      text,
      link: extractSourceLink(block),
      publishedAt: parsedTime,
      timeUnconfirmed: !parsedTime,
      source
    });
    if (post) posts.push(post);
  }
  return posts;
}

function parseJina(accountId, markdown) {
  if (typeof markdown !== 'string' || markdown.length < 1) return [];
  const profile = ACCOUNTS[accountId];
  const posts = [];
  const bulletPattern = /^\*\s+\[!\[Image[^\]]*\]\([^\)]*\)\]\(https:\/\/x\.com\/[^\)]+\)\s*(.+?)\s*$/gim;
  for (const match of markdown.matchAll(bulletPattern)) {
    const post = makePost(accountId, { text: match[1], link: `https://x.com/${profile.handle}`, timeUnconfirmed: true, source: 'jina' });
    if (post && post.text.length >= 12) posts.push(post);
    if (posts.length >= 10) return posts;
  }
  const statusPattern = /(https:\/\/x\.com\/([A-Za-z0-9_]{1,32})\/status\/(\d{5,32}))/gi;
  for (const match of markdown.matchAll(statusPattern)) {
    if (match[2].toLowerCase() !== profile.handle.toLowerCase()) continue;
    const lineStart = Math.max(markdown.lastIndexOf('\n', match.index - 1) + 1, match.index - 1200);
    const lineEndValue = markdown.indexOf('\n', match.index + match[0].length);
    const lineEnd = lineEndValue < 0 ? Math.min(markdown.length, match.index + match[0].length + 1200) : lineEndValue;
    const text = cleanText(markdown.slice(lineStart, lineEnd).replace(match[0], ''));
    const post = makePost(accountId, { text, link: match[1], timeUnconfirmed: true, source: 'jina' });
    if (post && post.text.length >= 12) posts.push(post);
    if (posts.length >= 10) break;
  }
  return deduplicate(posts);
}

function deduplicate(posts) {
  const result = [];
  const keys = new Set();
  for (const post of posts) {
    const key = `${post.account}\0${post.link}\0${post.text}`;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(post);
  }
  return result;
}

function orderAndFilter(posts, { maxPosts, hours, now }) {
  if (!Number.isInteger(maxPosts) || maxPosts < 1 || !Number.isFinite(hours) || hours <= 0 || !Number.isFinite(now)) {
    throw new TypeError('Social time-window arguments are invalid');
  }
  const earliest = now - hours * 60 * 60 * 1000;
  // A fixed five-minute ceiling tolerates minor publisher/local clock skew only;
  // missing, invalid, or explicitly unconfirmed timestamps are never admitted.
  const latest = now + MAX_SOCIAL_FUTURE_SKEW_MS;
  return deduplicate(posts)
    .map((post) => ({ post, timestamp: post.timeUnconfirmed === false ? parseCanonicalPublishedAt(post.publishedAt) : null }))
    .filter(({ timestamp }) => timestamp !== null && timestamp >= earliest && timestamp <= latest)
    .sort((left, right) => right.timestamp - left.timestamp || left.post.postId.localeCompare(right.post.postId, 'en'))
    .slice(0, maxPosts)
    .map(({ post }) => post);
}

function failureCode(error) {
  if (error?.name === 'AbortError' || error?.code === 'timeout') return 'timeout';
  if (error instanceof SocialRequestError) return error.code;
  return 'network-error';
}

function readBrokerResponseBounded(value, maximum, acceptedContentTypes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SocialRequestError('invalid-response');
  if (!Number.isInteger(value.status) || value.status < 200 || value.status >= 300) throw new SocialRequestError('http-status');
  if (typeof value.contentType !== 'string' || !acceptedContentTypes.includes(value.contentType)) throw new SocialRequestError('content-type-rejected');
  if (!Buffer.isBuffer(value.body) && !(value.body instanceof Uint8Array)) throw new SocialRequestError('invalid-response');
  const body = Buffer.from(value.body);
  if (body.length > maximum) throw new SocialRequestError('response-too-large');
  return body.toString('utf8').replace(/^\uFEFF/, '');
}

class SocialFeedService {
  constructor({ dataRoot, settingsProvider, networkBroker, now = () => Date.now(), onLog = () => {}, timeouts = {} }) {
    if (typeof networkBroker !== 'function') throw new TypeError('A fixed-operation network broker is required');
    this.settingsProvider = settingsProvider;
    this.networkBroker = networkBroker;
    this.now = now;
    this.onLog = onLog;
    this.cache = new SocialFeedCache(dataRoot);
    this.timeouts = {
      request: timeouts.request || PER_REQUEST_TIMEOUT_MS,
      jina: timeouts.jina || JINA_TIMEOUT_MS,
      translation: timeouts.translation || TRANSLATION_TIMEOUT_MS,
      total: timeouts.total || TOTAL_FEED_TIMEOUT_MS
    };
    this.activeControllers = new Set();
    this.currentPosts = new Map();
    this.feedInFlight = false;
    this.shuttingDown = false;
  }

  async getFeed(input = {}) {
    this.assertRunning();
    if (this.feedInFlight) throw new Error('Social feed refresh is already in progress');
    this.feedInFlight = true;
    try {
      const options = validateSocialFeedOptions(input);
      const settings = validateSocialSettings((await this.settingsProvider()).social);
      await this.register([]);
      if (!settings.enabled) return this.unavailable('disabled');
      const requested = options.accounts || ACCOUNT_IDS.filter((id) => settings.accounts[id]);
      const accounts = requested.filter((id) => settings.accounts[id]);
      if (!accounts.length) return this.unavailable('disabled');
      const effective = {
        accounts,
        maxPosts: options.maxPosts ?? settings.maxPosts,
        hours: options.hours ?? settings.hours,
        useJinaFallback: options.useJinaFallback ?? settings.useJinaFallback,
        locale: options.locale ?? settings.locale
      };

      const totalController = this.trackController(new AbortController());
      const totalTimer = setTimeout(() => totalController.abort(new SocialRequestError('total-timeout')), this.timeouts.total);
      totalTimer.unref?.();
      try {
        const accountResults = await Promise.all(accounts.map((id) => this.fetchAccount(id, effective, totalController.signal)));
        this.assertRunning();
        const onlinePosts = accountResults.flatMap((result) => result.posts);
        const filteredAt = this.now();
        const allOrdered = orderAndFilter(onlinePosts, { maxPosts: 24, hours: effective.hours, now: filteredAt });
        if (allOrdered.length) {
          await this.cache.write(allOrdered, new Date(filteredAt).toISOString()).catch(() => this.log('cache', 'write-failed'));
          const posts = allOrdered.slice(0, effective.maxPosts);
          await this.register(posts);
          const returnedAccounts = new Set(allOrdered.map((post) => post.account));
          const failedAccounts = accountResults.filter((result) => !returnedAccounts.has(result.account)).map((result) => result.account);
          return {
            schemaVersion: 1,
            available: true,
            degraded: failedAccounts.length > 0,
            reason: failedAccounts.length ? 'partial-online-result' : null,
            fetchedAt: new Date(this.now()).toISOString(),
            cacheAgeSeconds: 0,
            locale: effective.locale,
            failedAccounts,
            posts
          };
        }
        return await this.cachedFallback(effective);
      } finally {
        clearTimeout(totalTimer);
        this.untrackController(totalController);
      }
    } finally {
      this.feedInFlight = false;
    }
  }

  async fetchAccount(accountId, effective, totalSignal) {
    const sources = ['xxu-rss', 'rsshub'];
    if (effective.useJinaFallback) sources.push('jina');
    for (const source of sources) {
      if (totalSignal.aborted || this.shuttingDown) break;
      try {
        const text = await this.fetchText(SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE, { account: accountId, source }, {
          timeoutMs: source === 'jina' ? this.timeouts.jina : this.timeouts.request,
          maximum: MAX_SOURCE_RESPONSE_BYTES,
          acceptedContentTypes: source === 'jina'
            ? ['text/plain', 'text/markdown']
            : ['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain'],
          totalSignal
        });
        const parsedPosts = source === 'jina' ? parseJina(accountId, text) : parseRss(accountId, text, source);
        const posts = orderAndFilter(parsedPosts, { maxPosts: 10, hours: effective.hours, now: this.now() });
        if (posts.length) return { account: accountId, source, posts };
        this.log(accountId, `${source}:no-trusted-current-posts`);
      } catch (error) {
        this.log(accountId, `${source}:${failureCode(error)}`);
      }
    }
    return { account: accountId, source: null, posts: [] };
  }

  async fetchText(operation, payload, { timeoutMs, maximum, acceptedContentTypes, totalSignal }) {
    this.assertRunning();
    if (totalSignal?.aborted) throw totalSignal.reason || new SocialRequestError('total-timeout');
    const controller = this.trackController(new AbortController());
    const forwardAbort = () => controller.abort(totalSignal.reason || new SocialRequestError('total-timeout'));
    totalSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new SocialRequestError('timeout')), timeoutMs);
    timer.unref?.();
    try {
      const response = await this.networkBroker(operation, payload, { signal: controller.signal, timeoutMs: timeoutMs + 3000 });
      return readBrokerResponseBounded(response, maximum, acceptedContentTypes);
    } catch (error) {
      if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
      if (controller.signal.aborted) throw controller.signal.reason || new SocialRequestError('timeout');
      throw error;
    } finally {
      clearTimeout(timer);
      totalSignal?.removeEventListener('abort', forwardAbort);
      this.untrackController(controller);
    }
  }

  async cachedFallback(effective) {
    this.assertRunning();
    const cached = await this.cache.read();
    this.assertRunning();
    if (!cached) return this.unavailable('temporarily-unavailable', effective.locale);
    const selectedAccounts = new Set(effective.accounts);
    const candidates = cached.posts.filter((post) => selectedAccounts.has(post.account));
    const posts = orderAndFilter(candidates, { maxPosts: effective.maxPosts, hours: effective.hours, now: this.now() });
    if (!posts.length) return this.unavailable('temporarily-unavailable', effective.locale);
    await this.register(posts);
    return {
      schemaVersion: 1,
      available: true,
      degraded: true,
      reason: 'cached-after-online-failure',
      fetchedAt: cached.savedAt,
      cacheAgeSeconds: Math.max(0, Math.floor((this.now() - Date.parse(cached.savedAt)) / 1000)),
      locale: effective.locale,
      failedAccounts: [...effective.accounts],
      posts
    };
  }

  async translate(request) {
    this.assertRunning();
    const value = validateTranslationRequest(request);
    const post = this.currentPosts.get(value.postId);
    if (!post) throw new Error('Social post is not registered in the current feed');
    try {
      const text = await this.fetchText(SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST, value, {
        timeoutMs: this.timeouts.translation,
        maximum: MAX_TRANSLATION_RESPONSE_BYTES,
        acceptedContentTypes: ['application/json', 'text/plain']
      });
      const root = JSON.parse(text);
      if (!Array.isArray(root) || !Array.isArray(root[0])) throw new SocialRequestError('invalid-translation');
      const translated = root[0].map((segment) => Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '').join('').trim().slice(0, MAX_TRANSLATION_OUTPUT);
      if (!translated) throw new SocialRequestError('invalid-translation');
      return { schemaVersion: 1, status: 'translated', postId: post.postId, targetLocale: value.targetLocale, text: translated };
    } catch (error) {
      if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
      this.log(post.account, `translation:${failureCode(error)}`);
      return { schemaVersion: 1, status: 'unavailable', postId: post.postId, targetLocale: value.targetLocale, reason: 'temporarily-unavailable' };
    }
  }

  resolveOpen(request) {
    this.assertRunning();
    const value = validateOpenSocialRequest(request);
    const post = this.currentPosts.get(value.postId);
    if (!post) throw new Error('Social post is not registered in the current feed');
    const link = canonicalSocialLink(post.link, post.account);
    if (!link) throw new Error('Registered social link failed its allowlist');
    return { postId: post.postId, account: post.account, link };
  }

  async register(posts) {
    const bounded = posts.slice(0, 10);
    this.currentPosts.clear();
    await this.networkBroker(SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS, {
      posts: bounded.map((post) => ({
        postId: post.postId,
        account: post.account,
        text: post.text,
        link: post.link,
        publishedAt: post.publishedAt
      }))
    });
    for (const post of bounded) this.currentPosts.set(post.postId, Object.freeze({ ...post }));
  }

  unavailable(reason, locale = null) {
    this.currentPosts.clear();
    return { schemaVersion: 1, available: false, degraded: true, reason, fetchedAt: null, cacheAgeSeconds: null, locale, failedAccounts: [], posts: [] };
  }

  log(accountId, outcome) {
    this.onLog({ level: 'warn', category: 'social-feed', message: `Social source state: account=${accountId}; outcome=${outcome}` });
  }

  trackController(controller) {
    if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
    this.activeControllers.add(controller);
    return controller;
  }

  untrackController(controller) {
    this.activeControllers.delete(controller);
  }

  assertRunning() {
    if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
  }

  shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const controller of this.activeControllers) controller.abort(new Error('Runtime shutdown is in progress'));
    this.activeControllers.clear();
    this.currentPosts.clear();
  }
}

module.exports = {
  MAX_SOURCE_RESPONSE_BYTES,
  MAX_TRANSLATION_RESPONSE_BYTES,
  MAX_SOURCE_ENTRIES,
  SocialRequestError,
  decodeEntities,
  cleanText,
  parseRss,
  parseRssPublishedAt,
  parseJina,
  makePost,
  orderAndFilter,
  readBrokerResponseBounded,
  SocialFeedService
};
