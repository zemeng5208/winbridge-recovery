const API_METHODS = Object.freeze([
  "getAppInfo",
  "getSettings",
  "saveSettings",
  "getSystemProfile",
  "refreshSystemProfile",
  "runDiagnosis",
  "getDiagnosisReport",
  "startRepair",
  "cancelOperation",
  "openLogs",
  "openGPT",
  "getPluginAssets",
  "getSocialFeed",
  "translateSocialPost",
  "openSocialPost",
  "onEngineEvent",
  "onLogBatch",
]);

const requireMethod = (bridge, name) => {
  if (!API_METHODS.includes(name) || typeof bridge?.[name] !== "function") {
    throw new Error(`Runtime API unavailable: ${name}`);
  }
  return bridge[name].bind(bridge);
};

const disposeSubscription = (subscription) => {
  if (typeof subscription === "function") subscription();
};

const validReportId = (value) => typeof value === "string" && value.length >= 16 && value.length <= 128;

const reportHasRepairSuggestion = (report) => Array.isArray(report?.issues)
  && report.issues.some((issue) => issue?.suggestionMode === "suggest-repair");

const reportMatchesContract = (report) => report?.schemaVersion === 1
  && validReportId(report?.reportId)
  && report?.summary?.engineReportValidated === true
  && Array.isArray(report?.issues);

const reportIsFresh = (report, now = Date.now()) => {
  const expiresAt = Date.parse(report?.expiresAt ?? "");
  return Number.isFinite(expiresAt) && expiresAt > now;
};

export function createRuntimeController(bridge) {
  if (!bridge) return null;

  let appInfo = null;
  let currentWorkerReport = null;
  const capabilities = Object.freeze(Object.fromEntries(API_METHODS.map((name) => [name, typeof bridge[name] === "function"])));

  const repairEligibility = (reportId = currentWorkerReport?.reportId) => {
    if (!capabilities.startRepair) return { allowed: false, reason: "start-repair-unavailable" };
    if (!capabilities.onEngineEvent) return { allowed: false, reason: "engine-events-unavailable" };
    if (appInfo?.realRepairEnabled !== true) return { allowed: false, reason: "real-repair-disabled" };
    if (!currentWorkerReport) return { allowed: false, reason: "no-current-worker-report" };
    if (!reportMatchesContract(currentWorkerReport)) return { allowed: false, reason: "invalid-report-contract" };
    if (reportId !== currentWorkerReport.reportId) return { allowed: false, reason: "report-id-mismatch" };
    if (!reportIsFresh(currentWorkerReport)) return { allowed: false, reason: "report-expired" };
    if (!reportHasRepairSuggestion(currentWorkerReport)) return { allowed: false, reason: "report-only" };
    return { allowed: true, reason: "eligible" };
  };

  return Object.freeze({
    capabilities,
    get realRepairEnabled() {
      return appInfo?.realRepairEnabled === true;
    },
    getRepairEligibility: (reportId) => repairEligibility(reportId),
    async getAppInfo() {
      appInfo = null;
      appInfo = await requireMethod(bridge, "getAppInfo")();
      return appInfo;
    },
    getSettings: () => requireMethod(bridge, "getSettings")(),
    saveSettings: (settings) => requireMethod(bridge, "saveSettings")(settings),
    getSystemProfile: () => requireMethod(bridge, "getSystemProfile")(),
    refreshSystemProfile: () => requireMethod(bridge, "refreshSystemProfile")(),
    async runDiagnosis() {
      currentWorkerReport = null;
      const report = await requireMethod(bridge, "runDiagnosis")();
      currentWorkerReport = report ?? null;
      return report;
    },
    async getDiagnosisReport() {
      currentWorkerReport = null;
      const report = await requireMethod(bridge, "getDiagnosisReport")();
      currentWorkerReport = report ?? null;
      return report;
    },
    startRepair(reportId) {
      const eligibility = repairEligibility(reportId);
      if (!eligibility.allowed) throw new Error(`Runtime repair unavailable: ${eligibility.reason}`);
      currentWorkerReport = null;
      return requireMethod(bridge, "startRepair")(reportId);
    },
    cancelOperation: () => requireMethod(bridge, "cancelOperation")(),
    openLogs: () => requireMethod(bridge, "openLogs")(),
    openGPT: () => requireMethod(bridge, "openGPT")(),
    getPluginAssets: () => requireMethod(bridge, "getPluginAssets")(),
    getSocialFeed: (options) => requireMethod(bridge, "getSocialFeed")(options),
    translateSocialPost: (request) => requireMethod(bridge, "translateSocialPost")(request),
    openSocialPost: (request) => requireMethod(bridge, "openSocialPost")(request),
    subscribe({ onEngineEvent, onLogBatch }) {
      const engineSubscription = capabilities.onEngineEvent ? bridge.onEngineEvent(onEngineEvent) : null;
      const logSubscription = capabilities.onLogBatch ? bridge.onLogBatch(onLogBatch) : null;
      return () => {
        disposeSubscription(engineSubscription);
        disposeSubscription(logSubscription);
      };
    },
  });
}
