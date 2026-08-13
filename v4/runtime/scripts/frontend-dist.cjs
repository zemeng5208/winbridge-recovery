'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST_NAME = '.winbridge-frontend-manifest.json';
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 4096,
  maxDirectories: 1024,
  maxReferences: 16384,
  maxTotalBytes: 256 * 1024 * 1024,
  maxFileBytes: 32 * 1024 * 1024,
  maxIndexBytes: 4 * 1024 * 1024,
  maxManifestBytes: 4 * 1024 * 1024,
  maxRelativePathLength: 512
});

function fixedPaths() {
  const projectRoot = path.resolve(__dirname, '..');
  return Object.freeze({
    projectRoot,
    sourceDist: path.resolve(projectRoot, '..', 'design-lab', 'dist'),
    frontendRoot: path.join(projectRoot, 'frontend'),
    targetDist: path.join(projectRoot, 'frontend', 'dist')
  });
}

function normalizeForComparison(value) {
  return path.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function samePath(left, right) {
  return normalizeForComparison(left) === normalizeForComparison(right);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function toManifestPath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

async function canonicalDirectory(candidate, { requireExact = false } = {}) {
  const configured = path.resolve(candidate);
  const canonical = await fs.realpath(configured);
  const stat = await fs.stat(canonical);
  if (!stat.isDirectory()) throw new Error(`Frontend directory is not a directory: ${configured}`);
  if (requireExact && !samePath(configured, canonical)) throw new Error(`Frontend directory must not redirect outside its fixed path: ${configured}`);
  return canonical;
}

async function hashFileBounded(file, maxBytes) {
  const handle = await fs.open(file, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error(`Frontend file size is outside the allowed range: ${file}`);
    const hash = crypto.createHash('sha256');
    let bytesRead = 0;
    const stream = handle.createReadStream({ autoClose: false, start: 0 });
    for await (const chunk of stream) {
      bytesRead += chunk.length;
      if (bytesRead > maxBytes) throw new Error(`Frontend file grew beyond its size boundary: ${file}`);
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (bytesRead !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error(`Frontend file changed during verification: ${file}`);
    }
    return { size: bytesRead, sha256: hash.digest('hex').toUpperCase() };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function readTextBounded(file, maxBytes, { allowEmpty = false } = {}) {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if ((!allowEmpty && bytesRead < 1) || bytesRead > maxBytes) throw new Error(`Frontend text file exceeds its size boundary: ${file}`);
    return buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '');
  } finally {
    await handle.close().catch(() => {});
  }
}

async function enumerateTree(root, limits = DEFAULT_LIMITS, { excludeManifest = false } = {}) {
  const canonicalRoot = await canonicalDirectory(root, { requireExact: true });
  const records = [];
  let totalBytes = 0;
  let directoryCount = 1;

  async function walk(current, relativeDirectory) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') throw new Error('Invalid frontend path segment');
      const absolute = path.join(current, entry.name);
      const relative = path.join(relativeDirectory, entry.name);
      const manifestPath = toManifestPath(relative);
      if (manifestPath.length > limits.maxRelativePathLength) throw new Error(`Frontend relative path is too long: ${manifestPath}`);
      const lstat = await fs.lstat(absolute);
      if (lstat.isSymbolicLink()) throw new Error(`Frontend tree must not contain links: ${manifestPath}`);
      const canonical = await fs.realpath(absolute);
      if (!isInside(canonicalRoot, canonical)) throw new Error(`Frontend entry escaped its root: ${manifestPath}`);
      if (lstat.isDirectory()) {
        directoryCount += 1;
        if (directoryCount > limits.maxDirectories) throw new Error(`Frontend directory count exceeds ${limits.maxDirectories}`);
        await walk(canonical, relative);
        continue;
      }
      if (!lstat.isFile()) throw new Error(`Unsupported frontend entry type: ${manifestPath}`);
      if (excludeManifest && manifestPath === MANIFEST_NAME) continue;
      if (!excludeManifest && manifestPath === MANIFEST_NAME) throw new Error(`Source frontend must not contain reserved file ${MANIFEST_NAME}`);
      if (records.length + 1 > limits.maxFiles) throw new Error(`Frontend file count exceeds ${limits.maxFiles}`);
      const hashed = await hashFileBounded(canonical, limits.maxFileBytes);
      totalBytes += hashed.size;
      if (totalBytes > limits.maxTotalBytes) throw new Error(`Frontend total size exceeds ${limits.maxTotalBytes} bytes`);
      records.push({ path: manifestPath, size: hashed.size, sha256: hashed.sha256, absolute: canonical });
    }
  }

  await walk(canonicalRoot, '');
  records.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return { canonicalRoot, records, totalBytes };
}

function parseAttributes(source) {
  const attributes = new Map();
  const pattern = /\b([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of source.matchAll(pattern)) attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  return attributes;
}

function splitSrcSet(value) {
  if (/^\s*data:/i.test(value)) return [value.trim()];
  return value.split(',').map((item) => item.trim().split(/\s+/, 1)[0]).filter(Boolean);
}

function extractHtmlAssetReferences(html) {
  const references = [];
  const tags = /<(script|link|img|source|video|audio)\b([^>]*)>/gi;
  for (const match of html.matchAll(tags)) {
    const tag = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);
    if (tag === 'script' && attributes.has('src')) references.push(attributes.get('src'));
    if (tag === 'link' && attributes.has('href')) {
      const relationships = (attributes.get('rel') || '').toLowerCase().split(/\s+/);
      if (relationships.some((value) => ['stylesheet', 'icon', 'preload', 'modulepreload', 'manifest'].includes(value) || value.endsWith('icon'))) references.push(attributes.get('href'));
    }
    if (['img', 'source'].includes(tag)) {
      if (attributes.has('src')) references.push(attributes.get('src'));
      if (attributes.has('srcset')) references.push(...splitSrcSet(attributes.get('srcset')));
    }
    if (tag === 'video') {
      if (attributes.has('src')) references.push(attributes.get('src'));
      if (attributes.has('poster')) references.push(attributes.get('poster'));
    }
    if (tag === 'audio' && attributes.has('src')) references.push(attributes.get('src'));
  }
  return references;
}

function extractCssAssetReferences(css) {
  const references = [];
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi)) references.push(match[1] ?? match[2] ?? match[3] ?? '');
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)')\s*\)?/gi)) references.push(match[1] ?? match[2] ?? '');
  for (const match of css.matchAll(/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/g)) references.push(match[1] || '');
  return references;
}

function extractJsAssetReferences(javascript) {
  const references = [];
  const patterns = [
    /\b(?:from\s*|import\s*)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
    /[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)/g
  ];
  for (const pattern of patterns) for (const match of javascript.matchAll(pattern)) references.push(match[1] || '');
  return references;
}

function resolveLocalReference(reference, ownerPath) {
  const trimmed = String(reference || '').trim();
  if (!trimmed || trimmed.startsWith('#') || /^data:/i.test(trimmed)) return null;
  if (trimmed.startsWith('//') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new Error(`Frontend asset reference must be local: ${trimmed}`);
  }
  let decoded;
  try { decoded = decodeURIComponent(trimmed.split('#', 1)[0].split('?', 1)[0]); }
  catch { throw new Error(`Frontend asset reference has invalid encoding: ${trimmed}`); }
  if (!decoded || decoded.includes('\\') || decoded.includes('\0')) throw new Error(`Frontend asset reference is invalid: ${trimmed}`);
  const ownerDirectory = path.posix.dirname(ownerPath);
  if (decoded.startsWith('/')) throw new Error(`Frontend asset reference must be relative for file loading: ${trimmed}`);
  const relative = path.posix.normalize(path.posix.join(ownerDirectory === '.' ? '' : ownerDirectory, decoded));
  if (!relative || relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    throw new Error(`Frontend asset reference escaped its root: ${trimmed}`);
  }
  return relative;
}

async function validateLocalReferences(root, records, limits = DEFAULT_LIMITS) {
  const byPath = new Map(records.map((record) => [record.path.toLowerCase(), record]));
  const index = byPath.get('index.html');
  if (!index || index.path !== 'index.html') throw new Error('Frontend dist is missing exact lowercase index.html');
  if (index.size > limits.maxIndexBytes) throw new Error(`Frontend index.html exceeds ${limits.maxIndexBytes} bytes`);
  const references = [];

  async function requireReferences(owner, rawReferences) {
    for (const raw of rawReferences) {
      const resolved = resolveLocalReference(raw, owner.path);
      if (!resolved) continue;
      const target = byPath.get(resolved.toLowerCase());
      if (!target) throw new Error(`Frontend reference is missing: ${owner.path} -> ${resolved}`);
      references.push({ owner: owner.path, target: target.path });
      if (references.length > limits.maxReferences) throw new Error(`Frontend local reference count exceeds ${limits.maxReferences}`);
    }
  }

  const html = await readTextBounded(index.absolute || path.join(root, ...index.path.split('/')), limits.maxIndexBytes);
  await requireReferences(index, extractHtmlAssetReferences(html));
  for (const record of records.filter((item) => item.path.toLowerCase().endsWith('.css'))) {
    const css = await readTextBounded(record.absolute || path.join(root, ...record.path.split('/')), limits.maxFileBytes, { allowEmpty: true });
    await requireReferences(record, extractCssAssetReferences(css));
  }
  for (const record of records.filter((item) => /\.(?:m?js)$/i.test(item.path))) {
    const javascript = await readTextBounded(record.absolute || path.join(root, ...record.path.split('/')), limits.maxFileBytes, { allowEmpty: true });
    await requireReferences(record, extractJsAssetReferences(javascript));
  }
  const unique = new Map(references.map((item) => [`${item.owner}\0${item.target}`, item]));
  return [...unique.values()].sort((left, right) => `${left.owner}\0${left.target}`.localeCompare(`${right.owner}\0${right.target}`, 'en'));
}

async function buildSourcePlan(sourceDist, limits = DEFAULT_LIMITS) {
  const tree = await enumerateTree(sourceDist, limits);
  const localReferences = await validateLocalReferences(tree.canonicalRoot, tree.records, limits);
  const index = tree.records.find((record) => record.path.toLowerCase() === 'index.html');
  const manifest = {
    schemaVersion: 1,
    generatedBy: 'WinBridge Recovery V4 frontend sync',
    source: '../design-lab/dist',
    fileCount: tree.records.length,
    totalBytes: tree.totalBytes,
    indexSha256: index.sha256,
    files: tree.records.map(({ path: filePath, size, sha256 }) => ({ path: filePath, size, sha256 })),
    localReferences
  };
  return { ...tree, manifest };
}

function validateManifestShape(manifest, limits) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.source !== '../design-lab/dist') throw new Error('Frontend integration manifest identity is invalid');
  if (!Number.isInteger(manifest.fileCount) || manifest.fileCount < 1 || manifest.fileCount > limits.maxFiles) throw new Error('Frontend manifest file count is invalid');
  if (!Number.isInteger(manifest.totalBytes) || manifest.totalBytes < 1 || manifest.totalBytes > limits.maxTotalBytes) throw new Error('Frontend manifest total size is invalid');
  if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount) throw new Error('Frontend manifest file list is invalid');
  if (!Array.isArray(manifest.localReferences) || manifest.localReferences.length > limits.maxReferences) throw new Error('Frontend manifest reference list is invalid');
}

async function verifyFrontendDist(targetDist, limits = DEFAULT_LIMITS) {
  const canonicalTarget = await canonicalDirectory(targetDist, { requireExact: true });
  const tree = await enumerateTree(canonicalTarget, limits, { excludeManifest: true });
  const manifestFile = path.join(canonicalTarget, MANIFEST_NAME);
  const manifestText = await readTextBounded(manifestFile, limits.maxManifestBytes);
  const manifest = JSON.parse(manifestText);
  validateManifestShape(manifest, limits);
  if (tree.records.length !== manifest.fileCount || tree.totalBytes !== manifest.totalBytes) throw new Error('Frontend dist does not match its integration manifest totals');
  const expected = new Map(manifest.files.map((record) => [String(record.path).toLowerCase(), record]));
  if (expected.size !== manifest.files.length) throw new Error('Frontend manifest contains duplicate paths');
  for (const actual of tree.records) {
    const record = expected.get(actual.path.toLowerCase());
    if (!record || record.path !== actual.path || record.size !== actual.size || record.sha256 !== actual.sha256) {
      throw new Error(`Frontend dist file failed manifest verification: ${actual.path}`);
    }
    expected.delete(actual.path.toLowerCase());
  }
  if (expected.size) throw new Error(`Frontend dist is missing manifest file: ${expected.values().next().value.path}`);
  const index = tree.records.find((record) => record.path.toLowerCase() === 'index.html');
  if (!index || index.sha256 !== manifest.indexSha256) throw new Error('Frontend index.html failed manifest verification');
  const references = await validateLocalReferences(canonicalTarget, tree.records, limits);
  if (JSON.stringify(references) !== JSON.stringify(manifest.localReferences)) throw new Error('Frontend local references do not match the integration manifest');
  return { targetDist: canonicalTarget, fileCount: tree.records.length, totalBytes: tree.totalBytes, indexSha256: index.sha256 };
}

async function pathExists(candidate) {
  try { await fs.lstat(candidate); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function assertNoTransientSiblings(frontendRoot) {
  let entries = [];
  try { entries = await fs.readdir(frontendRoot); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const transient = entries.filter((name) => /^\.dist-(?:staging|previous)-/i.test(name));
  if (transient.length) throw new Error(`Frontend integration has unresolved transient directories: ${transient.sort().join(', ')}`);
}

async function syncFrontend({ sourceDist, frontendRoot, targetDist, limits = DEFAULT_LIMITS } = fixedPaths()) {
  const plan = await buildSourcePlan(sourceDist, limits);
  await fs.mkdir(frontendRoot, { recursive: true });
  const canonicalFrontendRoot = await canonicalDirectory(frontendRoot, { requireExact: true });
  await assertNoTransientSiblings(canonicalFrontendRoot);
  if (!isInside(canonicalFrontendRoot, path.resolve(targetDist))) throw new Error('Frontend target escaped the V4App frontend root');
  const token = `${process.pid}-${crypto.randomUUID()}`;
  const staging = path.join(canonicalFrontendRoot, `.dist-staging-${token}`);
  const previous = path.join(canonicalFrontendRoot, `.dist-previous-${token}`);
  let previousMoved = false;
  let installedNew = false;
  try {
    await fs.mkdir(staging, { recursive: false });
    for (const record of plan.records) {
      const destination = path.join(staging, ...record.path.split('/'));
      if (!isInside(staging, destination)) throw new Error(`Frontend copy target escaped staging: ${record.path}`);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(record.absolute, destination);
    }
    await fs.writeFile(path.join(staging, MANIFEST_NAME), `${JSON.stringify(plan.manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await verifyFrontendDist(staging, limits);

    if (await pathExists(targetDist)) {
      const targetStat = await fs.lstat(targetDist);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error('Existing frontend/dist is not a replaceable regular directory');
      await fs.rename(targetDist, previous);
      previousMoved = true;
    }
    try {
      await fs.rename(staging, targetDist);
      installedNew = true;
    } catch (error) {
      if (previousMoved && !await pathExists(targetDist)) await fs.rename(previous, targetDist).catch(() => {});
      throw error;
    }
    const verified = await verifyFrontendDist(targetDist, limits);
    let previousCleanupPending = false;
    if (previousMoved) {
      try { await fs.rm(previous, { recursive: true, force: true }); }
      catch { previousCleanupPending = true; }
    }
    return { ...verified, previousCleanupPending };
  } catch (error) {
    if (installedNew && await pathExists(targetDist)) {
      await fs.rename(targetDist, staging).catch(() => {});
      installedNew = false;
    }
    if (previousMoved && !await pathExists(targetDist) && await pathExists(previous)) await fs.rename(previous, targetDist).catch(() => {});
    throw error;
  } finally {
    if (await pathExists(staging).catch(() => false)) await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  MANIFEST_NAME,
  DEFAULT_LIMITS,
  fixedPaths,
  isInside,
  extractHtmlAssetReferences,
  extractCssAssetReferences,
  extractJsAssetReferences,
  resolveLocalReference,
  enumerateTree,
  buildSourcePlan,
  verifyFrontendDist,
  assertNoTransientSiblings,
  syncFrontend
};
