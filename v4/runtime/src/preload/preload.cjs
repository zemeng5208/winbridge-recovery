'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const CHANNEL = Object.freeze({
  getAppInfo: 'wb:get-app-info',
  getSettings: 'wb:get-settings',
  saveSettings: 'wb:save-settings',
  getSystemProfile: 'wb:get-system-profile',
  refreshSystemProfile: 'wb:refresh-system-profile',
  runDiagnosis: 'wb:run-diagnosis',
  getDiagnosisReport: 'wb:get-diagnosis-report',
  startRepair: 'wb:start-repair',
  cancelOperation: 'wb:cancel-operation',
  openLogs: 'wb:open-logs',
  openGPT: 'wb:open-gpt',
  getPluginAssets: 'wb:get-plugin-assets',
  getSocialFeed: 'wb:get-social-feed',
  translateSocialPost: 'wb:translate-social-post',
  openSocialPost: 'wb:open-social-post',
  engineEvent: 'wb:engine-event',
  logBatch: 'wb:log-batch'
});

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${name} must be a plain object`);
  }
  return value;
}

function reportId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$/.test(value)) {
    throw new TypeError('reportId is invalid');
  }
  return value;
}

const SOCIAL_ACCOUNTS = Object.freeze(['tibo', 'openai', 'chatgpt']);
const SOCIAL_LOCALES = Object.freeze(['zh', 'en', 'fr', 'es', 'ru', 'ar']);

function allowedKeys(value, names, label) {
  const allowed = new Set(names);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${label}.${key} is not allowed`);
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function socialPostId(value) {
  if (typeof value !== 'string' || !/^social-[0-9A-F]{32}$/.test(value)) throw new TypeError('postId is invalid');
  return value;
}

function socialFeedOptions(value = {}) {
  const input = plainObject(value, 'socialFeedOptions');
  allowedKeys(input, ['accounts', 'maxPosts', 'hours', 'useJinaFallback', 'locale'], 'socialFeedOptions');
  const result = {};
  if ('accounts' in input) {
    if (!Array.isArray(input.accounts) || input.accounts.length < 1 || input.accounts.length > 3) {
      throw new TypeError('socialFeedOptions.accounts must contain 1 to 3 fixed account ids');
    }
    if (new Set(input.accounts).size !== input.accounts.length || input.accounts.some((id) => !SOCIAL_ACCOUNTS.includes(id))) {
      throw new TypeError('socialFeedOptions.accounts is invalid');
    }
    result.accounts = [...input.accounts];
  }
  if ('maxPosts' in input) result.maxPosts = boundedInteger(input.maxPosts, 'socialFeedOptions.maxPosts', 1, 10);
  if ('hours' in input) result.hours = boundedInteger(input.hours, 'socialFeedOptions.hours', 24, 72);
  if ('useJinaFallback' in input) {
    if (typeof input.useJinaFallback !== 'boolean') throw new TypeError('socialFeedOptions.useJinaFallback must be boolean');
    result.useJinaFallback = input.useJinaFallback;
  }
  if ('locale' in input) {
    if (!SOCIAL_LOCALES.includes(input.locale)) throw new TypeError('socialFeedOptions.locale is invalid');
    result.locale = input.locale;
  }
  return result;
}

function translationRequest(value) {
  const input = plainObject(value, 'translationRequest');
  allowedKeys(input, ['postId', 'targetLocale'], 'translationRequest');
  if (!SOCIAL_LOCALES.includes(input.targetLocale)) throw new TypeError('translationRequest.targetLocale is invalid');
  return { postId: socialPostId(input.postId), targetLocale: input.targetLocale };
}

function openSocialRequest(value) {
  const input = plainObject(value, 'openSocialRequest');
  allowedKeys(input, ['postId'], 'openSocialRequest');
  return { postId: socialPostId(input.postId) };
}

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('callback must be a function');
  const listener = (_event, payload) => callback(structuredClone(payload));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke(CHANNEL.getAppInfo),
  getSettings: () => ipcRenderer.invoke(CHANNEL.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(CHANNEL.saveSettings, plainObject(settings, 'settings')),
  getSystemProfile: () => ipcRenderer.invoke(CHANNEL.getSystemProfile),
  refreshSystemProfile: () => ipcRenderer.invoke(CHANNEL.refreshSystemProfile),
  runDiagnosis: () => ipcRenderer.invoke(CHANNEL.runDiagnosis),
  getDiagnosisReport: () => ipcRenderer.invoke(CHANNEL.getDiagnosisReport),
  startRepair: (id) => ipcRenderer.invoke(CHANNEL.startRepair, reportId(id)),
  cancelOperation: () => ipcRenderer.invoke(CHANNEL.cancelOperation),
  openLogs: () => ipcRenderer.invoke(CHANNEL.openLogs),
  openGPT: () => ipcRenderer.invoke(CHANNEL.openGPT),
  getPluginAssets: () => ipcRenderer.invoke(CHANNEL.getPluginAssets),
  getSocialFeed: (options = {}) => ipcRenderer.invoke(CHANNEL.getSocialFeed, socialFeedOptions(options)),
  translateSocialPost: (request) => ipcRenderer.invoke(CHANNEL.translateSocialPost, translationRequest(request)),
  openSocialPost: (request) => ipcRenderer.invoke(CHANNEL.openSocialPost, openSocialRequest(request)),
  onEngineEvent: (callback) => subscribe(CHANNEL.engineEvent, callback),
  onLogBatch: (callback) => subscribe(CHANNEL.logBatch, callback)
});

contextBridge.exposeInMainWorld('winBridgeApi', api);
