'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const PLUGIN_IDS = Object.freeze(['browser', 'chrome', 'computer-use']);
const MIME = Object.freeze({ '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' });
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

function normalizeForComparison(value) {
  return path.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function unavailable(pluginId) {
  return { id: pluginId, available: false };
}

function configuredCodexHome(options = {}) {
  if (options.codexHome) return path.resolve(options.codexHome);
  if (options.home) return path.resolve(options.home, '.codex');
  if (process.env.CODEX_HOME) return path.resolve(process.env.CODEX_HOME);
  return path.join(os.homedir(), '.codex');
}

async function canonicalDirectory(candidate, boundary = null) {
  try {
    const real = await fs.realpath(candidate);
    const stat = await fs.stat(real);
    if (!stat.isDirectory()) return null;
    if (boundary && !isInside(boundary, real)) return null;
    return real;
  } catch {
    return null;
  }
}

async function readBoundedCanonicalFile(candidate, root, maxBytes) {
  const real = await fs.realpath(candidate);
  if (!isInside(root, real)) throw new Error('File escaped its canonical plugin root');
  const handle = await fs.open(real, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) throw new Error('File size is outside the allowed range');
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 1 || bytesRead > maxBytes) throw new Error('File size changed outside the allowed range');
    return { realPath: real, bytes: buffer.subarray(0, bytesRead) };
  } finally {
    await handle.close().catch(() => {});
  }
}

function hasExpectedImageSignature(extension, bytes) {
  if (extension === '.png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === '.webp') {
    return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

async function hasCanonicalManifest(pluginRoot, allowedBase) {
  if (!isInside(allowedBase, pluginRoot)) return false;
  try {
    const manifest = await fs.realpath(path.join(pluginRoot, '.codex-plugin', 'plugin.json'));
    if (!isInside(pluginRoot, manifest)) return false;
    const stat = await fs.stat(manifest);
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_MANIFEST_BYTES;
  } catch {
    return false;
  }
}

async function collectVersionedRoots(allowedBase, pluginCandidate) {
  const canonicalCandidate = await canonicalDirectory(pluginCandidate, allowedBase);
  if (!canonicalCandidate) return [];
  const roots = [];
  if (await hasCanonicalManifest(canonicalCandidate, allowedBase)) {
    const stat = await fs.stat(canonicalCandidate).catch(() => null);
    roots.push({ root: canonicalCandidate, base: allowedBase, mtimeMs: stat?.mtimeMs || 0 });
  }
  let entries = [];
  try { entries = await fs.readdir(canonicalCandidate, { withFileTypes: true }); } catch { return roots; }
  for (const entry of entries) {
    if (!entry.isDirectory() || /^\.?((staging)|(incomplete))/i.test(entry.name)) continue;
    const root = await canonicalDirectory(path.join(canonicalCandidate, entry.name), allowedBase);
    if (!root || !await hasCanonicalManifest(root, allowedBase)) continue;
    const stat = await fs.stat(root).catch(() => null);
    roots.push({ root, base: allowedBase, mtimeMs: stat?.mtimeMs || 0 });
  }
  return roots;
}

async function findPluginRoots(pluginId, options = {}) {
  if (!PLUGIN_IDS.includes(pluginId)) throw new TypeError('Unsupported plugin id');
  const configuredHome = configuredCodexHome(options);
  const canonicalHome = await canonicalDirectory(configuredHome);
  if (!canonicalHome || normalizeForComparison(canonicalHome) !== normalizeForComparison(configuredHome)) return [];

  const configuredBases = [
    path.join(canonicalHome, 'marketplaces', 'openai-bundled', 'plugins'),
    path.join(canonicalHome, 'plugins', 'cache', 'openai-bundled'),
    path.join(canonicalHome, '.tmp', 'bundled-marketplaces', 'openai-bundled', 'plugins')
  ];
  const roots = [];
  for (const configuredBase of configuredBases) {
    const base = await canonicalDirectory(configuredBase, canonicalHome);
    if (!base) continue;
    roots.push(...await collectVersionedRoots(base, path.join(base, pluginId)));

    let bundles = [];
    try { bundles = await fs.readdir(base, { withFileTypes: true }); } catch { continue; }
    for (const bundle of bundles) {
      if (!bundle.isDirectory() || /^\.?((staging)|(incomplete))/i.test(bundle.name)) continue;
      roots.push(...await collectVersionedRoots(base, path.join(base, bundle.name, 'plugins', pluginId)));
    }
  }
  const unique = new Map();
  for (const candidate of roots) unique.set(normalizeForComparison(candidate.root), candidate);
  return [...unique.values()].sort((left, right) => right.mtimeMs - left.mtimeMs);
}

async function readPluginAsset(pluginId, options = {}) {
  if (!PLUGIN_IDS.includes(pluginId)) throw new TypeError('Unsupported plugin id');
  const candidates = await findPluginRoots(pluginId, options);
  for (const candidate of candidates) {
    try {
      const manifestFile = await readBoundedCanonicalFile(
        path.join(candidate.root, '.codex-plugin', 'plugin.json'),
        candidate.root,
        MAX_MANIFEST_BYTES
      );
      const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
      const logo = manifest?.interface?.logo;
      if (typeof logo !== 'string' || logo.length < 1 || logo.length > 512 || path.isAbsolute(logo) || logo.includes('\\') || logo.includes('\0')) continue;
      const lexicalAsset = path.resolve(candidate.root, logo.replace(/^\.\//, ''));
      if (!isInside(candidate.root, lexicalAsset)) continue;
      const extension = path.extname(lexicalAsset).toLowerCase();
      const mimeType = MIME[extension];
      if (!mimeType) continue;
      const asset = await readBoundedCanonicalFile(lexicalAsset, candidate.root, MAX_ICON_BYTES);
      if (!hasExpectedImageSignature(extension, asset.bytes)) continue;
      return {
        id: pluginId,
        available: true,
        displayName: String(manifest?.interface?.displayName || manifest?.name || pluginId).slice(0, 128),
        version: String(manifest?.version || 'unknown').slice(0, 64),
        hash: crypto.createHash('sha256').update(asset.bytes).digest('hex').toUpperCase(),
        dataUrl: `data:${mimeType};base64,${asset.bytes.toString('base64')}`
      };
    } catch {
      // A broken candidate is isolated; the next canonical candidate may still be valid.
    }
  }
  return unavailable(pluginId);
}

async function getPluginAssets(options = {}) {
  const items = await Promise.all(PLUGIN_IDS.map(async (id) => {
    try { return await readPluginAsset(id, options); }
    catch { return unavailable(id); }
  }));
  return { readOnly: true, items };
}

module.exports = {
  PLUGIN_IDS,
  MAX_MANIFEST_BYTES,
  MAX_ICON_BYTES,
  isInside,
  configuredCodexHome,
  readBoundedCanonicalFile,
  hasExpectedImageSignature,
  findPluginRoots,
  readPluginAsset,
  getPluginAssets
};
