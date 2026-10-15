import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, getCatalog, matchSupportedLocale, normalizeLanguagePreference, resolveLocale, translate, uiMessage } from "../src/i18n/index.js";
import { colorPresets, diagnosticStages, recoveryStates, schemes, settingCategories } from "../src/data/concepts.js";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const zh = getCatalog("zh-CN");
const en = getCatalog("en-US");
const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const baseKey = (key) => key.replace(/_one$/, "");

function sourceFiles(directory = srcRoot) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "i18n" ? [] : sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

test("zh-CN and en-US catalogs have exactly the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(zh).filter((key) => !(key in en)), [], "keys missing from en-US");
  const extra = Object.keys(en).filter((key) => !(key in zh) && !(key.endsWith("_one") && baseKey(key) in zh));
  assert.deepEqual(extra, [], "en-US keys with no zh-CN source");
  for (const [key, value] of Object.entries(zh)) {
    assert.ok(value.trim(), `zh-CN ${key} is empty`);
    assert.ok(en[key].trim(), `en-US ${key} is empty`);
    assert.deepEqual(placeholders(en[key]), placeholders(value), `placeholder mismatch for ${key}`);
  }
  for (const key of Object.keys(en).filter((item) => item.endsWith("_one"))) {
    const allowed = new Set(placeholders(zh[baseKey(key)]));
    for (const name of placeholders(en[key])) assert.ok(allowed.has(name), `${key} uses unknown placeholder ${name}`);
  }
});

test("English catalog contains no Chinese text", () => {
  const leaked = Object.entries(en).filter(([, value]) => /[㐀-鿿　-〿＀-￯]/.test(value));
  assert.deepEqual(leaked, []);
});

test("every translation key referenced by the interface exists", () => {
  const referenced = new Set();
  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:t|uiMessage|pluginEvidence)\(\s*"([\w.-]+)"/g)) referenced.add(match[1]);
    for (const match of source.matchAll(/"((?:plugin|log|stages|settings|repair|social)\.[\w.-]+)"/g)) referenced.add(match[1]);
  }
  // Keys built from data ids at render time.
  for (const { id } of schemes) for (const field of ["name", "summary", "fit"]) referenced.add(`scheme.${id}.${field}`);
  for (const { id } of colorPresets) for (const field of ["name", "description"]) referenced.add(`colorPreset.${id}.${field}`);
  for (const { id } of settingCategories) referenced.add(`settings.category.${id}`);
  for (const { id } of recoveryStates) referenced.add(`recoveryState.${id}`);
  for (const { id } of diagnosticStages) for (const field of ["title", "detail"]) referenced.add(`stages.${id}.${field}`);
  for (const state of ["done", "completing", "activating", "active", "waiting"]) referenced.add(`stages.state.${state}`);
  for (const status of ["idle", "running", "paused", "gameover", "won"]) referenced.add(`games.snake.status.${status}`);
  for (const status of ["ready", "running", "won", "lost"]) referenced.add(`games.minesweeper.status.${status}`);
  for (const level of ["beginner", "intermediate"]) referenced.add(`games.minesweeper.difficulty.${level}`);
  for (const source of ["x-profile", "xxu-rss", "rsshub", "jina", "mock", "concept", "restricted"]) referenced.add(`social.source.${source}`);
  for (const id of ["browser", "chrome", "computer-use"]) referenced.add(`plugin.icon.${id}`);
  for (const index of [0, 1, 2]) referenced.add(`settings.progress.channelHint${index}`);
  for (const key of ["glassOpacity", "glassBlur", "glassRefraction", "edgeHighlight"]) referenced.add(`settings.appearance.${key}`);
  const missing = [...referenced].filter((key) => !(key in zh));
  assert.deepEqual(missing, []);
  assert.ok(referenced.size > 300);
});

test("translated strings are plain text; components never inject HTML", () => {
  for (const file of sourceFiles()) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /dangerouslySetInnerHTML|\.innerHTML\s*=/, file);
  assert.equal(translate("en-US", "social.sourceLabel", { source: "<img src=x onerror=alert(1)>" }), "Source: <img src=x onerror=alert(1)>");
});

test("interpolation fills named parameters, plural variants, and nested messages", () => {
  const t = createTranslator("en-US");
  assert.equal(t("terminal.capacity", { count: 12, limit: 80 }), "12 / 80 · batched rendering");
  assert.equal(t("brief.itemCount", { count: 1 }), "1 item");
  assert.equal(t("brief.itemCount", { count: 3 }), "3 items");
  assert.equal(t("brief.itemCount", { count: 0 }), "0 items");
  assert.equal(t("runtime.repairNotAllowed", { reason: uiMessage("repair.eligibility.report-expired") }), "Repair unavailable for this report: The current report has expired");
  assert.equal(t("runtime.repairNotAllowed", { reason: "custom-runtime-reason" }), "Repair unavailable for this report: custom-runtime-reason");
  assert.equal(createTranslator("zh-CN")("brief.itemCount", { count: 1 }), "1 项");
  // A missing parameter stays visible instead of silently disappearing.
  assert.equal(t("terminal.capacity", { count: 1 }), "1 / {limit} · batched rendering");
});

test("missing keys and unsupported locales fall back safely", () => {
  assert.equal(translate("en-US", "no.such.key"), "no.such.key");
  assert.equal(createTranslator("fr-FR").locale, "zh-CN");
  assert.equal(createTranslator("fr-FR")("actions.diagnose"), "只读诊断");
});

test("language preferences resolve with the documented policy", () => {
  assert.equal(normalizeLanguagePreference("en-US"), "en-US");
  assert.equal(normalizeLanguagePreference("system"), "system");
  assert.equal(normalizeLanguagePreference("fr-FR"), "zh-CN");
  assert.equal(normalizeLanguagePreference(undefined), "zh-CN");
  assert.equal(normalizeLanguagePreference({ toString: () => "en-US" }), "zh-CN");
  assert.equal(resolveLocale("en-US", ["zh-CN"]), "en-US");
  assert.equal(resolveLocale("zh-CN", ["en-US"]), "zh-CN");
  assert.equal(resolveLocale("system", ["zh-TW"]), "zh-CN");
  assert.equal(resolveLocale("system", ["zh-Hans-CN"]), "zh-CN");
  assert.equal(resolveLocale("system", ["en-GB"]), "en-US");
  assert.equal(resolveLocale("system", ["es-ES", "zh-CN"]), "en-US");
  assert.equal(resolveLocale("system", []), "en-US");
  assert.equal(resolveLocale("garbage", ["en-US"]), "zh-CN");
  assert.equal(matchSupportedLocale("EN_us"), "en-US");
  assert.equal(matchSupportedLocale(""), null);
});

test("English repair wording keeps diagnosis, authorization, repair, and verification distinct", () => {
  const t = createTranslator("en-US");
  const terms = {
    diagnosis: t("actions.diagnose"),
    preflightGate: t("report.gate.runtimeTitle"),
    authorize: t("actions.authorizeRepair"),
    confirm: t("report.confirmRepair"),
    backup: t("actions.backupWithRepair"),
    rollback: t("actions.rollbackUnavailable"),
    verifying: t("stages.state.verifying"),
    unavailable: t("report.repairUnavailable"),
    failed: t("repair.error.generic"),
    completed: t("plugin.evidence.repairVerified"),
  };
  assert.equal(new Set(Object.values(terms)).size, Object.keys(terms).length);
  assert.match(terms.diagnosis, /^Read-only diagnosis$/);
  assert.match(t("runtime.diagnosisStarted"), /No plugin changes are written/);
  assert.match(terms.authorize, /^Authorize repair$/);
  assert.match(terms.confirm, /controlled repair/);
  assert.match(terms.backup, /Backup/);
  assert.match(terms.rollback, /Rollback/);
  assert.match(terms.unavailable, /Repair unavailable/);
  assert.match(terms.failed, /Repair failed to complete/);
  assert.match(terms.completed, /final static verification passed/);

  // Only messages that are shown after the runtime reported final
  // verification may claim the repair completed or succeeded.
  const verifiedOnly = new Set(["plugin.evidence.repairVerified", "plugin.state.staticVerificationPassed", "result.finalVerificationPassed", "result.outcomeVerified", "runtime.repairReturnedVerified"]);
  const claims = Object.entries(en).filter(([, value]) => /repair (?:completed|succeeded|successful)|successfully repaired|verification passed/i.test(value)).map(([key]) => key);
  assert.deepEqual(claims.filter((key) => !verifiedOnly.has(key)), []);
  assert.doesNotMatch(t("result.heading"), /success|completed/i);
  assert.match(t("result.outcomeUnverified"), /success is not assumed/);
  assert.match(t("stages.detail.repairStepsCompleted"), /steps finished/);
});
