'use strict';

const { pathToFileURL } = require('node:url');

const PRODUCTION_CSP_DIRECTIVES = Object.freeze([
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

const PRODUCTION_CSP = PRODUCTION_CSP_DIRECTIVES.join('; ');

function replaceCspHeader(responseHeaders = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(responseHeaders)) {
    if (name.toLowerCase() !== 'content-security-policy') headers[name] = value;
  }
  headers['Content-Security-Policy'] = [PRODUCTION_CSP];
  return headers;
}

function installProductionCsp(runtimeSession, { appIsPackaged, trustedEntryPath, webContentsId }) {
  if (!appIsPackaged) return () => {};
  if (!runtimeSession?.webRequest?.onHeadersReceived) throw new TypeError('A controlled Electron session is required');
  if (typeof trustedEntryPath !== 'string' || !Number.isInteger(webContentsId)) throw new TypeError('Trusted renderer identity is required');

  const trustedEntryUrl = pathToFileURL(trustedEntryPath).href;
  const filter = { urls: [trustedEntryUrl] };
  const listener = (details, callback) => {
    if (details.webContentsId !== webContentsId || details.resourceType !== 'mainFrame' || details.url !== trustedEntryUrl) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({ responseHeaders: replaceCspHeader(details.responseHeaders) });
  };

  runtimeSession.webRequest.onHeadersReceived(filter, listener);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    runtimeSession.webRequest.onHeadersReceived(filter, null);
  };
}

module.exports = {
  PRODUCTION_CSP_DIRECTIVES,
  PRODUCTION_CSP,
  replaceCspHeader,
  installProductionCsp
};
