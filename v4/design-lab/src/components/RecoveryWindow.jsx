import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorPresets, diagnosticStages, logSeed, pluginStates, recoveryStates, schemes } from "../data/concepts.js";
import NebulaFluidProgress from "./NebulaFluidProgress.jsx";
import { Icon } from "./Icons.jsx";
import { applyColorPreset } from "./MixPanel.jsx";
import SettingsCenter from "./SettingsCenter.jsx";
import StageProgressOrbit from "./StageProgressOrbit.jsx";
import OfficialPluginIcon from "./OfficialPluginIcon.jsx";
import { MenuGlyph } from "./BrandIcon.jsx";
import { createRuntimeController } from "../lib/runtimeController.js";
import GameCenter from "./games/GameCenter.jsx";
import winbridgeMark from "../assets/WinBridge.png";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { formatMessage, uiMessage } from "../i18n/index.js";

const activeStageByFlow = {
  Diagnosing: 0,
  ReportReady: 2,
  AwaitingDecision: 3,
  Repairing: 3,
  ResultReady: 4,
};

function StageRail({ flowState, progress, reduceMotion, desktopStarted }) {
  const t = useI18n();
  const engineIndex = flowState === "ResultReady" ? 5 : desktopStarted ? 4 : (activeStageByFlow[flowState] ?? -1);
  const [presentedIndex, setPresentedIndex] = useState(engineIndex);
  const [transitionPhase, setTransitionPhase] = useState("steady");
  const queueTimerRef = useRef(0);
  const queueRunningRef = useRef(false);
  const presentedRef = useRef(engineIndex);
  const engineRef = useRef(engineIndex);

  useEffect(() => {
    engineRef.current = engineIndex;
    if (engineIndex < presentedRef.current) {
      window.clearTimeout(queueTimerRef.current);
      queueRunningRef.current = false;
      presentedRef.current = engineIndex;
      setPresentedIndex(engineIndex);
      setTransitionPhase("steady");
      return undefined;
    }
    const advance = () => {
      if (presentedRef.current >= engineRef.current) {
        queueRunningRef.current = false;
        setTransitionPhase("steady");
        return;
      }
      queueRunningRef.current = true;
      const gap = engineRef.current - presentedRef.current;
      const completeMs = reduceMotion ? 80 : gap > 2 ? 160 : 300;
      const activateMs = reduceMotion ? 80 : gap > 2 ? 170 : 280;
      setTransitionPhase("completing");
      queueTimerRef.current = window.setTimeout(() => {
        presentedRef.current += 1;
        setPresentedIndex(presentedRef.current);
        setTransitionPhase("activating");
        queueTimerRef.current = window.setTimeout(advance, activateMs);
      }, completeMs);
    };
    if (!queueRunningRef.current) advance();
    return undefined;
  }, [engineIndex, reduceMotion]);

  useEffect(() => () => window.clearTimeout(queueTimerRef.current), []);
  return (
    <aside className="stage-rail" aria-label={t("stages.ariaLabel")}>
      <div className="rail-heading"><span>{t("stages.heading")}</span><small>ENGINE {engineIndex < 0 ? "WAIT" : engineIndex} · PRESENTED {presentedIndex < 0 ? "WAIT" : presentedIndex}</small></div>
      <ol>
        {diagnosticStages.map((stage, index) => {
          let state = index < presentedIndex ? "done" : index === presentedIndex && presentedIndex < 5 ? "active" : "waiting";
          if (index === presentedIndex && transitionPhase === "completing") state = "completing";
          if (index === presentedIndex && transitionPhase === "activating") state = "activating";
          const localProgress = state === "done" ? 1 : state === "active" ? Math.max(0.16, Math.min(0.98, (progress % 20) / 20 + 0.16)) : 0;
          const stageDetail = stage.id === 4
            ? flowState === "Repairing" ? t("stages.detail.repairing") : flowState === "ResultReady" || desktopStarted ? t("stages.detail.repairStepsCompleted") : t("stages.4.detail")
            : stage.id === 5 && desktopStarted && flowState !== "ResultReady" ? t("stages.detail.desktopVerifying") : t(`stages.${stage.id}.detail`);
          const stateLabel = stage.id === 4 && state === "active" && flowState === "AwaitingDecision"
            ? t("stages.state.awaitingDecision")
            : stage.id === 4 && state === "active" && flowState === "Repairing"
              ? t("stages.state.repairing")
              : stage.id === 5 && state === "active" && desktopStarted
                ? t("stages.state.verifying")
                : t(`stages.state.${state === "done" ? "done" : state === "completing" ? "completing" : state === "activating" ? "activating" : state === "active" ? "active" : "waiting"}`);
          return (
            <li key={stage.id} className={`stage-${state}`} data-interaction="status-driven" title={t("stages.itemTitle")}>
              <StageProgressOrbit index={stage.id} state={state === "completing" ? "active" : state === "activating" ? "active" : state} progress={state === "completing" ? 1 : state === "activating" ? 0.35 : localProgress} reduceMotion={reduceMotion} />
              <div><strong>{t(`stages.${stage.id}.title`)}</strong><small>{stateLabel} · {stageDetail}</small></div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

const LOG_TOKEN_PATTERN = /(%[A-Z0-9_]+%(?:\\[^\s；，。]+)*|[A-Za-z]:\\[^\s；，。]+|\b[a-fA-F0-9]{12,64}\b|\bv?\d+(?:\.\d+){1,3}\b|--[a-zA-Z0-9-]+|\b(?:git|npm|node|powershell|cmd|SHA256|EPERM|ENOENT)\b)/g;

function logTokenKind(token) {
  if (/^(?:%[A-Z0-9_]+%|[A-Za-z]:\\)/.test(token)) return "path";
  if (/^[a-fA-F0-9]{12,64}$/.test(token)) return "hash";
  if (/^v?\d+(?:\.\d+){1,3}$/.test(token)) return "version";
  return "command";
}

function renderLogMessage(message) {
  return String(message ?? "").split(LOG_TOKEN_PATTERN).filter(Boolean).map((token, index) => {
    const kind = logTokenKind(token);
    const structured = kind !== "command" || /^(?:--|git$|npm$|node$|powershell$|cmd$|SHA256$|EPERM$|ENOENT$)/i.test(token);
    return structured
      ? <span className={`log-token token-${kind}`} key={`${index}-${token}`}>{token}</span>
      : <span key={`${index}-${token}`}>{token}</span>;
  });
}

function TerminalPanel({ logs, limit }) {
  const t = useI18n();
  const [filter, setFilter] = useState("all");
  const [followPaused, setFollowPaused] = useState(false);
  const categories = useMemo(() => ["all", ...new Set(logs.map((line) => line.category))], [logs]);
  const visibleLogs = useMemo(() => filter === "all" ? logs : logs.filter((line) => line.category === filter), [filter, logs]);
  const categoryLabels = useMemo(() => new Map(logs.filter((line) => line.categoryKey).map((line) => [line.category, t(line.categoryKey)])), [logs, t]);
  return (
    <section className="terminal-panel" aria-label={t("terminal.ariaLabel")}>
      <header>
        <div><span className="terminal-lamp" /><strong>{t("terminal.title")}</strong><small>{t("terminal.subtitle")}</small></div>
        <div className="terminal-tools">
          <span className="log-cap">{t("terminal.capacity", { count: logs.length, limit })}</span>
          <select aria-label={t("terminal.filterLabel")} value={filter} onChange={(event) => setFilter(event.target.value)}>
            {categories.map((category) => <option key={category} value={category}>{category === "all" ? t("terminal.allCategories") : categoryLabels.get(category) ?? category}</option>)}
          </select>
          <button type="button" aria-pressed={followPaused} onClick={() => setFollowPaused((value) => !value)}>{followPaused ? t("terminal.resumeFollow") : t("terminal.pauseFollow")}</button>
        </div>
      </header>
      <div className="terminal-log-area">
        <div className="terminal-columns" aria-hidden="true"><span>{t("terminal.column.time")}</span><span>{t("terminal.column.level")}</span><span>{t("terminal.column.component")}</span><span>{t("terminal.column.evidence")}</span><span>{t("terminal.column.result")}</span></div>
        <div className="terminal-scroll" aria-live="polite">
          {visibleLogs.map((line, index) => {
            const message = line.messageKey ? t(line.messageKey, line.params) : line.message;
            return (
            <div className={`log-line log-${line.type.toLowerCase()}`} key={`${line.time}-${index}`}>
              <time>{line.time}</time>
              <span className="log-type">{line.type}</span>
              <span className="log-category">{line.categoryKey ? t(line.categoryKey) : line.category}</span>
              <p className="log-message" title={message}>{renderLogMessage(message)}{Array.isArray(line.details) ? line.details.map((detail, detailIndex) => <span className={`log-detail token-${detail.kind}`} key={`${detail.kind}-${detailIndex}`}>{detail.value}</span>) : null}</p>
              <span className={`log-result ${line.result ? "has-result" : "is-empty"}`}>{line.result || "—"}</span>
            </div>
            );
          })}
        </div>
      </div>
      <footer><span>{t("terminal.footer.category")}</span><span>{t("terminal.footer.evidence")}</span><span>{t("terminal.footer.github")}</span><span>{t("terminal.footer.risk")}</span><span>{t("terminal.footer.stage")}</span><b>{t("terminal.footer.fullLog")}</b></footer>
    </section>
  );
}

function issueSummary(report) {
  const issues = Array.isArray(report?.issues) ? report.issues : report?.code ? [{
    category: report.code,
    evidence: Array.isArray(report.evidence) ? report.evidence : [report.evidence].filter(Boolean),
    impact: report.impact,
    plannedActions: Array.isArray(report.plannedActions) ? report.plannedActions : [report.proposedAction].filter(Boolean),
    risk: report.risk ?? "unknown",
    writeScope: Array.isArray(report.writeScope) ? report.writeScope : [report.writeScope].filter(Boolean),
    suggestionMode: report.recommendation === "repair" ? "suggest-repair" : "report-only",
  }] : [];
  const repairable = issues.filter((issue) => issue.suggestionMode === "suggest-repair");
  const first = issues[0] ?? null;
  const writeScopeCount = new Set(repairable.flatMap((issue) => issue.writeScope ?? [])).size;
  const riskOrder = ["unknown", "low", "medium", "high", "critical"];
  const highestRisk = issues.reduce((current, issue) => riskOrder.indexOf(issue.risk) > riskOrder.indexOf(current) ? issue.risk : current, "unknown");
  return { issues, repairable, first, writeScopeCount, highestRisk };
}

function normalizeRuntimeEvent(event = {}) {
  const kind = event.kind;
  const presentedState = ["Diagnosing", "ReportReady", "AwaitingDecision", "Repairing", "ResultReady"].includes(event.presentedStageState)
    ? event.presentedStageState
    : null;
  return {
    kind,
    flowState: kind === "ResultReady" ? "ResultReady" : presentedState,
    actualProgress: Number.isFinite(Number(event.actualProgress)) ? Number(event.actualProgress) : null,
    displayedProgress: Number.isFinite(Number(event.displayedProgress)) ? Number(event.displayedProgress) : null,
    verified: event.finalVerificationPassed === true,
    failed: kind === "Failed",
    cancelled: kind === "Cancelled",
    message: String(event.message ?? ""),
  };
}

// 24-hour HH:MM:SS, identical in every interface language.
const clockTime = (date) => [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, "0")).join(":");

// Engine and Worker output stays verbatim (untranslated). Messages produced by
// this interface are uiMessage descriptors, rendered in the current language.
function runtimeLog(entry) {
  const type = String(entry?.level ?? entry?.type ?? "info").toUpperCase();
  const date = new Date(entry?.timestamp ?? entry?.time ?? Date.now());
  const text = entry?.message ?? entry?.text ?? entry?.detail ?? "";
  const localized = text && typeof text === "object" && typeof text.key === "string" ? text : null;
  return {
    time: Number.isNaN(date.getTime()) ? "--:--:--" : clockTime(date),
    type,
    category: String(entry?.category ?? entry?.component ?? entry?.scope ?? "runtime"),
    message: localized ? "" : String(text),
    ...(localized ? { messageKey: localized.key, params: localized.params } : {}),
    result: String(entry?.result ?? entry?.outcome ?? ""),
    details: [
      ["path", entry?.path],
      ["hash", entry?.hash ?? entry?.sha256],
      ["command", entry?.command],
      ["version", entry?.version],
    ].filter(([, value]) => typeof value === "string" && value.length > 0).map(([kind, value]) => ({ kind, value })),
  };
}

// Plugin card state and risk are catalog keys; evidence is either a uiMessage
// or verbatim engine text. Nothing translated is stored, so switching the
// interface language re-renders every card in the new language.
const pluginEvidence = (key, id) => uiMessage(key, { plugin: id === "computer-use" ? "Computer Use" : id[0].toUpperCase() + id.slice(1) });

const runtimePluginDefaults = Object.freeze({
  browser: { state: "plugin.state.awaitingDiagnosis", risk: "plugin.risk.pending", tone: "neutral", evidence: pluginEvidence("plugin.evidence.awaitingRound", "browser"), layers: {
    static: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingStatic") },
    connection: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingConnection") },
    interaction: { state: "plugin.layer.interactionUnverified", evidence: uiMessage("plugin.evidence.noInteraction") },
  } },
  chrome: { state: "plugin.state.awaitingDiagnosis", risk: "plugin.risk.pending", tone: "neutral", evidence: pluginEvidence("plugin.evidence.awaitingRound", "chrome"), layers: {
    static: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingStatic") },
    connection: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingConnection") },
    interaction: { state: "plugin.layer.interactionUnverified", evidence: uiMessage("plugin.evidence.noInteraction") },
  } },
  "computer-use": { state: "plugin.state.awaitingDiagnosis", risk: "plugin.risk.pending", tone: "neutral", evidence: pluginEvidence("plugin.evidence.awaitingRound", "computer-use"), layers: {
    static: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingStatic") },
    connection: { state: "plugin.layer.unverified", evidence: uiMessage("plugin.evidence.awaitingHelper") },
    interaction: { state: "plugin.layer.interactionUnverified", evidence: uiMessage("plugin.evidence.clientImportNotInteraction") },
  } },
});

export function freshRuntimePluginStates(state = "plugin.state.awaitingDiagnosis", evidenceKey = "plugin.evidence.awaitingRound") {
  return Object.fromEntries(Object.entries(runtimePluginDefaults).map(([id, value]) => [id, {
    ...value,
    layers: Object.fromEntries(Object.entries(value.layers).map(([layer, layerValue]) => [layer, { ...layerValue }])),
    state,
    evidence: pluginEvidence(evidenceKey, id),
  }]));
}

export function updatePluginStatesFromLogs(current, entries, phase) {
  const next = { ...current };
  for (const entry of entries) {
    const message = String(entry?.message ?? entry?.text ?? entry?.detail ?? "");
    const category = String(entry?.category ?? entry?.component ?? entry?.scope ?? "");
    const searchable = `${category} ${message}`;
    const ids = [];
    if (/\bbrowser\b/i.test(searchable)) ids.push("browser");
    if (/\bchrome\b/i.test(searchable)) ids.push("chrome");
    if (/computer[- ]use|\bcua\b/i.test(searchable)) ids.push("computer-use");
    if (!ids.length) continue;
    const failed = /\b(?:error|failed|missing|unavailable|invalid|stale|drift|mismatch|denied)\b/i.test(searchable);
    const warned = !failed && /\b(?:warn|warning|repair|restore|rebuild|refresh)\b/i.test(searchable);
    const passed = !failed && !warned && /\b(?:ok|pass|passed|healthy|ready|official|current|validated|verified)\b/i.test(searchable);
    const evidence = message.replace(/^\[[^\]]+\]\s*/g, "").slice(0, 110) || uiMessage("plugin.evidence.statusUpdate", { category });
    const layer = /native host|transport|connection|connected|registered|bridge|helper/i.test(searchable)
      ? "connection"
      : /manifest|marketplace|plugin|cache|hash|latest|runtime|file|version/i.test(searchable)
        ? "static"
        : null;
    for (const id of ids) {
      const currentState = next[id] ?? runtimePluginDefaults[id];
      const layerState = layer ? {
        ...(currentState.layers?.[layer] ?? {}),
        state: failed ? "plugin.state.issueFound" : warned ? "plugin.state.needsAttention" : passed ? "plugin.layer.verified" : "plugin.layer.checking",
        evidence,
      } : null;
      const layers = layer ? { ...currentState.layers, [layer]: layerState } : currentState.layers;
      next[id] = failed
        ? { ...currentState, state: phase === "repair" ? "plugin.state.repairInProgress" : "plugin.state.issueFound", risk: "plugin.risk.actionRequired", tone: "error", evidence, layers }
        : warned
          ? { ...currentState, state: phase === "repair" ? "plugin.state.repairInProgress" : "plugin.state.needsAttention", risk: "plugin.risk.medium", tone: "warn", evidence, layers }
          : passed
            ? { ...currentState, state: phase === "repair" ? "plugin.state.repairing" : "plugin.state.staticOk", risk: "plugin.risk.low", tone: "ok", evidence, layers }
            : { ...currentState, state: phase === "repair" ? "plugin.state.repairing" : "plugin.state.diagnosing", evidence, layers };
    }
  }
  return next;
}

export function finalizePluginStatesFromReport(current, report) {
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const broadIssue = issues.find((issue) => /marketplace|plugin-cache|runtime-node-repl/i.test(String(issue?.category ?? "")));
  return Object.fromEntries(Object.entries(current).map(([id, value]) => {
    const matcher = id === "computer-use" ? /computer[- ]use|\bcua\b/i : new RegExp(`\\b${id}\\b`, "i");
    const issue = issues.find((candidate) => matcher.test(JSON.stringify(candidate))) ?? broadIssue;
    if (issue) {
      const risk = String(issue.risk ?? "unknown");
      const layers = {
        ...value.layers,
        static: {
          ...(value.layers?.static ?? {}),
          state: issue.suggestionMode === "suggest-repair" ? "plugin.state.issueFound" : "plugin.state.needsAttention",
          evidence: reportEvidence(issue),
        },
      };
      return [id, {
        state: issue.suggestionMode === "suggest-repair" ? "plugin.state.repairSuggested" : "plugin.state.needsAttention",
        risk: risk === "high" || risk === "critical" ? "plugin.risk.high" : risk === "medium" ? "plugin.risk.medium" : "plugin.risk.toVerify",
        tone: risk === "high" || risk === "critical" ? "error" : "warn",
        evidence: reportEvidence(issue),
        layers,
      }];
    }
    if (value.tone !== "neutral") return [id, value];
    return [id, {
      state: "plugin.state.staticDiagnosisComplete",
      risk: "plugin.risk.low",
      tone: "ok",
      evidence: uiMessage("plugin.evidence.noIssueReported"),
      layers: {
        ...value.layers,
        static: { ...(value.layers?.static ?? {}), state: "plugin.layer.verified", evidence: uiMessage("plugin.evidence.noIssueReported") },
      },
    }];
  }));
}

function reportEvidence(issue) {
  const text = String(issue.evidence?.[0] ?? issue.impact ?? "").slice(0, 110);
  return text || uiMessage("plugin.evidence.reportHasIssue");
}

const REPAIR_ELIGIBILITY_REASONS = new Set(["start-repair-unavailable", "engine-events-unavailable", "real-repair-disabled", "no-current-worker-report", "invalid-report-contract", "report-id-mismatch", "report-expired", "report-only", "runtime-unavailable"]);

// Unknown reasons come from the runtime contract and are shown verbatim.
export function repairEligibilityMessage(reason) {
  return REPAIR_ELIGIBILITY_REASONS.has(reason) ? uiMessage(`repair.eligibility.${reason}`) : String(reason ?? "");
}

export function localizeRepairError(message) {
  const raw = String(message || "");
  if (/Worker request timed out:\s*repair\.start/i.test(raw)) {
    return uiMessage("repair.error.timeout");
  }
  if (/Runtime worker (?:is unavailable|exited)/i.test(raw)) {
    return uiMessage("repair.error.workerDisconnected");
  }
  if (/Runtime shutdown is in progress/i.test(raw)) {
    return uiMessage("repair.error.shuttingDown");
  }
  return uiMessage("repair.error.generic");
}

function DiagnosisBrief({ flowState, report, runtimeMode }) {
  const t = useI18n();
  const summary = issueSummary(report);
  const waitingForDiagnosis = runtimeMode && !report && !flowState;
  const reportTitle = summary.first
    ? t("brief.titleWithEvidence", { category: summary.first.category })
    : waitingForDiagnosis ? t("brief.titleReady") : runtimeMode ? t("brief.titleWaitingLocal") : t("brief.titleConcept");
  return (
    <section className="diagnosis-brief" aria-label={t("brief.ariaLabel")}>
      <header><div><span className="brief-kicker">{t("brief.kicker")}</span><strong>{reportTitle}</strong></div><b>{flowState || (waitingForDiagnosis ? t("brief.waitingToStart") : "")}</b></header>
      <div className="brief-facts">
        <article><span>{t("brief.found")}</span><strong>{report ? t("brief.itemCount", { count: summary.issues.length }) : runtimeMode ? (waitingForDiagnosis ? t("brief.notStarted") : t("brief.notDiagnosed")) : t("brief.conceptDrift")}</strong><p>{summary.first?.evidence?.[0] || (runtimeMode ? (waitingForDiagnosis ? t("brief.hintStart") : t("brief.hintRun")) : t("brief.conceptEvidence"))}</p></article>
        <article><span>{t("brief.impact")}</span><strong>{summary.first?.risk ? t("brief.riskLevel", { risk: summary.first.risk }) : t("brief.awaitingAssessment")}</strong><p>{summary.first?.impact || t("brief.impactDefault")}</p></article>
        <article><span>{t("brief.plannedActions")}</span><strong>{summary.repairable.length ? t("brief.repairSuggestedCount", { count: summary.repairable.length }) : t("brief.noAutomaticWrites")}</strong><p>{summary.first?.plannedActions?.join(" → ") || (waitingForDiagnosis ? t("brief.noWrites") : t("brief.reportFirst"))}</p></article>
      </div>
    </section>
  );
}

function DecisionSummary({ flowState, actualProgress, indeterminate, report, runtimeMode }) {
  const t = useI18n();
  const summary = issueSummary(report);
  const waitingForDiagnosis = runtimeMode && !report && !flowState;
  return (
    <aside className="decision-summary" aria-label={t("decision.ariaLabel")}>
      <header><span>{t("decision.title")}</span><b>{waitingForDiagnosis ? t("decision.badge.waitingToStart") : flowState === "AwaitingDecision" ? t("decision.badge.awaitingUser") : runtimeMode ? t("decision.badge.local") : t("decision.badge.readOnlyDemo")}</b></header>
      <dl>
        <div><dt>{t("decision.issues")}</dt><dd>{report ? t("brief.itemCount", { count: summary.issues.length }) : waitingForDiagnosis ? t("brief.notStarted") : t("decision.pendingDiagnosis")}</dd></div>
        <div><dt>{t("decision.highestRisk")}</dt><dd className="semantic-warn">{waitingForDiagnosis ? t("decision.pendingDiagnosis") : summary.highestRisk}</dd></div>
        <div><dt>{t("decision.writeScope")}</dt><dd>{t("decision.writeScopeCount", { count: summary.writeScopeCount })}</dd></div>
        <div><dt>{t("decision.trustedProgress")}</dt><dd>{actualProgress}%</dd></div>
      </dl>
      <p>{waitingForDiagnosis ? t("decision.note.waiting") : indeterminate ? t("decision.note.indeterminate") : summary.repairable.length ? t("decision.note.repairable") : t("decision.note.none")}</p>
    </aside>
  );
}

export function RepairReport({ onClose, report, runtimeMode, canRepair, canOpenGPT, onConfirmRepair, onOpenGPT }) {
  const t = useI18n();
  const summary = issueSummary(report);
  const listSeparator = t.locale === "zh-CN" ? "；" : "; ";
  const issueFields = summary.issues.flatMap((issue, index) => {
    const knownIssue = typeof issue?.knownIssue === "string"
      ? issue.knownIssue
      : issue?.knownIssue ? JSON.stringify(issue.knownIssue) : t("common.none");
    const confidence = Number.isFinite(issue?.confidence) ? `${Math.round(issue.confidence * 100)}%` : t("common.notProvided");
    const prefix = t("report.issueN", { index: index + 1 });
    const field = (name) => `${prefix} · ${t(`report.field.${name}`)}`;
    const yesNo = (value) => value === true ? t("common.yes") : t("common.no");
    return [
      [prefix, issue?.category ?? t("report.uncategorized")],
      [field("evidence"), issue?.evidence?.join(listSeparator) || t("common.notProvided")],
      [field("impact"), issue?.impact || t("common.notProvided")],
      [field("plannedActions"), issue?.plannedActions?.join(" → ") || t("report.noWriteActions")],
      [field("risk"), issue?.risk || "unknown"],
      [field("writeScope"), issue?.writeScope?.join(listSeparator) || t("common.none")],
      [field("gates"), t("report.gatesValue", { canSkip: yesNo(issue?.canSkip), requiresRestart: yesNo(issue?.requiresRestart), confidence })],
      [field("knownIssue"), knownIssue],
      [field("suggestion"), issue?.suggestionMode ?? t("common.none")],
    ];
  });
  const fields = report ? [
    [t("report.field.report"), report.reportId],
    ...issueFields,
    [t("report.field.expires"), report.expiresAt],
  ] : [
    [t("report.field.status"), runtimeMode ? t("report.status.noLocalReport") : t("report.status.concept")],
    [t("report.field.next"), t("report.nextStep")],
  ];
  return (
    <div className="inner-modal-backdrop">
      <section className="repair-report" role="dialog" aria-modal="true" aria-label={t("report.ariaLabel")}>
        <header><div><Icon name="shield" size={18}/><div><strong>{t("report.title")}</strong><span>{t("report.currentState", { state: runtimeMode && !canRepair ? t("report.readOnlyAudit") : "AwaitingDecision" })}</span></div></div><button type="button" aria-label={t("report.closeAria")} onClick={onClose}><Icon name="close" size={16}/></button></header>
        <div className="repair-report-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</div>
        <div className="report-freeze"><b>{runtimeMode ? t("report.gate.runtimeTitle") : t("report.gate.conceptTitle")}</b><span>{runtimeMode ? t("report.gate.runtimeBody") : t("report.gate.conceptBody")}</span></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>{t("report.back")}</button><button type="button" className="secondary-button" disabled={runtimeMode && !canOpenGPT} onClick={onOpenGPT}>{t("report.skipOpenGpt")}{runtimeMode && !canOpenGPT ? t("common.unavailableSuffix") : ""}</button>{runtimeMode ? <button type="button" className="primary-button" disabled={!canRepair} onClick={onConfirmRepair}>{canRepair ? t("report.confirmRepair") : t("report.repairUnavailable")}</button> : null}</footer>
      </section>
    </div>
  );
}

function PluginPanel({ pluginColors = ["#4de0a2", "#ffc05b", "#58b7ff"], visibility = {}, runtimeMode = false, runtimePluginStates = runtimePluginDefaults }) {
  const t = useI18n();
  return (
    <aside className="plugin-panel" aria-label={t("plugin.panel.ariaLabel")}>
      <header><span>{t("plugin.panel.title")}</span><small>{t("plugin.panel.subtitle")}</small></header>
      <div className="plugin-list">
        {pluginStates.map((plugin, index) => {
          const liveState = runtimeMode ? (runtimePluginStates[plugin.id] ?? runtimePluginDefaults[plugin.id]) : plugin;
          const layers = liveState.layers ?? runtimePluginDefaults[plugin.id].layers;
          return (
          <article key={plugin.id} className={`plugin-card tone-${liveState.tone} ${visibility[plugin.id] === false ? "is-summary-only" : ""}`} style={{ "--plugin-identity": pluginColors[index] ?? ["#4de0a2", "#ffc05b", "#58b7ff"][index] }}>
            <div className="plugin-icon"><OfficialPluginIcon pluginId={plugin.id} color={pluginColors[index] ?? ["#4de0a2", "#ffc05b", "#58b7ff"][index]} /></div>
            <div className="plugin-copy"><strong>{plugin.name}</strong><span>{t(liveState.state)}</span><small>{runtimeMode ? formatMessage(t, liveState.evidence) : t(liveState.evidence)}</small></div>
            <div className="plugin-risk"><span>{t("plugin.panel.risk")}</span><b>{t(liveState.risk)}</b></div>
            <div className="plugin-layers" aria-label={t("plugin.panel.layersAria", { plugin: plugin.name })}>
              <span><b>{t("plugin.layerName.static")}</b>{t(layers.static?.state || "plugin.layer.unverified")}</span>
              <span><b>{t("plugin.layerName.connection")}</b>{t(layers.connection?.state || "plugin.layer.unverified")}</span>
              <span><b>{t("plugin.layerName.interaction")}</b>{t(layers.interaction?.state || "plugin.layer.interactionUnverified")}</span>
            </div>
          </article>
        )})}
      </div>
      <div className="plugin-evidence-note"><Icon name="shield" size={15} /><span>{t("plugin.panel.note")}</span></div>
    </aside>
  );
}

const SOCIAL_ACCOUNTS = Object.freeze({
  tibo: { displayName: "Tibo", handle: "@thsottiaux" },
  openai: { displayName: "OpenAI", handle: "@OpenAI" },
  chatgpt: { displayName: "ChatGPT", handle: "@ChatGPT" },
});

const SOCIAL_SOURCES = new Set(["x-profile", "xxu-rss", "rsshub", "jina", "mock", "concept"]);

const SOCIAL_AVATAR_CACHE_KEY = "winbridge.social-avatar-cache.v1";
const SOCIAL_LOCAL_AVATARS = Object.freeze({
  tibo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzE5YzdhNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzEyN2ZiZSIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjMyIiBmaWxsPSJ1cmwoI2cpIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIyNSIgcj0iMTEiIGZpbGw9IiNmNGZiZmYiLz48cGF0aCBkPSJNMTMgNTZjMi0xMiAxMC0xOCAxOS0xOHMxNyA2IDE5IDE4IiBmaWxsPSIjZjRmYmZmIi8+PC9zdmc+",
  openai: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iI2YwYTM1YiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2M5NWI4YyIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjMyIiBmaWxsPSJ1cmwoI2cpIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIyNSIgcj0iMTEiIGZpbGw9IiNmZmY4ZjMiLz48cGF0aCBkPSJNMTMgNTZjMi0xMiAxMC0xOCAxOS0xOHMxNyA2IDE5IDE4IiBmaWxsPSIjZmZmOGYzIi8+PC9zdmc+",
  chatgpt: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzhhNzJlZSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzRlNWJkNyIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjMyIiBmaWxsPSJ1cmwoI2cpIi8+PGNpcmNsZSBjeD0iMzIiIGN5PSIyNSIgcj0iMTEiIGZpbGw9IiNmN2Y1ZmYiLz48cGF0aCBkPSJNMTMgNTZjMi0xMiAxMC0xOCAxOS0xOHMxNyA2IDE5IDE4IiBmaWxsPSIjZjdmNWZmIi8+PC9zdmc+",
});

const CONCEPT_SOCIAL_POSTS = Object.freeze([
  { postId: "concept-tibo-1", account: "tibo", ageHours: 1, textKey: "social.concept.tibo1" },
  { postId: "concept-openai-1", account: "openai", ageHours: 6, textKey: "social.concept.openai1" },
  { postId: "concept-chatgpt-1", account: "chatgpt", ageHours: 19, textKey: "social.concept.chatgpt1" },
  { postId: "concept-tibo-2", account: "tibo", ageHours: 34, textKey: "social.concept.tibo2" },
]);

const safeAvatarDataUrl = (value) => typeof value === "string"
  && value.length <= 200000
  && /^data:image\/(png|webp|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value)
  ? value
  : null;

function readAvatarCache() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SOCIAL_AVATAR_CACHE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([account, value]) => Object.hasOwn(SOCIAL_ACCOUNTS, account) && safeAvatarDataUrl(value))
      .map(([account, value]) => [account, safeAvatarDataUrl(value)]));
  } catch {
    return {};
  }
}

function writeAvatarCache(avatars) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SOCIAL_AVATAR_CACHE_KEY, JSON.stringify(avatars)); } catch { /* Cache is optional. */ }
}

function decodeSocialEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_all, entity) => {
    if (entity[0] === "#") {
      const number = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    }
    return named[entity.toLowerCase()] || "";
  });
}

function stripSocialMarkup(value, maximum = 4000) {
  let text = String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  text = text.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ");
  text = decodeSocialEntities(text);
  // Some feeds entity-encode the complete tag. Decode once, then remove that
  // second-layer markup as well so raw frontend tags never reach the page.
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  return text.replace(/\r/g, "").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, maximum);
}

function normalizeSocialPost(post, index, avatarCache = {}) {
  const account = Object.hasOwn(SOCIAL_ACCOUNTS, post?.account) ? post.account : null;
  const postId = String(post?.postId ?? post?.id ?? "");
  if (!account || !postId) return null;
  return {
    postId,
    account,
    displayName: String(post?.displayName || SOCIAL_ACCOUNTS[account].displayName),
    handle: String(post?.handle || SOCIAL_ACCOUNTS[account].handle),
    createdAt: String(post?.createdAt || post?.publishedAt || ""),
    publishedAt: String(post?.publishedAt || post?.createdAt || ""),
    timeUnconfirmed: post?.timeUnconfirmed === true,
    source: String(post?.source || "unknown"),
    text: stripSocialMarkup(post?.text || "", 2000),
    // Built-in concept posts are interface copy; network posts are never translated implicitly.
    textKey: typeof post?.textKey === "string" ? post.textKey : null,
    avatarDataUrl: safeAvatarDataUrl(post?.avatarDataUrl) || safeAvatarDataUrl(avatarCache[account]) || SOCIAL_LOCAL_AVATARS[account],
    order: index,
  };
}

export function SocialFeed({ onClose, runtimeMode, runtimeController, settings, appearanceClass = "", appearanceStyle }) {
  const t = useI18n();
  const [feedState, setFeedState] = useState({ status: "loading", reason: "", posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false });
  const [translations, setTranslations] = useState({});
  const [openStatus, setOpenStatus] = useState({});
  const [avatarCache, setAvatarCache] = useState(readAvatarCache);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const aliveRef = useRef(true);
  const accountIds = Object.keys(SOCIAL_ACCOUNTS).filter((id) => settings.socialAccounts?.[id] === true);
  const maxPosts = Math.max(1, Math.min(10, Math.round(Number(settings.socialMaxPosts) || 4)));
  const hours = Math.max(24, Math.min(72, Math.round(Number(settings.socialHours) || 48)));
  const locale = ["zh", "en", "fr", "es", "ru", "ar"].includes(settings.socialLocale) ? settings.socialLocale : "zh";

  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    let active = true;
    setTranslations({});
    setOpenStatus({});
    if (!settings.socialEnabled) {
      setFeedState({ status: "disabled", reason: uiMessage("social.disabledInSettings"), posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false });
      return () => { active = false; };
    }
    if (accountIds.length === 0) {
      setFeedState({ status: "disabled", reason: uiMessage("social.enableOneAccount"), posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false });
      return () => { active = false; };
    }
    setFeedState({ status: "loading", reason: "", posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false });
    if (!runtimeMode) {
      const posts = CONCEPT_SOCIAL_POSTS
        .filter((post) => accountIds.includes(post.account) && post.ageHours <= hours)
        .map((post) => ({ ...post, createdAt: new Date(Date.now() - post.ageHours * 60 * 60 * 1000).toISOString() }))
        .slice(0, maxPosts)
         .map((post, index) => normalizeSocialPost(post, index, avatarCache))
         .filter(Boolean);
       setAvatarCache((current) => {
         const next = { ...current };
         posts.forEach((post) => { if (safeAvatarDataUrl(post.avatarDataUrl)) next[post.account] = post.avatarDataUrl; });
         writeAvatarCache(next);
         return next;
       });
        setFeedState({ status: "ready", reason: uiMessage("social.mockDemo"), posts, cacheAgeSeconds: 0, fetchedAt: new Date().toISOString(), degraded: false });
      return () => { active = false; };
    }
    if (!runtimeController?.capabilities.getSocialFeed) {
      setFeedState({ status: "unavailable", reason: uiMessage("social.unavailable"), posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false });
      return () => { active = false; };
    }
    runtimeController.getSocialFeed({ accounts: accountIds, maxPosts, hours, locale, useJinaFallback: settings.socialUseJinaFallback === true })
      .then((payload) => {
        if (!active) return;
        if (payload?.available !== true) {
          setFeedState({ status: "unavailable", reason: uiMessage("social.unavailable"), posts: [], cacheAgeSeconds: Number.isFinite(payload?.cacheAgeSeconds) ? payload.cacheAgeSeconds : null, fetchedAt: payload?.fetchedAt || null, degraded: payload?.degraded === true });
          return;
        }
        const posts = (Array.isArray(payload.posts) ? payload.posts : []).slice(0, maxPosts).map((post, index) => normalizeSocialPost(post, index, avatarCache)).filter(Boolean);
        setAvatarCache((current) => {
          const next = { ...current };
          posts.forEach((post) => { if (safeAvatarDataUrl(post.avatarDataUrl)) next[post.account] = post.avatarDataUrl; });
          writeAvatarCache(next);
          return next;
        });
        setFeedState({ status: "ready", reason: String(payload?.reason || ""), posts, cacheAgeSeconds: Number.isFinite(payload?.cacheAgeSeconds) ? payload.cacheAgeSeconds : null, fetchedAt: payload?.fetchedAt || null, degraded: payload?.degraded === true });
      })
      .catch(() => { if (active) setFeedState({ status: "unavailable", reason: uiMessage("social.unavailable"), posts: [], cacheAgeSeconds: null, fetchedAt: null, degraded: false }); });
    return () => { active = false; };
  }, [runtimeMode, runtimeController, settings.socialEnabled, settings.socialUseJinaFallback, locale, hours, maxPosts, accountIds.join("|"), refreshNonce]);

  const translatePost = async (post) => {
    setTranslations((current) => ({ ...current, [post.postId]: { status: "loading", text: "" } }));
    if (!runtimeMode) {
      setTranslations((current) => ({ ...current, [post.postId]: { status: "ready", text: uiMessage("social.mockTranslation", { locale, text: post.textKey ? uiMessage(post.textKey) : post.text }) } }));
      return;
    }
    if (!runtimeController?.capabilities.translateSocialPost) {
      setTranslations((current) => ({ ...current, [post.postId]: { status: "error", text: uiMessage("social.translationUnavailable") } }));
      return;
    }
    try {
      const result = await runtimeController.translateSocialPost({ postId: post.postId, targetLocale: locale });
      if (!aliveRef.current) return;
       const translatedText = (result?.status === "translated" || result?.available === true) && result?.text
         ? stripSocialMarkup(result.text)
         : "";
       setTranslations((current) => ({ ...current, [post.postId]: translatedText ? { status: "ready", text: translatedText } : { status: "error", text: uiMessage("social.translationUnavailable") } }));
    } catch {
      if (!aliveRef.current) return;
      setTranslations((current) => ({ ...current, [post.postId]: { status: "error", text: uiMessage("social.translationUnavailable") } }));
    }
  };

  const openPost = async (post) => {
    if (!runtimeMode) {
      setOpenStatus((current) => ({ ...current, [post.postId]: uiMessage("social.open.concept") }));
      return;
    }
    if (!runtimeController?.capabilities.openSocialPost) {
      setOpenStatus((current) => ({ ...current, [post.postId]: uiMessage("social.open.unavailable") }));
      return;
    }
    try {
      await runtimeController.openSocialPost({ postId: post.postId });
      if (!aliveRef.current) return;
      setOpenStatus((current) => ({ ...current, [post.postId]: uiMessage("social.open.handedOff") }));
    } catch {
      if (!aliveRef.current) return;
      setOpenStatus((current) => ({ ...current, [post.postId]: uiMessage("social.open.unavailable") }));
    }
  };

  const formatSocialTime = (post) => {
    if (post.timeUnconfirmed) return t("social.time.unconfirmed");
    const value = post.publishedAt || post.createdAt;
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed)
      ? new Date(parsed).toLocaleString(t.locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : t("social.time.notProvided");
  };

  const formatFetchedAt = (value) => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleTimeString(t.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : t("social.time.notRecorded");
  };

  const sourceCount = new Set(feedState.posts.map((post) => post.source)).size;

  return createPortal(
    <div className={`inner-modal-backdrop ${appearanceClass}`} style={appearanceStyle}>
      <section className="social-feed-dialog" role="dialog" aria-modal="true" aria-label={t("social.ariaLabel")}>
        <header><div><MenuGlyph name="observe" size={18}/><div><strong>{t("social.title")}</strong><span>{runtimeMode ? t("social.subtitleRuntime") : t("social.subtitleConcept")}</span></div></div><div className="social-feed-actions"><button type="button" className="social-feed-refresh" aria-label={t("social.refreshAria")} disabled={feedState.status === "loading"} onClick={() => setRefreshNonce((value) => value + 1)}>{t("social.refresh")}</button><button type="button" aria-label={t("social.closeAria")} onClick={onClose}><Icon name="close" size={16}/></button></div></header>
        <div className="social-feed-meta"><span>{t("social.meta.hours", { hours })}</span><span>{t("social.meta.maxPosts", { count: maxPosts })}</span><span>{t("social.meta.locale", { locale })}</span>{sourceCount > 0 ? <span>{t("social.meta.sources", { count: sourceCount })}</span> : null}{feedState.fetchedAt ? <span>{t("social.meta.updated", { time: formatFetchedAt(feedState.fetchedAt) })}</span> : null}{Number.isFinite(feedState.cacheAgeSeconds) ? <span>{t("social.meta.cache", { seconds: Math.max(0, Math.round(feedState.cacheAgeSeconds)) })}</span> : null}{feedState.degraded ? <span>{t("social.meta.degraded")}</span> : null}<b>{t("social.meta.independent")}</b></div>
        <div className="social-feed-scroll">
          {feedState.status === "loading" ? <div className="social-feed-empty"><strong>{t("social.loading")}</strong><span>{t("social.loadingHint")}</span></div> : null}
          {["disabled", "unavailable"].includes(feedState.status) ? <div className="social-feed-empty"><strong>{formatMessage(t, feedState.reason)}</strong><span>{feedState.status === "disabled" ? t("social.disabledHint") : t("social.unavailableHint")}</span></div> : null}
          {feedState.status === "ready" && feedState.posts.length === 0 ? <div className="social-feed-empty"><strong>{t("social.empty")}</strong><span>{t("social.emptyHint")}</span></div> : null}
          {feedState.posts.map((post) => {
            const translation = translations[post.postId];
            return <article className="social-post" key={post.postId} dir={locale === "ar" ? "rtl" : "ltr"}>
              <div className="social-avatar">{post.avatarDataUrl ? <img src={post.avatarDataUrl} alt="" /> : <span>{post.displayName.slice(0, 1).toUpperCase()}</span>}</div>
              <div className="social-post-body"><header><strong>{post.displayName}</strong><span>{post.handle}</span><small className="social-post-source">{t("social.sourceLabel", { source: t(`social.source.${SOCIAL_SOURCES.has(post.source) ? post.source : "restricted"}`) })}</small><time>{formatSocialTime(post)}</time></header><p>{post.textKey ? t(post.textKey) : post.text}</p>{translation ? <div className={`social-translation is-${translation.status}`}>{translation.status === "loading" ? t("social.translating") : formatMessage(t, translation.text)}</div> : null}<footer><button type="button" disabled={translation?.status === "loading"} onClick={() => translatePost(post)}>{t("social.translateTo", { locale })}</button><button type="button" onClick={() => openPost(post)}>{t("social.viewOriginal")}</button>{openStatus[post.postId] ? <span>{formatMessage(t, openStatus[post.postId])}</span> : null}</footer></div>
            </article>;
          })}
        </div>
      </section>
    </div>,
    document.body
  );
}

export function SupportBundleDialog({ onClose, onConfirm, busy }) {
  const t = useI18n();
  return createPortal(
    <div className="inner-modal-backdrop">
      <section className="support-bundle-dialog" role="dialog" aria-modal="true" aria-label={t("support.title")}>
        <header><div><Icon name="shield" size={18}/><div><strong>{t("support.title")}</strong><span>{t("support.subtitle")}</span></div></div><button type="button" aria-label={t("support.closeAria")} onClick={onClose}><Icon name="close" size={16}/></button></header>
        <div className="support-bundle-copy"><p>{t("support.intro")}</p><ul><li>{t("support.item.app")}</li><li>{t("support.item.report")}</li><li>{t("support.item.logs")}</li><li>{t("support.item.excluded")}</li></ul></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>{t("support.cancel")}</button><button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? t("support.generating") : t("support.confirm")}</button></footer>
      </section>
    </div>,
    document.body
  );
}

export function ResultPage({ onBack, onOpenLogs, onOpenGPT, onRequestSupportBundle, runtimeMode, canOpenLogs, canOpenGPT, canExportSupportBundle, report, repairResult }) {
  const t = useI18n();
  const summary = issueSummary(report);
  const firstIssue = summary.first;
  const runtimeCards = [
    [t("result.card.before"), report ? t("result.reportCount", { count: summary.issues.length }) : t("result.reportMissing"), firstIssue?.category ?? t("result.noCategory")],
    [t("result.card.actions"), firstIssue?.plannedActions?.length ? t("result.controlledActions", { count: firstIssue.plannedActions.length }) : t("result.seeRuntimeLog"), firstIssue?.plannedActions?.join(" → ") || t("result.noDeclaredActions")],
    [t("result.card.after"), repairResult?.finalVerificationPassed === true ? t("result.finalVerificationPassed") : t("result.notConfirmed"), repairResult?.operationId ? t("result.operation", { id: repairResult.operationId }) : t("result.awaitingResult")],
    [t("result.card.unresolved"), t("result.notReturned"), t("result.checkLogs")],
  ];
  const conceptCards = [
    [t("result.card.before"), t("result.concept.beforeValue"), t("result.concept.beforeDetail")],
    [t("result.card.actions"), t("result.concept.actionsValue"), t("result.concept.actionsDetail")],
    [t("result.card.after"), t("result.concept.afterValue"), t("result.concept.afterDetail")],
    [t("result.card.unresolved"), t("result.concept.unresolvedValue"), t("result.concept.unresolvedDetail")],
  ];
  const cards = runtimeMode ? runtimeCards : conceptCards;
  return (
    <section className="result-page" aria-label={runtimeMode ? t("result.ariaRuntime") : t("result.ariaConcept")}>
      <header className="result-hero"><span className="result-icon"><Icon name="check" size={24}/></span><div><small>{runtimeMode ? t("result.kickerRuntime") : t("result.kickerConcept")}</small><h3>{t("result.heading")}</h3><p>{t("result.body")}</p></div></header>
      <div className="result-summary-grid">
        {cards.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
      </div>
      <div className="result-details">
        <div><h4>{t("result.issuesTitle")}</h4><p>{runtimeMode ? (firstIssue?.impact || t("result.noImpact")) : t("result.conceptIssue")}</p></div>
        <div><h4>{t("result.outcomeTitle")}</h4><p>{runtimeMode ? (repairResult?.finalVerificationPassed === true ? t("result.outcomeVerified") : t("result.outcomeUnverified")) : t("result.outcomeConcept")}</p></div>
        <div><h4>{t("result.evidenceTitle")}</h4><p>{runtimeMode ? t("result.evidenceRuntime") : t("result.evidenceConcept")}</p></div>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onBack}>{t("result.backToDiagnosis")}</button><button type="button" className="secondary-button" disabled={runtimeMode && !canOpenLogs} onClick={onOpenLogs}>{t("result.openFullLog")}{runtimeMode ? (canOpenLogs ? "" : t("common.unavailableSuffix")) : t("common.conceptSuffix")}</button><button type="button" className="secondary-button" disabled={!canExportSupportBundle} onClick={onRequestSupportBundle}>{t("result.exportSupportBundle")}</button><button type="button" className="primary-button" disabled={runtimeMode && !canOpenGPT} onClick={onOpenGPT}>{t("result.openGpt")}{runtimeMode ? (canOpenGPT ? "" : t("common.unavailableSuffix")) : t("common.conceptSuffix")}</button></footer>
    </section>
  );
}

export default function RecoveryWindow({ scheme, onSchemeChange, mix, setMix, settings, setSettings, progress, setProgress, onRestoreDefaults, onExportConfig, onImportConfig, runtimeMode = false, bridgeAvailable = false, runtimeSettingsHydrated = false, runtimeSettingsError = "" }) {
  const t = useI18n();
  const [gearOpen, setGearOpen] = useState(!runtimeMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  // Future auto-close integration: suppress window close while this local game surface is active.
  const [gameActive, setGameActive] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [supportBundleOpen, setSupportBundleOpen] = useState(false);
  const [supportBundleBusy, setSupportBundleBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [screen, setScreen] = useState("diagnosis");
  const [flowState, setFlowState] = useState(runtimeMode ? "" : "AwaitingDecision");
  const [progressMode, setProgressMode] = useState("determinate");
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoSession, setDemoSession] = useState(0);
  const [logs, setLogs] = useState(logSeed);
  const [runtimeReport, setRuntimeReport] = useState(null);
  const [runtimeRepairResult, setRuntimeRepairResult] = useState(null);
  const [runtimeInfo, setRuntimeInfo] = useState(() => ({ realRepairEnabled: false, capabilities: {} }));
  const [operationBusy, setOperationBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [desktopStarted, setDesktopStarted] = useState(false);
  const [runtimePluginStates, setRuntimePluginStates] = useState(() => freshRuntimePluginStates());
  const gearRef = useRef(null);
  const themePanelRef = useRef(null);
  const progressSliderRef = useRef(null);
  const scanTimersRef = useRef([]);
  const operationKindRef = useRef(null);
  const lastSettingsErrorRef = useRef("");
  const logLimitRef = useRef(settings.logLimit);
  logLimitRef.current = settings.logLimit;
  const runtimeBridge = bridgeAvailable ? window.winBridgeApi : null;
  const runtimeController = useMemo(() => createRuntimeController(runtimeBridge), [runtimeBridge]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (gearRef.current && !gearRef.current.contains(event.target)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      scanTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!themeOpen) return;
    themePanelRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [themeOpen]);

  useEffect(() => {
    if (!runtimeMode || !bridgeAvailable) return undefined;
    const controller = runtimeController;
    let active = true;
    setRuntimeInfo({ realRepairEnabled: controller.realRepairEnabled, capabilities: controller.capabilities });
    if (controller.capabilities.getAppInfo) {
      Promise.resolve().then(() => controller.getAppInfo()).then((appInfo) => {
        if (active) setRuntimeInfo({ realRepairEnabled: controller.realRepairEnabled, capabilities: controller.capabilities, appInfo });
      }).catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setRuntimeError(uiMessage("runtime.appInfoUnavailable", { message }));
        setLogs((current) => [...current, runtimeLog({ level: "warn", category: "runtime", message: uiMessage("runtime.appInfoUnavailable", { message }) })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
      });
    } else {
      setRuntimeError(uiMessage("runtime.noGetAppInfo"));
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "runtime", message: uiMessage("runtime.noGetAppInfo") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    const initialReport = controller.capabilities.getDiagnosisReport ? Promise.resolve().then(() => controller.getDiagnosisReport()) : Promise.resolve(null);
    if (!controller.capabilities.getDiagnosisReport) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "report", message: uiMessage("runtime.noGetDiagnosisReport") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.onEngineEvent) {
      setRuntimeError(uiMessage("runtime.noOnEngineEvent"));
      setLogs((current) => [...current, runtimeLog({ level: "error", category: "runtime", message: uiMessage("runtime.noOnEngineEvent") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.onLogBatch) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "logs", message: uiMessage("runtime.noOnLogBatch") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.getSettings || !controller.capabilities.saveSettings) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "settings", message: uiMessage("runtime.settingsApiIncomplete") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    initialReport.then((report) => {
      if (!active) return;
      setRuntimeReport(report);
      if (report) {
        setRuntimePluginStates((current) => finalizePluginStatesFromReport(current, report));
        setFlowState("AwaitingDecision");
      }
    }).catch((error) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(message);
      setLogs((current) => [...current, runtimeLog({ level: "error", category: "runtime", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    });
    const unsubscribeRuntime = controller.subscribe({ onEngineEvent: (event) => {
      if (!active) return;
      const normalized = normalizeRuntimeEvent(event);
      if (normalized.actualProgress !== null) {
        const gatedProgress = normalized.actualProgress >= 100 && !(normalized.flowState === "ResultReady" && normalized.verified) ? 99 : normalized.actualProgress;
        setProgress((current) => Math.max(current, gatedProgress));
      }
      if (normalized.failed || normalized.cancelled) {
        const message = normalized.message || uiMessage(normalized.cancelled ? "runtime.operationCancelled" : "runtime.operationFailed");
        setRuntimeError(message);
        setLogs((current) => [...current, runtimeLog({ level: normalized.cancelled ? "warn" : "error", category: "runtime", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
        setOperationBusy(false);
        if (operationKindRef.current === "repair") {
          setRuntimePluginStates((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, value.state === "plugin.state.repairing" || value.state === "plugin.state.repairInProgress"
            ? { ...value, state: "plugin.state.repairInterrupted", risk: "plugin.risk.recheck", tone: "warn", evidence: uiMessage(normalized.cancelled ? "plugin.evidence.repairCancelled" : "plugin.evidence.repairIncomplete") }
            : value])));
        }
        setFlowState(operationKindRef.current === "repair" ? "AwaitingDecision" : "ReportReady");
        operationKindRef.current = null;
        return;
      }
      if (normalized.flowState === "ResultReady") {
        const operationKind = operationKindRef.current;
        setOperationBusy(false);
        if (operationKind === "diagnosis") {
          if (normalized.verified) {
            setRuntimeError("");
            setFlowState((current) => current === "AwaitingDecision" ? current : "ReportReady");
            setLogs((current) => [...current, runtimeLog({ level: "info", category: "diagnosis", message: uiMessage("runtime.diagnosisVerified") })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
          } else {
            const message = uiMessage("runtime.diagnosisUnverified");
            setRuntimeError(message);
            setLogs((current) => [...current, runtimeLog({ level: "error", category: "diagnosis", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
          }
          operationKindRef.current = null;
          return;
        }
        if (operationKind === "repair") {
          if (normalized.verified) {
            setRuntimePluginStates((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, {
              ...value,
              state: "plugin.state.staticVerificationPassed",
              risk: "plugin.risk.low",
              tone: "ok",
              evidence: uiMessage("plugin.evidence.repairVerified"),
            }])));
            setProgress(100);
            setFlowState("ResultReady");
            setScreen("result");
          } else {
            const message = uiMessage("runtime.repairUnverified");
            setRuntimeError(message);
            setLogs((current) => [...current, runtimeLog({ level: "error", category: "verification", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
            setFlowState("AwaitingDecision");
          }
          operationKindRef.current = null;
          return;
        }
        setProgress((current) => Math.min(current, 99));
        const message = uiMessage("runtime.unattributedResult");
        setRuntimeError(message);
        setLogs((current) => [...current, runtimeLog({ level: "error", category: "runtime", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
        operationKindRef.current = null;
        return;
      }
      if (normalized.flowState) setFlowState(normalized.flowState);
    }, onLogBatch: (batch) => {
      if (!active) return;
      const entries = batch?.entries;
      if (!Array.isArray(entries)) return;
      const phase = operationKindRef.current;
      if (entries.some((entry) => /\bDesktop started\b/i.test(String(entry?.message ?? entry?.text ?? entry?.detail ?? "")))) {
        setDesktopStarted(true);
      }
      setRuntimePluginStates((current) => updatePluginStatesFromLogs(current, entries, phase));
      const dropped = Number(batch.droppedBeforeBatch) > 0
        ? [runtimeLog({ level: "warn", category: "logs", message: uiMessage("runtime.logsDropped", { count: Number(batch.droppedBeforeBatch) }) })]
        : [];
      const incoming = [...dropped, ...entries.map(runtimeLog)];
      setLogs((current) => [...current, ...incoming].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    } });
    return () => {
      active = false;
      unsubscribeRuntime();
    };
  }, [runtimeMode, bridgeAvailable, runtimeController, setProgress]);

  useEffect(() => {
    const errorIdentity = JSON.stringify(runtimeSettingsError || "");
    if (!runtimeSettingsError || errorIdentity === lastSettingsErrorRef.current) return;
    lastSettingsErrorRef.current = errorIdentity;
    setRuntimeError(uiMessage("runtime.settingsSyncFailed", { detail: runtimeSettingsError }));
    setLogs((current) => [...current, runtimeLog({ level: "error", category: "settings", message: uiMessage("runtime.settingsSyncFailed", { detail: runtimeSettingsError }) })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
  }, [runtimeSettingsError]);

  useEffect(() => {
    const slider = progressSliderRef.current;
    if (!slider) return undefined;
    const syncProgress = () => {
      const maximum = flowState === "ResultReady" ? 100 : 99;
      setProgress((current) => Math.min(maximum, Math.max(current, Number(slider.value))));
    };
    slider.addEventListener("input", syncProgress);
    slider.addEventListener("change", syncProgress);
    return () => {
      slider.removeEventListener("input", syncProgress);
      slider.removeEventListener("change", syncProgress);
    };
  }, [flowState, setProgress]);

  const simulateReadOnlyScan = () => {
    const stamp = clockTime(new Date());
    scanTimersRef.current.forEach((timer) => clearTimeout(timer));
    setDemoSession((current) => current + 1);
    setScreen("diagnosis");
    setFlowState("Diagnosing");
    setProgressMode("determinate");
    setProgress(18);
    setLogs((current) => [...current.slice(-10), { time: stamp, type: "INFO", category: "simulation", categoryKey: "log.category.simulation", messageKey: "log.simulatedRefresh" }]);
    scanTimersRef.current = [
      setTimeout(() => setFlowState("ReportReady"), 480),
      setTimeout(() => setFlowState("AwaitingDecision"), 1100),
    ];
  };

  const runVisualDemo = () => {
    scanTimersRef.current.forEach((timer) => clearTimeout(timer));
    setDemoSession((current) => current + 1);
    setDemoRunning(true);
    setScreen("diagnosis");
    setFlowState("Diagnosing");
    setProgressMode("determinate");
    setProgress(12);
    const steps = [
      [520, () => setProgress(34)],
      [1250, () => { setFlowState("ReportReady"); setProgress(53); }],
      [2250, () => { setFlowState("AwaitingDecision"); setProgress(68); }],
      [3200, () => setProgressMode("indeterminate")],
      [4450, () => { setProgressMode("determinate"); setFlowState("Repairing"); setProgress(88); }],
      [5650, () => setProgress(99)],
      [6800, () => { setFlowState("ResultReady"); setProgress(100); }],
      [7900, () => setDemoRunning(false)],
    ];
    scanTimersRef.current = steps.map(([delay, action]) => window.setTimeout(action, delay));
  };

  const handleProgressKeyDown = (event) => {
    const bounds = { min: 0, max: flowState === "ResultReady" ? 100 : 99 };
    const keyDelta = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -10,
      PageUp: 10,
    };
    let next = null;
    if (event.key === "Home") next = bounds.min;
    else if (event.key === "End") next = bounds.max;
    else if (Object.hasOwn(keyDelta, event.key)) next = progress + keyDelta[event.key];
    if (next === null) return;
    event.preventDefault();
    updateActualProgress(Math.max(bounds.min, Math.min(bounds.max, next)));
  };

  const updateActualProgress = (value) => {
    const requested = Number(value);
    const maximum = flowState === "ResultReady" ? 100 : 99;
    setProgress((current) => Math.min(maximum, Math.max(current, requested)));
  };

  const glassStyle = {
    "--app-accent": mix.accent,
    "--app-accent-secondary": mix.secondaryAccent,
    "--app-radius": `${mix.cornerRadius}px`,
    "--glass-opacity": `${mix.glassOpacity}%`,
    "--glass-blur": `${mix.glassBlur}px`,
    "--glass-refraction": `${mix.glassRefraction}px`,
    "--edge-highlight": `${mix.edgeHighlight / 100}`,
    "--interface-scale": `${mix.interfaceScale / 100}`,
  };
  const paletteClass = mix.colorPreset === "custom" ? mix.baseColorPreset : mix.colorPreset;

  const appendRuntimeMessage = (level, category, message) => {
    setLogs((current) => [...current, runtimeLog({ level, category, message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
  };

  const runRuntimeAction = async (operation, category = "runtime") => {
    try {
      setRuntimeError("");
      if (!runtimeController) throw Object.assign(new Error("Runtime bridge is unavailable."), { uiMessage: uiMessage("runtime.bridgeUnavailable") });
      return await operation();
    } catch (error) {
      const message = error?.uiMessage ?? (error instanceof Error ? error.message : String(error));
      setRuntimeError(message);
      appendRuntimeMessage("error", category, message);
      return null;
    }
  };

  const cancelRuntimeOperation = async () => {
    if (!runtimeController?.capabilities.cancelOperation) {
      const message = uiMessage("runtime.noCancel");
      setRuntimeError(message);
      appendRuntimeMessage("warn", "runtime", message);
      return;
    }
    const result = await runRuntimeAction(() => runtimeController.cancelOperation(), "runtime");
    if (result?.cancelled === false) {
      setOperationBusy(false);
      operationKindRef.current = null;
      appendRuntimeMessage("info", "runtime", uiMessage("runtime.nothingToCancel"));
    } else if (result?.cancelled === true) {
      appendRuntimeMessage("warn", "runtime", uiMessage("runtime.cancelAccepted"));
    }
  };

  const runRuntimeDiagnosis = async () => {
    if (!runtimeController?.capabilities.runDiagnosis || operationBusy) {
      const message = uiMessage(operationBusy ? "runtime.operationBusy" : "runtime.noDiagnosis");
      setRuntimeError(message);
      appendRuntimeMessage("warn", "diagnosis", message);
      return;
    }
    setRuntimeError("");
    setOperationBusy(true);
    operationKindRef.current = "diagnosis";
    setDemoSession((current) => current + 1);
    setScreen("diagnosis");
    setFlowState("Diagnosing");
    setProgressMode("determinate");
    setProgress(0);
    setDesktopStarted(false);
    setRuntimePluginStates(freshRuntimePluginStates("plugin.state.diagnosing", "plugin.evidence.collectingRound"));
    setRuntimeReport(null);
    setRuntimeRepairResult(null);
    setReportOpen(false);
    appendRuntimeMessage("info", "diagnosis", uiMessage("runtime.diagnosisStarted"));
    try {
      const report = await runtimeController.runDiagnosis();
      setRuntimeReport(report);
      if (report) {
        setRuntimePluginStates((current) => finalizePluginStatesFromReport(current, report));
        setFlowState("AwaitingDecision");
        setReportOpen(true);
      } else {
        setFlowState("ReportReady");
        appendRuntimeMessage("warn", "diagnosis", uiMessage("runtime.diagnosisNoReport"));
      }
      if (operationKindRef.current !== "diagnosis") setOperationBusy(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(message);
      appendRuntimeMessage("error", "diagnosis", message);
      setOperationBusy(false);
    }
  };

  const openRuntimeReport = async () => {
    if (!runtimeController) {
      const message = uiMessage("runtime.bridgeUnavailable");
      setRuntimeError(message);
      appendRuntimeMessage("error", "report", message);
      return;
    }
    if (runtimeReport) {
      setReportOpen(true);
      return;
    }
    if (!runtimeController.capabilities.getDiagnosisReport) {
      const message = uiMessage("runtime.noReportReader");
      setRuntimeError(message);
      appendRuntimeMessage("warn", "report", message);
      return;
    }
    try {
      const report = await runtimeController.getDiagnosisReport();
      setRuntimeReport(report);
      if (report) {
        setRuntimePluginStates((current) => finalizePluginStatesFromReport(current, report));
        setReportOpen(true);
        setFlowState("AwaitingDecision");
      } else {
        const message = uiMessage("runtime.noWorkerReport");
        setRuntimeError(message);
        appendRuntimeMessage("warn", "report", message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(message);
      appendRuntimeMessage("error", "report", message);
    }
  };

  const startRuntimeRepair = async () => {
    const eligibility = runtimeController?.getRepairEligibility(runtimeReport?.reportId);
    if (!eligibility?.allowed || operationBusy) {
      const reason = eligibility?.reason ?? "runtime-unavailable";
      const message = operationBusy ? uiMessage("runtime.operationBusy") : uiMessage("runtime.repairNotAllowed", { reason: repairEligibilityMessage(reason) });
      setRuntimeError(message);
      appendRuntimeMessage("warn", "repair", message);
      return;
    }
    setReportOpen(false);
    setRuntimeError("");
    setOperationBusy(true);
    operationKindRef.current = "repair";
    setDemoSession((current) => current + 1);
    setScreen("diagnosis");
    setFlowState("Repairing");
    setProgress(0);
    setDesktopStarted(false);
    setRuntimePluginStates((current) => Object.fromEntries(Object.entries(current).map(([id, value]) => [id, {
      ...value,
      state: "plugin.state.repairing",
      risk: value.tone === "ok" ? "plugin.risk.low" : "plugin.risk.processing",
      tone: value.tone === "ok" ? "ok" : "warn",
      evidence: uiMessage(value.tone === "ok" ? "plugin.evidence.awaitingRecheck" : "plugin.evidence.applyingRepair"),
    }])));
    appendRuntimeMessage("warn", "repair", uiMessage("runtime.repairConfirmed"));
    try {
      const result = await runtimeController.startRepair(runtimeReport.reportId);
      setRuntimeRepairResult(result);
      if (result?.finalVerificationPassed === true) {
        appendRuntimeMessage("info", "repair", uiMessage("runtime.repairReturnedVerified"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(localizeRepairError(message));
      appendRuntimeMessage("error", "repair", message);
      setFlowState("AwaitingDecision");
      setOperationBusy(false);
    }
  };

  const requestSupportBundle = () => {
    if (!runtimeMode || !runtimeController?.capabilities.exportSupportBundle) {
      appendRuntimeMessage("warn", "support-bundle", uiMessage("support.unavailable"));
      return;
    }
    setSupportBundleOpen(true);
  };

  const confirmSupportBundle = async () => {
    if (!runtimeController?.capabilities.exportSupportBundle || supportBundleBusy) return;
    setSupportBundleBusy(true);
    const result = await runRuntimeAction(() => runtimeController.exportSupportBundle(), "support-bundle");
    setSupportBundleBusy(false);
    if (result?.created) {
      setSupportBundleOpen(false);
      appendRuntimeMessage("info", "support-bundle", uiMessage("support.created", { fileName: result.fileName || uiMessage("support.localFile"), bytes: result.bytes || 0 }));
    }
  };

  const repairEligibility = runtimeController?.getRepairEligibility(runtimeReport?.reportId) ?? { allowed: false, reason: "runtime-unavailable" };
  const canRepair = Boolean(runtimeInfo.realRepairEnabled && repairEligibility.allowed && !operationBusy);
  const waitingForDiagnosis = runtimeMode && !runtimeReport && !operationBusy && !flowState;

  return (
    <div className={`recovery-window layout-${scheme.id} material-${mix.material} palette-${paletteClass} density-${mix.density} geometry-${mix.geometry}`} data-testid="recovery-window" data-layout={scheme.id} data-material={mix.material} data-palette={mix.colorPreset} data-palette-base={paletteClass} data-game-active={gameActive ? "true" : "false"} style={glassStyle}>
      <header className="recovery-titlebar">
        <div className="product-title"><img className="product-mark winbridge-mark" src={winbridgeMark} alt="" aria-hidden="true" /><div><strong>WinBridge Recovery <b>4.0</b></strong><small>{runtimeMode ? (bridgeAvailable ? t("window.subtitleConnected") : t("window.subtitlePreviewOnly")) : t("window.subtitleConcept")}</small></div></div>
        <div className="titlebar-runtime"><span className="architecture-chip">{t("window.architecture")}</span></div>
        <div className="titlebar-safety"><span className="readonly-chip"><Icon name="shield" size={14}/>{operationBusy ? t("window.chipBusy") : t("window.chipLocked")}</span>{!runtimeMode ? <button type="button" aria-label={t("window.conceptCloseAria")}><Icon name="close" size={15}/></button> : null}</div>
      </header>
      <div className="state-interface" aria-label={t("window.stateInterfaceAria")}>
        <span>{t("window.stateInterface")}</span>
        {recoveryStates.map((state, index) => <div key={state.id} className={`${flowState === state.id ? "is-current" : ""} ${state.write ? "is-write-state" : ""}`} aria-current={flowState === state.id ? "step" : undefined}><b>{state.id}</b><small>{t(`recoveryState.${state.id}`)}</small>{index < recoveryStates.length - 1 ? <i>›</i> : null}</div>)}
      </div>
      <div className="recovery-body">
        <StageRail flowState={flowState} progress={progress} reduceMotion={settings.reduceMotion} desktopStarted={desktopStarted} />
        <main className="recovery-main">
          {screen === "result" ? <ResultPage runtimeMode={runtimeMode} report={runtimeReport} repairResult={runtimeRepairResult} canOpenLogs={Boolean(runtimeController?.capabilities.openLogs)} canOpenGPT={Boolean(runtimeController?.capabilities.openGPT)} canExportSupportBundle={runtimeMode && Boolean(runtimeController?.capabilities.exportSupportBundle)} onRequestSupportBundle={requestSupportBundle} onBack={() => { setDemoSession((current) => current + 1); if (!runtimeMode) { setProgress(68); setFlowState("AwaitingDecision"); } setScreen("diagnosis"); }} onOpenLogs={() => runtimeMode ? runRuntimeAction(() => runtimeController.openLogs(), "logs") : null} onOpenGPT={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : null} /> : <><DiagnosisBrief flowState={flowState} report={runtimeReport} runtimeMode={runtimeMode}/><TerminalPanel logs={logs} limit={Math.max(40, Number(settings.logLimit) || 80)} /></>}
        </main>
        <PluginPanel pluginColors={mix.pluginColors} visibility={settings.pluginVisibility} runtimeMode={runtimeMode} runtimePluginStates={runtimePluginStates} />
      </div>
      <section className="progress-action-zone">
        <div className="fluid-demo-column">
          <NebulaFluidProgress actualProgress={progress} channels={mix.channels} speed={mix.speed} reducedMotion={settings.reduceMotion} lowEndMode={settings.lowEndMode} indeterminate={progressMode === "indeterminate"} resultReady={flowState === "ResultReady"} sessionKey={demoSession} label={waitingForDiagnosis ? t("progress.waitingLabel") : undefined} />
          {!runtimeMode ? <div className="progress-demo-controls">
            <label className="progress-slider"><span>actualProgress</span><input ref={progressSliderRef} aria-label={t("progress.previewAria")} type="range" min="0" max={flowState === "ResultReady" ? "100" : "99"} value={progress} onInput={(event) => updateActualProgress(event.currentTarget.value)} onChange={(event) => updateActualProgress(event.currentTarget.value)} onKeyDown={handleProgressKeyDown}/><b>{progress}%</b></label>
            <button type="button" className="demo-button" onClick={runVisualDemo} disabled={demoRunning}>{demoRunning ? t("progress.demoRunning") : t("progress.runDemo")}</button>
            <button type="button" className={`mode-button ${progressMode === "indeterminate" ? "is-on" : ""}`} onClick={() => setProgressMode((current) => current === "indeterminate" ? "determinate" : "indeterminate")}>{progressMode === "indeterminate" ? t("progress.endIndeterminate") : t("progress.simulateIndeterminate")}</button>
          </div> : waitingForDiagnosis ? <div className="diagnosis-start-hint" role="status" aria-live="polite"><Icon name="shield" size={14}/><div><strong>{t("progress.startHintTitle")}</strong><span>{t("progress.startHintBody")}</span></div></div> : runtimeError ? <div className="runtime-error" role="alert"><Icon name="shield" size={14}/><span>{formatMessage(t, runtimeError)}</span></div> : null}
        </div>
        <DecisionSummary flowState={flowState} actualProgress={progress} indeterminate={progressMode === "indeterminate"} report={runtimeReport} runtimeMode={runtimeMode}/>
      </section>
      <section className="safety-strip" aria-label={t("safety.ariaLabel")}>
        <span><Icon name="shield" size={14}/>{t("safety.pathGate")} <code>%USERPROFILE%\.codex\plugins</code></span>
        <span>{t("safety.backup")} <code>%LOCALAPPDATA%\WinBridge Recovery\Backups</code></span>
        <span>{t("safety.autoRepair")} <b>OFF</b></span>
        <span>{t("safety.autoClose")} <b className={settings.autoCloseAfterRepair ? "is-on-text" : ""}>{settings.autoCloseAfterRepair ? t("safety.autoCloseOn") : t("safety.autoCloseOff")}</b></span>
      </section>
      <footer className="command-dock">
        <div className="gear-anchor" ref={gearRef}>
          {gearOpen ? (
            <div className="gear-menu" role="menu" aria-label={t("gear.menuAria")}>
              <button type="button" role="menuitem" onClick={() => { setGamesOpen(true); setThemeOpen(false); }}><MenuGlyph name="games" size={17}/><span><strong>{t("gear.games")}</strong><small>Snake · Minesweeper</small></span><b>2</b></button>
              <button type="button" role="menuitem" onClick={() => setThemeOpen((value) => !value)}><MenuGlyph name="theme" size={17}/><span><strong>{t("gear.theme")}</strong><small>{t("gear.themeHint")}</small></span><b>›</b></button>
              <button type="button" role="menuitem" onClick={() => setSocialOpen(true)}><MenuGlyph name="observe" size={17}/><span><strong>{t("gear.social")}</strong><small>{t("gear.socialHint")}</small></span><b aria-hidden="true">↗</b></button>
              <button type="button" role="menuitem" onClick={() => setSettingsOpen(true)}><MenuGlyph name="settings" size={17}/><span><strong>{t("gear.settings")}</strong><small>{t("gear.settingsHint")}</small></span><b>›</b></button>
              {themeOpen ? (
                <div ref={themePanelRef} className="theme-submenu quick-appearance" role="menu" aria-label={t("gear.themeAria")}>
                  <span>{t("gear.layout")}</span><div className="quick-layout-list">{schemes.map((item) => <button type="button" key={item.id} className={scheme.id === item.id ? "is-selected" : ""} onClick={() => onSchemeChange(item)}>{t(`scheme.${item.id}.name`)}</button>)}</div>
                  <span>{t("gear.material")}</span><div><button type="button" className={mix.material === "glass" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "glass" }))}>Glass</button><button type="button" className={mix.material === "solid" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "solid" }))}>Solid</button></div>
                  <span>{t("gear.color")}</span><div>{colorPresets.map((preset) => <button type="button" key={preset.id} className={mix.colorPreset === preset.id ? "is-selected" : ""} title={t(`colorPreset.${preset.id}.name`)} onClick={() => applyColorPreset(setMix, preset.id)}><i style={{ background: preset.accent }}/></button>)}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="gear-button" type="button" aria-label={t("gear.openAria")} aria-expanded={gearOpen} onClick={() => setGearOpen((value) => !value)}><MenuGlyph name="settings" size={20}/></button>
        </div>
        <div className="command-status"><span>{flowState || (runtimeMode ? t("command.waitingRuntime") : t("command.waitingConcept"))}</span><small>{waitingForDiagnosis ? t("command.readOnlyHint") : t("command.animationHint")}</small></div>
        <div className="primary-actions">
          <button type="button" onClick={runtimeMode ? runRuntimeDiagnosis : simulateReadOnlyScan} disabled={runtimeMode && (!runtimeController?.capabilities.runDiagnosis || operationBusy)}>{runtimeMode && operationBusy ? t("actions.busy") : runtimeMode && !runtimeController?.capabilities.runDiagnosis ? t("actions.diagnoseUnavailable") : waitingForDiagnosis ? t("actions.startDiagnosis") : t("actions.diagnose")}</button>
          <button type="button" onClick={runtimeMode ? openRuntimeReport : () => { setReportOpen(true); setFlowState("AwaitingDecision"); }} disabled={runtimeMode && !runtimeReport && !runtimeController?.capabilities.getDiagnosisReport}>{t("actions.viewRepairDetails")}</button>
          <button type="button" disabled title={t("actions.backupTitle")}>{t("actions.backupWithRepair")}</button>
          <button type="button" disabled title={t("actions.rollbackTitle")}>{t("actions.rollbackUnavailable")}</button>
          <button type="button" className="repair-action" title={!runtimeMode ? t("actions.authorizeConceptTitle") : canRepair ? t("actions.authorizeRuntimeTitle") : t("actions.repairUnavailableTitle", { reason: repairEligibilityMessage(repairEligibility.reason) })} onClick={() => setReportOpen(true)} disabled={runtimeMode ? !canRepair : false}>{t("actions.authorizeRepair")}</button>
          <button type="button" onClick={runtimeMode ? cancelRuntimeOperation : undefined} disabled={!runtimeMode || !operationBusy || !runtimeController?.capabilities.cancelOperation}>{t("actions.cancel")}</button>
          {runtimeMode ? <><button type="button" onClick={() => runRuntimeAction(() => runtimeController.openLogs(), "logs")} disabled={!runtimeController?.capabilities.openLogs}>{t("actions.openLogs")}</button><button type="button" onClick={requestSupportBundle} disabled={!runtimeController?.capabilities.exportSupportBundle}>{t("actions.exportSupportBundle")}</button></> : null}
          {!runtimeMode ? <button type="button" className="result-action" onClick={() => { setScreen("result"); setFlowState("ResultReady"); setProgress(100); }}>{t("actions.previewResult")}</button> : null}
          <button type="button" className="gpt-action" disabled={runtimeMode && !runtimeController?.capabilities.openGPT} onClick={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : null}>{t("actions.openGpt")}{runtimeMode && !runtimeController?.capabilities.openGPT ? t("common.unavailableSuffix") : ""}</button>
        </div>
      </footer>
      {gamesOpen ? <GameCenter onClose={() => setGamesOpen(false)} onGameActiveChange={setGameActive} appearanceClass={`palette-${paletteClass} material-${mix.material}`} appearanceStyle={glassStyle} /> : null}
      {reportOpen ? <RepairReport onClose={() => setReportOpen(false)} report={runtimeReport} runtimeMode={runtimeMode} canRepair={canRepair} canOpenGPT={Boolean(runtimeController?.capabilities.openGPT)} onConfirmRepair={startRuntimeRepair} onOpenGPT={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : setReportOpen(false)} /> : null}
      {socialOpen ? <SocialFeed onClose={() => setSocialOpen(false)} runtimeMode={runtimeMode} runtimeController={runtimeController} settings={settings} appearanceClass={`palette-${paletteClass} material-${mix.material}`} appearanceStyle={glassStyle} /> : null}
      {supportBundleOpen ? <SupportBundleDialog onClose={() => { if (!supportBundleBusy) setSupportBundleOpen(false); }} onConfirm={confirmSupportBundle} busy={supportBundleBusy} /> : null}
      <SettingsCenter open={settingsOpen} onClose={() => setSettingsOpen(false)} scheme={scheme} onSchemeChange={onSchemeChange} mix={mix} setMix={setMix} settings={settings} setSettings={setSettings} onRestoreDefaults={onRestoreDefaults} onExportConfig={onExportConfig} onImportConfig={onImportConfig} runtimeMode={runtimeMode} bridgeAvailable={bridgeAvailable} runtimeSettingsHydrated={runtimeSettingsHydrated} runtimeSettingsError={runtimeSettingsError}/>
    </div>
  );
}
