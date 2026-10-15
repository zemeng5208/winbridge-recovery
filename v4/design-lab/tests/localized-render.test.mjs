import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { createRenderer, installBrowserStubs, visibleText } from "./helpers/render.mjs";

// CJK that may legitimately appear in the English UI: language names shown in
// their own script (interface language and social translation target).
const NATIVE_LANGUAGE_NAMES = ["简体中文", "中文"];
const CJK = /[　-〿㐀-鿿＀-￯]/;

let renderer;
let concepts;
let config;
let RecoveryModule;
let SettingsCenter;
let GameCenter;
let SnakeGame;
let MinesweeperGame;
let catalogKeys;

before(async () => {
  installBrowserStubs({ languages: ["es-ES"] });
  renderer = await createRenderer();
  concepts = await renderer.load("/src/data/concepts.js");
  config = await renderer.load("/src/lib/config.js");
  RecoveryModule = await renderer.load("/src/components/RecoveryWindow.jsx");
  SettingsCenter = (await renderer.load("/src/components/SettingsCenter.jsx")).default;
  GameCenter = (await renderer.load("/src/components/games/GameCenter.jsx")).default;
  SnakeGame = (await renderer.load("/src/components/games/SnakeGame.jsx")).default;
  MinesweeperGame = (await renderer.load("/src/components/games/MinesweeperGame.jsx")).default;
  catalogKeys = Object.keys((await renderer.load("/src/i18n/index.js")).getCatalog("zh-CN"));
});

after(async () => {
  await renderer?.close();
});

const noop = () => {};

function windowProps(runtimeMode) {
  const ui = config.createDefaultUiState();
  return {
    scheme: concepts.schemes[0], onSchemeChange: noop, mix: ui.mix, setMix: noop, settings: ui.settings, setSettings: noop,
    progress: 0, setProgress: noop, onRestoreDefaults: noop, onExportConfig: noop, onImportConfig: noop, runtimeMode,
  };
}

const sampleReport = Object.freeze({
  reportId: "report-0123456789abcdef",
  expiresAt: "2026-10-15T12:30:00.000Z",
  issues: [{
    category: "plugin-cache-drift",
    evidence: ["cache manifest hash differs from marketplace manifest"],
    impact: "Chrome plugin may load a stale build",
    plannedActions: ["backup", "replace", "register", "verify"],
    risk: "medium",
    writeScope: ["%USERPROFILE%\\.codex\\plugins\\cache"],
    canSkip: true,
    requiresRestart: false,
    confidence: 0.9,
    suggestionMode: "suggest-repair",
  }],
});

// Every user-facing surface of the desktop application, rendered in both modes.
function surfaces() {
  const { RepairReport, ResultPage, SupportBundleDialog, SocialFeed } = RecoveryModule;
  const RecoveryWindow = RecoveryModule.default;
  const ui = config.createDefaultUiState();
  const list = [];
  for (const runtimeMode of [true, false]) {
    const mode = runtimeMode ? "runtime" : "concept";
    list.push([`main window (${mode})`, createElement(RecoveryWindow, windowProps(runtimeMode))]);
    for (const { id } of concepts.settingCategories) {
      list.push([`settings/${id} (${mode})`, createElement(SettingsCenter, { ...windowProps(runtimeMode), open: true, onClose: noop, initialCategory: id, bridgeAvailable: runtimeMode, runtimeSettingsHydrated: runtimeMode })]);
    }
    list.push([`repair report without report (${mode})`, createElement(RepairReport, { onClose: noop, report: null, runtimeMode, canRepair: false, canOpenGPT: false, onConfirmRepair: noop, onOpenGPT: noop })]);
    list.push([`repair report with report (${mode})`, createElement(RepairReport, { onClose: noop, report: sampleReport, runtimeMode, canRepair: true, canOpenGPT: true, onConfirmRepair: noop, onOpenGPT: noop })]);
    list.push([`result page (${mode})`, createElement(ResultPage, { onBack: noop, onOpenLogs: noop, onOpenGPT: noop, onRequestSupportBundle: noop, runtimeMode, canOpenLogs: false, canOpenGPT: false, canExportSupportBundle: false, report: sampleReport, repairResult: { operationId: "repair-1", finalVerificationPassed: true } })]);
    list.push([`social feed (${mode})`, createElement(SocialFeed, { onClose: noop, runtimeMode, runtimeController: null, settings: ui.settings })]);
  }
  list.push(["support bundle dialog", createElement(SupportBundleDialog, { onClose: noop, onConfirm: noop, busy: false })]);
  list.push(["game selection", createElement(GameCenter, { onClose: noop })]);
  list.push(["snake", createElement(SnakeGame)]);
  list.push(["minesweeper", createElement(MinesweeperGame)]);
  return list;
}

test("every desktop surface renders in English without Chinese text, raw keys, or unfilled placeholders", () => {
  for (const [name, element] of surfaces()) {
    let text = visibleText(renderer.render("en-US", element));
    for (const allowed of NATIVE_LANGUAGE_NAMES) text = text.split(allowed).join(" ");
    const leaked = text.match(new RegExp(`.{0,30}${CJK.source}.{0,30}`));
    assert.equal(leaked, null, `${name} still shows Chinese text: ${leaked?.[0]}`);
    const words = new Set(text.split(/[^\w.-]+/));
    const rawKey = catalogKeys.find((key) => words.has(key));
    assert.equal(rawKey, undefined, `${name} shows the untranslated key ${rawKey}`);
    assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${name} shows an unfilled placeholder`);
  }
});

test("every desktop surface still renders the original Chinese interface", () => {
  const RecoveryWindow = RecoveryModule.default;
  const main = visibleText(renderer.render("zh-CN", createElement(RecoveryWindow, windowProps(true))));
  for (const phrase of ["实时终端", "插件状态", "开始只读诊断", "用户决定修复", "备份随修复创建", "回滚不可单独执行", "写入锁定", "诊断决策摘要"]) {
    assert.ok(main.includes(phrase), `missing ${phrase}`);
  }
  assert.ok(!main.includes("Read-only diagnosis"));
  for (const [name, element] of surfaces()) {
    const text = visibleText(renderer.render("zh-CN", element));
    assert.match(text, CJK, `${name} rendered without Chinese text`);
    assert.doesNotMatch(text, /\{[a-zA-Z]+\}/, `${name} shows an unfilled placeholder`);
  }
});

test("switching the preference re-renders the same state in the other language", () => {
  const RecoveryWindow = RecoveryModule.default;
  const props = windowProps(true);
  const english = visibleText(renderer.render("en-US", createElement(RecoveryWindow, props)));
  const chinese = visibleText(renderer.render("zh-CN", createElement(RecoveryWindow, props)));
  const englishAgain = visibleText(renderer.render("en-US", createElement(RecoveryWindow, props)));
  assert.ok(english.includes("Start read-only diagnosis") && english.includes("Awaiting diagnosis"));
  assert.ok(chinese.includes("开始只读诊断") && chinese.includes("等待诊断"));
  assert.equal(englishAgain, english);
});

test("the system preference follows the Windows display language", () => {
  const RecoveryWindow = RecoveryModule.default;
  // Stubbed display language is es-ES: unsupported, so the documented fallback is English.
  const unsupported = visibleText(renderer.render("system", createElement(RecoveryWindow, windowProps(true))));
  assert.ok(unsupported.includes("Start read-only diagnosis"));
  installBrowserStubs({ languages: ["zh-TW", "en-US"] });
  try {
    const chinese = visibleText(renderer.render("system", createElement(RecoveryWindow, windowProps(true))));
    assert.ok(chinese.includes("开始只读诊断"));
  } finally {
    installBrowserStubs({ languages: ["es-ES"] });
  }
});

test("interface-generated plugin and log state is stored as keys, not translated text", () => {
  const states = RecoveryModule.freshRuntimePluginStates("plugin.state.diagnosing", "plugin.evidence.collectingRound");
  assert.equal(states.browser.state, "plugin.state.diagnosing");
  assert.deepEqual(states["computer-use"].evidence, { key: "plugin.evidence.collectingRound", params: { plugin: "Computer Use" } });
  const updated = RecoveryModule.updatePluginStatesFromLogs(states, [{ category: "chrome", message: "Chrome native host registration failed" }], "diagnosis");
  assert.equal(updated.chrome.state, "plugin.state.issueFound");
  // Engine output is evidence and stays verbatim in every language.
  assert.equal(updated.chrome.evidence, "Chrome native host registration failed");
  const finalized = RecoveryModule.finalizePluginStatesFromReport(states, { issues: [] });
  assert.equal(finalized.browser.state, "plugin.state.staticDiagnosisComplete");
});

test("repair errors and eligibility reasons map to localized messages without hiding unknown runtime reasons", () => {
  assert.deepEqual(RecoveryModule.localizeRepairError("Worker request timed out: repair.start"), { key: "repair.error.timeout" });
  assert.deepEqual(RecoveryModule.localizeRepairError("Frozen core did not provide final verification evidence"), { key: "repair.error.generic" });
  assert.deepEqual(RecoveryModule.repairEligibilityMessage("report-expired"), { key: "repair.eligibility.report-expired" });
  assert.equal(RecoveryModule.repairEligibilityMessage("future-reason"), "future-reason");
});
