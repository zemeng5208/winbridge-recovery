const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createRuntimeBridgeMock() {
  const engineListeners = new Set();
  const logListeners = new Set();
  const calls = [];
  let eventCounter = 0;
  let operationCounter = 0;
  let activeOperation = null;
  let currentReport = null;
  let nativeSettings = {
    schemaVersion: 1,
    theme: "system",
    reduceMotion: false,
    progressColors: ["#4A6CF7", "#8B5CF6", "#22C7A9"],
    diagnosticConcurrency: 2,
    logBatchSize: 64,
    logMemoryLimitBytes: 1048576,
    autoCloseAfterRepair: false,
    autoCloseAfterRepairExplicit: false,
    social: {
      enabled: true,
      accounts: { tibo: true, openai: true, chatgpt: true },
      maxPosts: 4,
      hours: 48,
      useJinaFallback: false,
      locale: "zh",
    },
  };
  const nextOperationId = (kind) => `mock-${kind}-${String(++operationCounter).padStart(8, "0")}`;
  const createReport = (operationId) => ({
    schemaVersion: 1,
    reportId: `mock-report-${operationId.slice(-8)}`,
    createdAt: new Date().toISOString(),
    engineSnapshot: { version: "3.1.1", sourceCommit: "mock-contract", manifestSha256: null },
    issues: [{
      category: "browser-chrome-availability",
      evidence: ["Mock bridge returned a read-only diagnostic report."],
      impact: "Integration test only; no machine state was read or written.",
      plannedActions: ["Backup", "Controlled repair", "Verification"],
      risk: "low",
      writeScope: ["mock-isolated-scope"],
      knownIssue: null,
      canSkip: true,
      requiresRestart: false,
      confidence: 0.96,
      suggestionMode: "suggest-repair",
    }],
    summary: { issueCount: 1, exitCode: 0, engineReportValidated: true, repairSuggestedCount: 1 },
    rawReportPath: null,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  const emitEngine = (event) => engineListeners.forEach((listener) => listener({
    schemaVersion: 1,
    eventId: `mock-event-${String(++eventCounter).padStart(8, "0")}`,
    operationId: event.operationId,
    timestamp: new Date().toISOString(),
    kind: "Progress",
    actualProgress: 0,
    displayedProgress: 0,
    engineStageState: "Diagnosing",
    presentedStageState: "Diagnosing",
    message: "",
    finalVerificationPassed: false,
    priority: "normal",
    details: null,
    ...event,
  }));
  const emitLogs = (entries) => logListeners.forEach((listener) => listener({ schemaVersion: 1, entries, droppedBeforeBatch: 0 }));
  const bridge = {
    calls,
    async getAppInfo() {
      calls.push(["getAppInfo"]);
      return { name: "WinBridge Recovery", version: "4.0.0-mock", electron: "mock", chromium: "mock", node: "mock", packaged: true, runtimeMode: true, realRepairEnabled: true, resultPagePersistsByDefault: true };
    },
    async getSettings() { calls.push(["getSettings"]); return structuredClone(nativeSettings); },
    async saveSettings(payload) { calls.push(["saveSettings", payload]); nativeSettings = structuredClone(payload); return structuredClone(nativeSettings); },
    async getSystemProfile() {
      calls.push(["getSystemProfile"]);
      return { schemaVersion: 1, detectedAt: new Date().toISOString(), platform: "win32", release: "mock", architecture: "x64", cpuLogicalCount: 8, totalMemoryBytes: 8589934592, nodeRuntime: "mock", appPackage: null, appPackageError: "Mock runtime has no package.", cachePolicy: "first-detection-then-manual-refresh" };
    },
    async refreshSystemProfile() { calls.push(["refreshSystemProfile"]); return bridge.getSystemProfile(); },
    async runDiagnosis() {
      const operationId = nextOperationId("diagnosis");
      activeOperation = { kind: "diagnosis", operationId };
      calls.push(["runDiagnosis", operationId]);
      currentReport = null;
      emitEngine({ operationId, kind: "Progress", actualProgress: 18, displayedProgress: 18, engineStageState: "Diagnosing", presentedStageState: "Diagnosing", message: "只读诊断开始。" });
      emitLogs([{ timestamp: new Date().toISOString(), level: "info", category: "Mock", message: "只读诊断开始。", operationId }]);
      await wait(80);
      if (activeOperation?.operationId !== operationId) throw new Error("Mock diagnosis was cancelled.");
      currentReport = createReport(operationId);
      emitEngine({ operationId, kind: "Stage", actualProgress: 64, displayedProgress: 64, engineStageState: "ReportReady", presentedStageState: "ReportReady", message: "诊断报告已准备。" });
      const report = currentReport;
      setTimeout(() => {
        if (activeOperation?.operationId !== operationId) return;
        emitEngine({ operationId, kind: "ResultReady", actualProgress: 100, displayedProgress: 100, engineStageState: "ReportReady", presentedStageState: "ReportReady", message: "只读诊断报告已通过终态核验。", finalVerificationPassed: true, priority: "terminal", details: { reportId: report.reportId } });
        emitLogs([{ timestamp: new Date().toISOString(), level: "info", category: "Mock", message: "诊断 ResultReady 已发送；报告可供用户决策。", operationId }]);
        if (activeOperation?.operationId === operationId) activeOperation = null;
      }, 0);
      return report;
    },
    async getDiagnosisReport() { calls.push(["getDiagnosisReport"]); return currentReport; },
    async startRepair(reportId) {
      if (!currentReport || currentReport.reportId !== reportId) throw new Error("Mock current report is unavailable.");
      const operationId = nextOperationId("repair");
      activeOperation = { kind: "repair", operationId };
      calls.push(["startRepair", reportId, operationId]);
      currentReport = null;
      emitEngine({ operationId, kind: "Progress", actualProgress: 72, displayedProgress: 72, engineStageState: "Repairing", presentedStageState: "Repairing", message: "受控修复开始。" });
      emitLogs([{ timestamp: new Date().toISOString(), level: "warn", category: "Mock", message: "受控修复链开始；仅模拟。", operationId }]);
      await wait(80);
      if (activeOperation?.operationId !== operationId) throw new Error("Mock repair was cancelled.");
      emitEngine({ operationId, kind: "ResultReady", actualProgress: 100, displayedProgress: 100, engineStageState: "ResultReady", presentedStageState: "ResultReady", message: "最终核验通过。", finalVerificationPassed: true, priority: "terminal", details: { reportId } });
      emitLogs([{ timestamp: new Date().toISOString(), level: "info", category: "Mock", message: "修复 ResultReady 已发送；最终核验通过。", operationId }]);
      activeOperation = null;
      return { operationId, reportId, finalVerificationPassed: true };
    },
    async cancelOperation() {
      calls.push(["cancelOperation"]);
      if (!activeOperation) return { cancelled: false };
      const { operationId, kind } = activeOperation;
      activeOperation = null;
      emitEngine({ operationId, kind: "Cancelled", actualProgress: 0, displayedProgress: 0, engineStageState: kind === "repair" ? "Repairing" : "Diagnosing", presentedStageState: kind === "repair" ? "Repairing" : "Diagnosing", message: "模拟操作已取消。", priority: "terminal" });
      emitLogs([{ timestamp: new Date().toISOString(), level: "warn", category: "Mock", message: "模拟操作已取消。", operationId }]);
      return { cancelled: true };
    },
    async openLogs() { calls.push(["openLogs"]); return { opened: true }; },
    async openGPT() { calls.push(["openGPT"]); return { opened: true, packageName: "OpenAI.Codex", version: "mock" }; },
    async getPluginAssets() {
      calls.push(["getPluginAssets"]);
      return { readOnly: true, items: ["browser", "chrome", "computer-use"].map((id) => ({ id, available: false })) };
    },
    async getSocialFeed(options) {
      calls.push(["getSocialFeed", options]);
      const now = Date.now();
      const posts = [
        { postId: "mock-social-tibo-1", account: "tibo", displayName: "Tibo", handle: "@tibo", createdAt: new Date(now - 42 * 60 * 1000).toISOString(), text: "Building tools that keep recovery decisions visible and reversible.", avatarDataUrl: null },
        { postId: "mock-social-openai-1", account: "openai", displayName: "OpenAI", handle: "@OpenAI", createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), text: "A short product update for the local mock feed. No remote content was loaded.", avatarDataUrl: null },
        { postId: "mock-social-chatgpt-1", account: "chatgpt", displayName: "ChatGPT", handle: "@ChatGPTapp", createdAt: new Date(now - 19 * 60 * 60 * 1000).toISOString(), text: "This post is generated locally to exercise the read-only social feed UI.", avatarDataUrl: null },
      ];
      const enabled = new Set(Array.isArray(options?.accounts) ? options.accounts : []);
      return { available: true, reason: null, degraded: false, cacheAgeSeconds: 0, posts: posts.filter((post) => enabled.has(post.account)).slice(0, Math.max(1, Math.min(10, Number(options?.maxPosts) || 4))) };
    },
    async translateSocialPost(request) {
      calls.push(["translateSocialPost", request]);
      const keys = request && typeof request === "object" ? Object.keys(request).sort() : [];
      if (keys.join("|") !== "postId|targetLocale") throw new Error("Mock translateSocialPost requires only postId and targetLocale.");
      if (typeof request.postId !== "string" || !request.postId) throw new Error("Mock translateSocialPost requires postId.");
      if (!["zh", "en", "fr", "es", "ru", "ar"].includes(request.targetLocale)) throw new Error("Mock translateSocialPost targetLocale is invalid.");
      return { available: true, postId: request.postId, targetLocale: request.targetLocale, text: `[${request.targetLocale}] 本地模拟翻译内容` };
    },
    async openSocialPost(request) { calls.push(["openSocialPost", request]); return { opened: true }; },
    onEngineEvent(listener) { engineListeners.add(listener); return () => engineListeners.delete(listener); },
    onLogBatch(listener) { logListeners.add(listener); return () => logListeners.delete(listener); },
  };
  return bridge;
}
