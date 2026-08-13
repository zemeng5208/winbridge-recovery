'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  PRODUCTION_CSP_DIRECTIVES,
  PRODUCTION_CSP,
  replaceCspHeader,
  installProductionCsp
} = require('../src/main/csp-policy.cjs');

const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'frontend', 'dist', 'index.html');

test('production CSP is the exact closed renderer policy', () => {
  assert.deepEqual(PRODUCTION_CSP_DIRECTIVES, [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'"
  ]);
  assert.doesNotMatch(PRODUCTION_CSP, /unsafe-eval/i);
  assert.doesNotMatch(PRODUCTION_CSP, /https?:/i);
  assert.match(PRODUCTION_CSP, /connect-src 'none'/);
  assert.equal(PRODUCTION_CSP_DIRECTIVES.filter((directive) => directive.startsWith('connect-src ')).length, 1);
});

test('production header replacement removes weaker duplicate CSP headers', () => {
  const headers = replaceCspHeader({
    'content-type': ['text/html'],
    'content-security-policy': ["default-src *; script-src 'unsafe-eval'"],
    'Content-Security-Policy-Report-Only': ['default-src https:']
  });
  assert.deepEqual(headers['Content-Security-Policy'], [PRODUCTION_CSP]);
  assert.equal('content-security-policy' in headers, false);
  assert.deepEqual(headers['content-type'], ['text/html']);
  assert.deepEqual(headers['Content-Security-Policy-Report-Only'], ['default-src https:']);
});

test('packaged policy binds exact entry URL, main frame, and current webContents', () => {
  const registrations = [];
  const runtimeSession = {
    webRequest: {
      onHeadersReceived(filter, listener) { registrations.push({ filter, listener }); }
    }
  };
  const remove = installProductionCsp(runtimeSession, { appIsPackaged: true, trustedEntryPath: entry, webContentsId: 41 });
  assert.equal(registrations.length, 1);
  assert.deepEqual(registrations[0].filter, { urls: [pathToFileURL(entry).href] });

  let result;
  registrations[0].listener({
    webContentsId: 41,
    resourceType: 'mainFrame',
    url: pathToFileURL(entry).href,
    responseHeaders: { 'content-type': ['text/html'] }
  }, (value) => { result = value; });
  assert.deepEqual(result.responseHeaders['Content-Security-Policy'], [PRODUCTION_CSP]);

  registrations[0].listener({
    webContentsId: 99,
    resourceType: 'mainFrame',
    url: pathToFileURL(entry).href,
    responseHeaders: { marker: ['unchanged'] }
  }, (value) => { result = value; });
  assert.deepEqual(result.responseHeaders, { marker: ['unchanged'] });

  remove();
  remove();
  assert.equal(registrations.length, 2);
  assert.deepEqual(registrations[1].filter, registrations[0].filter);
  assert.equal(registrations[1].listener, null);
});

test('development path does not install production response interception', () => {
  let registrations = 0;
  const runtimeSession = { webRequest: { onHeadersReceived() { registrations += 1; } } };
  const remove = installProductionCsp(runtimeSession, { appIsPackaged: false, trustedEntryPath: entry, webContentsId: 41 });
  assert.equal(registrations, 0);
  assert.doesNotThrow(remove);
});
