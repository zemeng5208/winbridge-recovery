'use strict';

const {
  SOCIAL_BROKER_OPERATIONS,
  validateSocialRegistrationPayload,
  validateSocialSourceBrokerPayload,
  validateTranslationRequest,
  buildSocialSourceUrl,
  assertFixedSocialSourceUrl,
  buildTranslationUrl,
  assertFixedTranslationUrl
} = require('../shared/social-contracts.cjs');

const MAX_SOURCE_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TRANSLATION_RESPONSE_BYTES = 256 * 1024;
const SOURCE_TIMEOUT_MS = 9000;
const JINA_TIMEOUT_MS = 12000;
const TRANSLATION_TIMEOUT_MS = 12000;

const SOURCE_CONTENT_TYPES = Object.freeze({
  'xxu-rss': Object.freeze(['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain']),
  rsshub: Object.freeze(['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain']),
  jina: Object.freeze(['text/plain', 'text/markdown'])
});

class SocialNetworkError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SocialNetworkError';
    this.code = code;
  }
}

function normalizeContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase().slice(0, 128);
}

async function readResponseBytes(response, maximum) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maximum) throw new SocialNetworkError('response-too-large');
  const chunks = [];
  let total = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maximum) {
          try { await reader.cancel('response-too-large'); } catch {}
          throw new SocialNetworkError('response-too-large');
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else if (response.body?.[Symbol.asyncIterator]) {
    for await (const value of response.body) {
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maximum) throw new SocialNetworkError('response-too-large');
      chunks.push(chunk);
    }
  } else {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximum) throw new SocialNetworkError('response-too-large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

class SocialNetworkBroker {
  constructor({ fetchImpl, timeouts = {} }) {
    if (typeof fetchImpl !== 'function') throw new TypeError('Electron net.fetch implementation is required');
    this.fetchImpl = fetchImpl;
    this.timeouts = {
      source: timeouts.source || SOURCE_TIMEOUT_MS,
      jina: timeouts.jina || JINA_TIMEOUT_MS,
      translation: timeouts.translation || TRANSLATION_TIMEOUT_MS
    };
    this.registeredPosts = new Map();
    this.activeRequests = new Map();
    this.shuttingDown = false;
  }

  async handle(requestId, operation, payload) {
    this.assertRunning();
    if (typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 128) throw new TypeError('Broker request id is invalid');
    if (this.activeRequests.has(requestId)) throw new TypeError('Broker request id is already active');
    switch (operation) {
      case SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS:
        return this.registerPosts(payload);
      case SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE:
        return this.fetchSource(requestId, payload);
      case SOCIAL_BROKER_OPERATIONS.TRANSLATE_POST:
        return this.translatePost(requestId, payload);
      default:
        throw new TypeError('Unsupported social network operation');
    }
  }

  registerPosts(payload) {
    this.assertRunning();
    const value = validateSocialRegistrationPayload(payload);
    this.registeredPosts = new Map(value.posts.map((post) => [post.postId, Object.freeze({ ...post })]));
    return { registered: this.registeredPosts.size };
  }

  fetchSource(requestId, payload) {
    const value = validateSocialSourceBrokerPayload(payload);
    const url = assertFixedSocialSourceUrl(buildSocialSourceUrl(value.account, value.source), value.account, value.source);
    return this.fetchBounded(requestId, url, {
      timeoutMs: value.source === 'jina' ? this.timeouts.jina : this.timeouts.source,
      maximum: MAX_SOURCE_RESPONSE_BYTES,
      acceptedContentTypes: SOURCE_CONTENT_TYPES[value.source],
      accept: value.source === 'jina'
        ? 'text/plain, text/markdown;q=0.9'
        : 'application/rss+xml, application/atom+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, text/plain;q=0.5'
    });
  }

  translatePost(requestId, payload) {
    const value = validateTranslationRequest(payload);
    const post = this.registeredPosts.get(value.postId);
    if (!post) throw new SocialNetworkError('post-not-registered');
    const boundText = post.text.slice(0, 1800);
    const url = assertFixedTranslationUrl(buildTranslationUrl(boundText, value.targetLocale), boundText, value.targetLocale);
    return this.fetchBounded(requestId, url, {
      timeoutMs: this.timeouts.translation,
      maximum: MAX_TRANSLATION_RESPONSE_BYTES,
      acceptedContentTypes: ['application/json', 'text/plain'],
      accept: 'application/json, text/plain;q=0.5'
    });
  }

  async fetchBounded(requestId, url, { timeoutMs, maximum, acceptedContentTypes, accept }) {
    this.assertRunning();
    const controller = new AbortController();
    this.activeRequests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(new SocialNetworkError('timeout')), timeoutMs);
    timer.unref?.();
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        headers: Object.freeze({ Accept: accept, 'User-Agent': 'WinBridge-Recovery/4.0' })
      });
      this.assertRunning();
      if (!response || !Number.isInteger(response.status)) throw new SocialNetworkError('invalid-response');
      if (response.status >= 300 && response.status < 400) throw new SocialNetworkError('redirect-rejected');
      if (response.status < 200 || response.status >= 300) throw new SocialNetworkError('http-status');
      const contentType = normalizeContentType(response.headers?.get?.('content-type'));
      if (!acceptedContentTypes.includes(contentType)) throw new SocialNetworkError('content-type-rejected');
      const body = await readResponseBytes(response, maximum);
      this.assertRunning();
      return { status: response.status, contentType, body };
    } catch (error) {
      if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
      if (controller.signal.aborted) throw controller.signal.reason || new SocialNetworkError('timeout');
      throw error;
    } finally {
      clearTimeout(timer);
      this.activeRequests.delete(requestId);
    }
  }

  resolveRegisteredLink(postId, account, link) {
    this.assertRunning();
    const post = this.registeredPosts.get(postId);
    if (!post || post.account !== account || post.link !== link) throw new SocialNetworkError('post-not-registered');
    return post.link;
  }

  cancel(requestId) {
    const controller = this.activeRequests.get(requestId);
    if (!controller) return false;
    controller.abort(new SocialNetworkError('cancelled'));
    return true;
  }

  shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const controller of this.activeRequests.values()) controller.abort(new Error('Runtime shutdown is in progress'));
    this.activeRequests.clear();
    this.registeredPosts.clear();
  }

  assertRunning() {
    if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
  }
}

module.exports = {
  MAX_SOURCE_RESPONSE_BYTES,
  MAX_TRANSLATION_RESPONSE_BYTES,
  SOURCE_CONTENT_TYPES,
  SocialNetworkError,
  normalizeContentType,
  readResponseBytes,
  SocialNetworkBroker
};
