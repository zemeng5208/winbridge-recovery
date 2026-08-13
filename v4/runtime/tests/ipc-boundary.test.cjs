'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('preload exposes exactly the approved Runtime API names', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'preload', 'preload.cjs'), 'utf8');
  const apiBlock = source.match(/const api = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(apiBlock);
  const names = [...apiBlock[1].matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((match) => match[1]);
  assert.deepEqual(names, [
    'getAppInfo', 'getSettings', 'saveSettings', 'getSystemProfile', 'refreshSystemProfile',
    'runDiagnosis', 'getDiagnosisReport', 'startRepair', 'cancelOperation', 'openLogs',
    'openGPT', 'getPluginAssets', 'getSocialFeed', 'translateSocialPost', 'openSocialPost',
    'onEngineEvent', 'onLogBatch'
  ]);
  assert.doesNotMatch(source, /exposeInMainWorld\([^,]+,\s*ipcRenderer/);
  assert.doesNotMatch(source, /send\(|sendSync\(|invoke\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[,)]/);
});

test('renderer social API accepts no URL, host, path, header, or arbitrary translation text', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'preload', 'preload.cjs'), 'utf8');
  assert.match(source, /getSocialFeed: \(options = \{\}\)/);
  assert.match(source, /translateSocialPost: \(request\)/);
  assert.match(source, /openSocialPost: \(request\)/);
  assert.match(source, /allowedKeys\(input, \['accounts', 'maxPosts', 'hours', 'useJinaFallback', 'locale'\]/);
  assert.match(source, /allowedKeys\(input, \['postId', 'targetLocale'\]/);
  assert.match(source, /allowedKeys\(input, \['postId'\]/);
  assert.doesNotMatch(source, /socialFeedOptions[^]*allowedKeys\([^\n]*(?:url|host|path|header)/i);
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
  assert.match(main, /socialNetworkBroker\.resolveRegisteredLink\(validated\.postId, resolved\.account, link\)/);
  assert.match(main, /shell\.openExternal\(registeredLink\)/);
  assert.doesNotMatch(main, /shell\.openExternal\((?:request|validated|resolved)\./);
});

test('fallback renderer has no Node, process, filesystem, or child-process import', () => {
  const source = fs.readFileSync(path.join(root, 'renderer', 'fallback', 'app.js'), 'utf8');
  assert.doesNotMatch(source, /require\s*\(|ipcRenderer|child_process|node:fs|process\./);
  assert.match(source, /window\.winBridgeApi/);
});

test('shutdown implementation has no name-based or process-tree kill primitive', () => {
  const files = [
    path.join(root, 'src', 'main', 'main.cjs'),
    path.join(root, 'src', 'main', 'worker-manager.cjs'),
    path.join(root, 'src', 'worker', 'engine-worker.cjs')
  ];
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /taskkill|Stop-Process|Get-Process|wmic|Win32_Process/i);
  assert.doesNotMatch(source, /(ChatGPT|Codex|Chrome|Edge).{0,80}\.kill\s*\(/i);
});

test('BrowserWindow disables Node, webviews, arbitrary navigation and permissions', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /webviewTag:\s*false/);
  assert.match(source, /will-attach-webview/);
  assert.match(source, /will-navigate/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /assertTrustedSender/);
  assert.match(source, /session\.fromPartition\('winbridge-v4-runtime'\)/);
  assert.match(source, /session:\s*runtimeSession/);
  const html = fs.readFileSync(path.join(root, 'renderer', 'fallback', 'index.html'), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /frame-src 'none'/);
  assert.doesNotMatch(html, /<iframe|<webview/i);
});

test('packaged main document receives strict CSP before loadFile while development remains uninjected', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
  const policy = fs.readFileSync(path.join(root, 'src', 'main', 'csp-policy.cjs'), 'utf8');
  const install = main.indexOf('installProductionCsp(runtimeSession');
  const load = main.indexOf('await windowInstance.loadFile(trustedEntryPath)');
  assert.ok(install >= 0);
  assert.ok(load > install, 'production CSP must be installed before loadFile');
  assert.match(main, /appIsPackaged:\s*app\.isPackaged/);
  assert.match(policy, /if \(!appIsPackaged\) return \(\) => \{\}/);
  assert.match(policy, /details\.webContentsId !== webContentsId/);
  assert.match(policy, /details\.resourceType !== 'mainFrame'/);
  assert.match(policy, /details\.url !== trustedEntryUrl/);
  assert.doesNotMatch(policy, /unsafe-eval|https?:/i);
});

test('window uses hidden native title bar overlay without frameless custom controls', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'main', 'main.cjs'), 'utf8');
  assert.match(source, /show:\s*false/);
  assert.match(source, /backgroundColor:\s*'#0B1020'/);
  assert.match(source, /titleBarStyle:\s*'hidden'/);
  assert.match(source, /titleBarOverlay:\s*\{/);
  assert.match(source, /ready-to-show/);
  const readyListener = source.indexOf("windowInstance.once('ready-to-show'");
  const loadFile = source.indexOf('await windowInstance.loadFile(trustedEntryPath)');
  assert.ok(readyListener >= 0, 'ready-to-show listener must be registered');
  assert.ok(loadFile > readyListener, 'ready-to-show listener must be registered before awaiting loadFile');
  assert.match(source, /rendererReady\s*&&\s*rendererLoaded/);
  assert.match(source, /catch\s*\(error\)[\s\S]*windowInstance\.destroy\(\)[\s\S]*throw error/);
  assert.doesNotMatch(source, /frame:\s*false/);
  assert.doesNotMatch(source, /minimize\(\)|maximize\(\)|unmaximize\(\)/);
  assert.match(source, /assets.*winbridge-recovery\.ico/);
});
