'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

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

function canonicalizeFileUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('IPC sender URL is invalid'); }
  if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
    throw new Error('IPC sender is not a local application document');
  }
  try { return fs.realpathSync.native(path.resolve(fileURLToPath(parsed))); }
  catch { throw new Error('IPC sender path could not be canonicalized'); }
}

function assertTrustedIpcSender(event, { mainWindow, canonicalAppRoot, trustedEntryPath, shuttingDown = false }) {
  if (shuttingDown) throw new Error('Runtime shutdown is in progress');
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window is unavailable');
  if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('IPC sender is not the bound main frame');
  }
  const senderPath = canonicalizeFileUrl(event.senderFrame.url);
  if (!canonicalAppRoot || !trustedEntryPath || !isInside(canonicalAppRoot, senderPath) || !samePath(senderPath, trustedEntryPath)) {
    throw new Error('IPC sender is not the bound application entry');
  }
  return true;
}

module.exports = { normalizeForComparison, samePath, isInside, canonicalizeFileUrl, assertTrustedIpcSender };
