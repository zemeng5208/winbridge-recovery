'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ACCOUNTS, ACCOUNT_IDS, canonicalSocialLink, validatePostId, computeSocialPostId, parseCanonicalPublishedAt } = require('../shared/social-contracts.cjs');

const MAX_CACHE_POSTS = 24;
const MAX_CACHE_BYTES = 512 * 1024;
const MAX_POST_TEXT = 2000;
const ALLOWED_SOURCES = new Set(['xxu-rss', 'rsshub', 'jina']);

function normalizeCachedPost(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!ACCOUNT_IDS.includes(value.account)) return null;
  const link = canonicalSocialLink(value.link, value.account);
  if (!link || typeof value.text !== 'string' || value.text.length < 1 || value.text.length > MAX_POST_TEXT) return null;
  if (value.displayName !== undefined && typeof value.displayName !== 'string') return null;
  if (value.handle !== undefined && typeof value.handle !== 'string') return null;
  if (value.timeUnconfirmed !== false || !ALLOWED_SOURCES.has(value.source)) return null;
  const parsedPublishedAt = parseCanonicalPublishedAt(value.publishedAt);
  if (parsedPublishedAt === null) return null;
  try { validatePostId(value.postId); } catch { return null; }
  const publishedAt = new Date(parsedPublishedAt).toISOString();
  const expectedPostId = computeSocialPostId({ account: value.account, link, text: value.text, publishedAt });
  if (value.postId !== expectedPostId) return null;
  if (value.displayName !== ACCOUNTS[value.account].displayName || value.handle !== ACCOUNTS[value.account].handle) return null;
  return {
    postId: value.postId,
    account: value.account,
    displayName: value.displayName,
    handle: value.handle,
    text: value.text,
    link,
    publishedAt,
    timeUnconfirmed: value.timeUnconfirmed,
    source: value.source
  };
}

class SocialFeedCache {
  constructor(dataRoot, { maxBytes = MAX_CACHE_BYTES, maxPosts = MAX_CACHE_POSTS } = {}) {
    this.dataRoot = path.resolve(dataRoot);
    this.directory = path.join(this.dataRoot, 'social');
    this.file = path.join(this.directory, 'feed-cache.json');
    this.maxBytes = maxBytes;
    this.maxPosts = maxPosts;
  }

  async read() {
    let handle;
    try {
      if (!await this.ensureBoundary(false)) return null;
      const fileStat = await fs.lstat(this.file);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) return null;
      handle = await fs.open(this.file, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > this.maxBytes) return null;
      const buffer = Buffer.allocUnsafe(this.maxBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead < 1 || bytesRead > this.maxBytes) return null;
      const payload = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, ''));
      if (payload?.schemaVersion !== 1 || typeof payload.savedAt !== 'string' || !Number.isFinite(Date.parse(payload.savedAt)) || !Array.isArray(payload.posts)) return null;
      const posts = payload.posts.slice(0, this.maxPosts).map(normalizeCachedPost).filter(Boolean);
      return posts.length ? { savedAt: payload.savedAt, posts } : null;
    } catch {
      return null;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async write(posts, savedAt = new Date().toISOString()) {
    const normalized = [];
    const ids = new Set();
    for (const input of posts) {
      const post = normalizeCachedPost(input);
      if (!post || ids.has(post.postId)) continue;
      ids.add(post.postId);
      normalized.push(post);
      if (normalized.length >= this.maxPosts) break;
    }
    if (!normalized.length) return false;
    const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 1, savedAt, posts: normalized }, null, 2)}\n`, 'utf8');
    if (bytes.length > this.maxBytes) throw new Error('Social cache exceeds its size boundary');
    if (!await this.ensureBoundary(true)) throw new Error('Social cache directory escaped application data');
    const token = `${process.pid}-${crypto.randomUUID()}`;
    const temporary = path.join(this.directory, `.feed-cache-${token}.tmp`);
    const previous = path.join(this.directory, `.feed-cache-${token}.previous`);
    let previousMoved = false;
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      if (await this.exists(this.file)) {
        const stat = await fs.lstat(this.file);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Existing social cache is not a regular file');
        await fs.rename(this.file, previous);
        previousMoved = true;
      }
      try {
        await fs.rename(temporary, this.file);
      } catch (error) {
        if (previousMoved && !await this.exists(this.file)) await fs.rename(previous, this.file).catch(() => {});
        throw error;
      }
      if (previousMoved) await fs.rm(previous, { force: true }).catch(() => {});
      return true;
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
      if (previousMoved && !await this.exists(this.file) && await this.exists(previous)) await fs.rename(previous, this.file).catch(() => {});
    }
  }

  async exists(candidate) {
    try { await fs.lstat(candidate); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }

  async ensureBoundary(create) {
    try {
      if (create) {
        await fs.mkdir(this.dataRoot, { recursive: true });
        await fs.mkdir(this.directory, { recursive: true });
      }
      const directoryStat = await fs.lstat(this.directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false;
      const [canonicalRoot, canonicalDirectory] = await Promise.all([fs.realpath(this.dataRoot), fs.realpath(this.directory)]);
      const relative = path.relative(canonicalRoot, canonicalDirectory);
      return relative === 'social' && !path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`);
    } catch (error) {
      if (!create && error.code === 'ENOENT') return false;
      throw error;
    }
  }
}

module.exports = { MAX_CACHE_POSTS, MAX_CACHE_BYTES, MAX_POST_TEXT, normalizeCachedPost, SocialFeedCache };
