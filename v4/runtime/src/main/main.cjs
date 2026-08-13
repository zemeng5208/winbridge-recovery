'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, shell, net, session } = require('electron');
const { IPC, validateSettings, validateReportId } = require('../shared/contracts.cjs');
const {
  validateSocialFeedOptions,
  validateTranslationRequest,
  validateOpenSocialRequest,
  canonicalSocialLink
} = require('../shared/social-contracts.cjs');
const { WorkerManager } = require('./worker-manager.cjs');
const { deriveRealRepairCapability } = require('./launch-policy.cjs');
const { assertTrustedIpcSender, isInside } = require('./ipc-policy.cjs');
const { SocialNetworkBroker } = require('./social-network-broker.cjs');
const { installProductionCsp } = require('./csp-policy.cjs');

const appRoot = path.resolve(__dirname, '..', '..');
let mainWindow = null;
let manager = null;
let socialNetworkBroker = null;
let quitting = false;
let canonicalAppRoot = null;
let trustedEntryPath = null;

function assertTrustedSender(event) {
  return assertTrustedIpcSender(event, { mainWindow, canonicalAppRoot, trustedEntryPath, shuttingDown: quitting });
}

function registerHandler(channel, handler, expectedArgumentCount = 0) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    if (args.length !== expectedArgumentCount) throw new TypeError(`Invalid argument count for ${channel}`);
    return handler(...args);
  });
}

function publish(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function registerIpc() {
  registerHandler(IPC.GET_APP_INFO, async () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    packaged: app.isPackaged,
    runtimeMode: true,
    realRepairEnabled: manager.capabilities?.realRepairEnabled === true,
    resultPagePersistsByDefault: true
  }));
  registerHandler(IPC.GET_SETTINGS, () => manager.request('settings.get'));
  registerHandler(IPC.SAVE_SETTINGS, (settings) => manager.request('settings.save', validateSettings(settings)), 1);
  registerHandler(IPC.GET_SYSTEM_PROFILE, () => manager.request('system.get'));
  registerHandler(IPC.REFRESH_SYSTEM_PROFILE, () => manager.request('system.refresh'));
  registerHandler(IPC.RUN_DIAGNOSIS, () => manager.request('diagnosis.run'));
  registerHandler(IPC.GET_DIAGNOSIS_REPORT, () => manager.request('diagnosis.get'));
  registerHandler(IPC.START_REPAIR, (reportId) => manager.request('repair.start', validateReportId(reportId)), 1);
  registerHandler(IPC.CANCEL_OPERATION, () => manager.request('operation.cancel'));
  registerHandler(IPC.OPEN_LOGS, async () => {
    const result = await manager.request('logs.path');
    const error = await shell.openPath(result.path);
    if (error) throw new Error(error);
    return { opened: true };
  });
  registerHandler(IPC.OPEN_GPT, () => manager.request('gpt.open'));
  registerHandler(IPC.GET_PLUGIN_ASSETS, () => manager.request('plugins.assets'));
  registerHandler(IPC.GET_SOCIAL_FEED, (options) => manager.request('social.feed', validateSocialFeedOptions(options)), 1);
  registerHandler(IPC.TRANSLATE_SOCIAL_POST, (request) => manager.request('social.translate', validateTranslationRequest(request)), 1);
  registerHandler(IPC.OPEN_SOCIAL_POST, async (request) => {
    const validated = validateOpenSocialRequest(request);
    const resolved = await manager.request('social.resolve-open', validated);
    const link = canonicalSocialLink(resolved?.link, resolved?.account);
    if (!link || resolved?.postId !== validated.postId) throw new Error('Worker returned an unregistered social link');
    const registeredLink = socialNetworkBroker.resolveRegisteredLink(validated.postId, resolved.account, link);
    await shell.openExternal(registeredLink);
    return { opened: true, postId: validated.postId };
  }, 1);
}

async function createWindow() {
  const preload = path.join(appRoot, 'src', 'preload', 'preload.cjs');
  const injectableIcon = path.join(appRoot, 'assets', 'winbridge-recovery.ico');
  const runtimeSession = session.fromPartition('winbridge-v4-runtime');
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0B1020',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0B1020',
      symbolColor: '#EEF2FF',
      height: 42
    },
    ...(fs.existsSync(injectableIcon) ? { icon: injectableIcon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      session: runtimeSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(chatgpt\.com|help\.openai\.com)\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    event.preventDefault();
    delete webPreferences.preload;
    delete params.src;
  });
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  const integrated = path.join(appRoot, 'frontend', 'dist', 'index.html');
  const integratedManifest = path.join(appRoot, 'frontend', 'dist', '.winbridge-frontend-manifest.json');
  const fallback = path.join(appRoot, 'renderer', 'fallback', 'index.html');
  if (app.isPackaged && (!fs.existsSync(integrated) || !fs.existsSync(integratedManifest))) {
    throw new Error('Packaged Runtime is missing its verified integrated frontend');
  }
  const selectedEntry = fs.existsSync(integrated) ? integrated : fallback;
  canonicalAppRoot = fs.realpathSync.native(appRoot);
  trustedEntryPath = fs.realpathSync.native(selectedEntry);
  if (!isInside(canonicalAppRoot, trustedEntryPath)) throw new Error('Selected renderer entry escaped the application root');
  const windowInstance = mainWindow;
  const removeProductionCsp = installProductionCsp(runtimeSession, {
    appIsPackaged: app.isPackaged,
    trustedEntryPath,
    webContentsId: windowInstance.webContents.id
  });
  let rendererReady = false;
  let rendererLoaded = false;
  const showLoadedWindow = () => {
    if (rendererReady && rendererLoaded && !windowInstance.isDestroyed()) windowInstance.show();
  };
  windowInstance.once('ready-to-show', () => {
    rendererReady = true;
    showLoadedWindow();
  });
  windowInstance.on('closed', () => {
    removeProductionCsp();
    if (mainWindow === windowInstance) mainWindow = null;
  });
  try {
    await windowInstance.loadFile(trustedEntryPath);
    rendererLoaded = true;
    showLoadedWindow();
  } catch (error) {
    if (!windowInstance.isDestroyed()) windowInstance.destroy();
    throw error;
  }
}

app.whenReady().then(async () => {
  const dataRoot = path.join(app.getPath('userData'), 'runtime-v4');
  const realRepairCapability = deriveRealRepairCapability({ isPackaged: app.isPackaged, argv: process.argv });
  socialNetworkBroker = new SocialNetworkBroker({ fetchImpl: (url, options) => net.fetch(url, options) });
  manager = new WorkerManager({ appRoot, dataRoot, realRepairCapability, hostBroker: socialNetworkBroker });
  manager.on('engine-event', (payload) => publish(IPC.ENGINE_EVENT, payload));
  manager.on('log-batch', (payload) => publish(IPC.LOG_BATCH, payload));
  await manager.start();
  registerIpc();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', (event) => {
  if (quitting || !manager) return;
  event.preventDefault();
  quitting = true;
  manager.shutdown().finally(() => app.quit());
});
