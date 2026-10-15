'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ENGINE_DIRECTORY = ['engine', 'integrated-4.0.0'];
const MAX_ASAR_HEADER_BYTES = 64 * 1024 * 1024;
const MAX_ENGINE_FILE_BYTES = 16 * 1024 * 1024;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function fixedPaths() {
  const projectRoot = path.resolve(__dirname, '..');
  return {
    sourceEngineRoot: path.join(projectRoot, ...ENGINE_DIRECTORY),
    packagedAsar: path.join(projectRoot, 'out', 'WinBridge-Recovery-V4-win32-x64', 'resources', 'app.asar')
  };
}

/**
 * Windows PowerShell 5.1 reads a BOM-less script in the active ANSI code
 * page, so any non-ASCII byte is decoded differently on zh-CN, es-ES, en-US,
 * etc. A script is only portable when it is pure ASCII or carries a BOM.
 */
function inspectPowerShellEncoding(bytes) {
  if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
    return { ok: true, encoding: 'utf-16-bom', hasNonAscii: true, reason: null };
  }
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const body = hasUtf8Bom ? bytes.subarray(3) : bytes;
  const hasNonAscii = body.some((byte) => byte >= 0x80);
  try {
    utf8Decoder.decode(body);
  } catch {
    return { ok: false, encoding: 'invalid-utf-8', hasNonAscii, reason: 'is not valid UTF-8' };
  }
  if (hasNonAscii && !hasUtf8Bom) {
    return { ok: false, encoding: 'utf-8-no-bom', hasNonAscii, reason: 'contains non-ASCII text but has no UTF-8 BOM; Windows PowerShell 5.1 would decode it with the ANSI code page' };
  }
  return { ok: true, encoding: hasUtf8Bom ? 'utf-8-bom' : 'ascii', hasNonAscii, reason: null };
}

function readAsarHeader(fd) {
  const prefix = Buffer.alloc(16);
  if (fs.readSync(fd, prefix, 0, prefix.length, 0) !== prefix.length) throw new Error('ASAR header is truncated');
  const headerPickleSize = prefix.readUInt32LE(4);
  const jsonLength = prefix.readUInt32LE(12);
  if (prefix.readUInt32LE(0) !== 4 || jsonLength > MAX_ASAR_HEADER_BYTES || jsonLength + 8 > headerPickleSize) {
    throw new Error('ASAR header is malformed or exceeds its size boundary');
  }
  const json = Buffer.alloc(jsonLength);
  if (fs.readSync(fd, json, 0, jsonLength, 16) !== jsonLength) throw new Error('ASAR header is truncated');
  return { header: JSON.parse(json.toString('utf8')), dataOffset: 8 + headerPickleSize };
}

function findAsarEntry(header, segments) {
  let node = header;
  for (const segment of segments) {
    node = node?.files?.[segment];
    if (!node) return null;
  }
  return node;
}

/** Reads one file's exact bytes out of an ASAR archive, as Electron serves them. */
function readAsarFile(asarPath, relativeSegments) {
  if (!relativeSegments.length || relativeSegments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    throw new Error(`ASAR entry path is invalid: ${relativeSegments.join('/')}`);
  }
  const fd = fs.openSync(asarPath, 'r');
  try {
    const { header, dataOffset } = readAsarHeader(fd);
    const entry = findAsarEntry(header, relativeSegments);
    if (!entry || entry.files || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`ASAR entry is missing: ${relativeSegments.join('/')}`);
    if (entry.size > MAX_ENGINE_FILE_BYTES) throw new Error(`ASAR entry exceeds its size boundary: ${relativeSegments.join('/')}`);
    if (entry.unpacked) return fs.readFileSync(path.join(`${asarPath}.unpacked`, ...relativeSegments));
    const entryOffset = Number(entry.offset);
    if (!Number.isSafeInteger(entryOffset) || entryOffset < 0) throw new Error(`ASAR entry offset is invalid: ${relativeSegments.join('/')}`);
    const content = Buffer.alloc(entry.size);
    const offset = dataOffset + entryOffset;
    if (fs.readSync(fd, content, 0, entry.size, offset) !== entry.size) throw new Error(`ASAR entry is truncated: ${relativeSegments.join('/')}`);
    return content;
  } finally {
    fs.closeSync(fd);
  }
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();

/**
 * Verifies the engine snapshot exactly as it was packaged: the manifest must
 * match the source manifest, every packaged file must match its pinned
 * SHA-256, and every packaged PowerShell script must be PowerShell 5.1 safe.
 */
function verifyPackagedEngine(asarPath, sourceEngineRoot) {
  const problems = [];
  const sourceManifestBytes = fs.readFileSync(path.join(sourceEngineRoot, 'SNAPSHOT.json'));
  const packagedManifestBytes = readAsarFile(asarPath, [...ENGINE_DIRECTORY, 'SNAPSHOT.json']);
  if (!packagedManifestBytes.equals(sourceManifestBytes)) problems.push('SNAPSHOT.json differs between the source tree and the package');
  const manifest = JSON.parse(packagedManifestBytes.toString('utf8'));
  const files = [];
  for (const entry of manifest.files) {
    let bytes;
    try {
      bytes = readAsarFile(asarPath, [...ENGINE_DIRECTORY, ...entry.path.split('/')]);
    } catch (error) {
      problems.push(error.message);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== entry.sha256) problems.push(`${entry.path}: packaged SHA-256 ${actual} does not match SNAPSHOT.json`);
    let encoding = null;
    if (/\.ps1$/i.test(entry.path)) {
      encoding = inspectPowerShellEncoding(bytes);
      if (!encoding.ok) problems.push(`${entry.path}: ${encoding.reason}`);
    }
    files.push({ path: entry.path, sha256: actual, encoding: encoding?.encoding ?? null });
  }
  return { ok: problems.length === 0, problems, files };
}

function main() {
  if (process.argv.length !== 2) throw new Error('verify-packaged-engine.cjs does not accept arguments');
  const { sourceEngineRoot, packagedAsar } = fixedPaths();
  if (!fs.existsSync(packagedAsar)) throw new Error(`Packaged app.asar is missing: ${packagedAsar}`);
  const result = verifyPackagedEngine(packagedAsar, sourceEngineRoot);
  if (!result.ok) throw new Error(`Packaged engine verification failed:\n- ${result.problems.join('\n- ')}`);
  console.log(`Packaged engine verified: ${result.files.length} files, PowerShell encodings ${[...new Set(result.files.map((file) => file.encoding).filter(Boolean))].join(', ')}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { fixedPaths, inspectPowerShellEncoding, readAsarFile, verifyPackagedEngine };
