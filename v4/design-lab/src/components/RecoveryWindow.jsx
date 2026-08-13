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

const activeStageByFlow = {
  Diagnosing: 0,
  ReportReady: 1,
  AwaitingDecision: 2,
  Repairing: 3,
  ResultReady: 4,
};

function StageRail({ flowState, progress, reduceMotion }) {
  const engineIndex = flowState === "ResultReady" ? 5 : (activeStageByFlow[flowState] ?? -1);
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
    <aside className="stage-rail" aria-label="诊断 1 到 5 阶段，真实状态与呈现状态分离">
      <div className="rail-heading"><span>诊断阶段</span><small>ENGINE {engineIndex < 0 ? "WAIT" : engineIndex} · PRESENTED {presentedIndex < 0 ? "WAIT" : presentedIndex}</small></div>
      <ol>
        {diagnosticStages.map((stage, index) => {
          let state = index < presentedIndex ? "done" : index === presentedIndex && presentedIndex < 5 ? "active" : "waiting";
          if (index === presentedIndex && transitionPhase === "completing") state = "completing";
          if (index === presentedIndex && transitionPhase === "activating") state = "activating";
          const localProgress = state === "done" ? 1 : state === "active" ? Math.max(0.16, Math.min(0.98, (progress % 20) / 20 + 0.16)) : 0;
          const stateLabel = state === "done" ? "已完成" : state === "completing" ? "收束完成" : state === "activating" ? "正在进入" : state === "active" ? "进行中" : "等待中";
          return (
            <li key={stage.id} className={`stage-${state}`} data-interaction="status-driven" title="由流程状态与全局进度驱动，不是导航或修复按钮">
              <StageProgressOrbit index={stage.id} state={state === "completing" ? "active" : state === "activating" ? "active" : state} progress={state === "completing" ? 1 : state === "activating" ? 0.35 : localProgress} reduceMotion={reduceMotion} />
              <div><strong>{stage.title}</strong><small>{stateLabel} · {stage.detail}</small></div>
            </li>
          );
        })}
      </ol>
      <p className="stage-interaction-note">engineStageState → presentedStageState 有界缓冲；数字、环绕动画与三态语义保持。</p>
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
  const [filter, setFilter] = useState("all");
  const [followPaused, setFollowPaused] = useState(false);
  const categories = useMemo(() => ["all", ...new Set(logs.map((line) => line.category))], [logs]);
  const visibleLogs = useMemo(() => filter === "all" ? logs : logs.filter((line) => line.category === filter), [filter, logs]);
  return (
    <section className="terminal-panel" aria-label="实时终端与结构化日志">
      <header>
        <div><span className="terminal-lamp" /><strong>实时终端</strong><small>结构化证据流</small></div>
        <div className="terminal-tools">
          <span className="log-cap">{logs.length} / {limit} · 批次渲染</span>
          <select aria-label="日志类别筛选" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {categories.map((category) => <option key={category} value={category}>{category === "all" ? "全部类别" : category}</option>)}
          </select>
          <button type="button" aria-pressed={followPaused} onClick={() => setFollowPaused((value) => !value)}>{followPaused ? "恢复跟随" : "暂停跟随"}</button>
        </div>
      </header>
      <div className="terminal-log-area">
        <div className="terminal-columns" aria-hidden="true"><span>时间</span><span>级别</span><span>组件 / 类别</span><span>证据 / 影响 / 动作</span><span>结果</span></div>
        <div className="terminal-scroll" aria-live="polite">
          {visibleLogs.map((line, index) => (
            <div className={`log-line log-${line.type.toLowerCase()}`} key={`${line.time}-${index}`}>
              <time>{line.time}</time>
              <span className="log-type">{line.type}</span>
              <span className="log-category">{line.category}</span>
              <p className="log-message" title={line.message}>{renderLogMessage(line.message)}{Array.isArray(line.details) ? line.details.map((detail, detailIndex) => <span className={`log-detail token-${detail.kind}`} key={`${detail.kind}-${detailIndex}`}>{detail.value}</span>) : null}</p>
              <span className={`log-result ${line.result ? "has-result" : "is-empty"}`}>{line.result || "—"}</span>
            </div>
          ))}
        </div>
      </div>
      <footer><span>故障类别</span><span>证据</span><span>GitHub 映射</span><span>风险</span><span>修复阶段</span><b>完整日志仍在文件</b></footer>
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

function runtimeLog(entry) {
  const type = String(entry?.level ?? entry?.type ?? "info").toUpperCase();
  const date = new Date(entry?.timestamp ?? entry?.time ?? Date.now());
  return {
    time: Number.isNaN(date.getTime()) ? "--:--:--" : date.toLocaleTimeString("zh-CN", { hour12: false }),
    type,
    category: String(entry?.category ?? entry?.component ?? entry?.scope ?? "runtime"),
    message: String(entry?.message ?? entry?.text ?? entry?.detail ?? ""),
    result: String(entry?.result ?? entry?.outcome ?? ""),
    details: [
      ["path", entry?.path],
      ["hash", entry?.hash ?? entry?.sha256],
      ["command", entry?.command],
      ["version", entry?.version],
    ].filter(([, value]) => typeof value === "string" && value.length > 0).map(([kind, value]) => ({ kind, value })),
  };
}

const repairEligibilityLabels = {
  "start-repair-unavailable": "运行时未提供 startRepair",
  "engine-events-unavailable": "运行时未提供 onEngineEvent",
  "real-repair-disabled": "真实修复能力未启用",
  "no-current-worker-report": "本次 Worker 生命周期内没有当前报告",
  "invalid-report-contract": "当前报告不符合冻结契约",
  "report-id-mismatch": "报告 ID 已失效或不匹配",
  "report-expired": "当前报告已过期",
  "report-only": "报告仅供展示，没有建议修复项",
  "runtime-unavailable": "运行时桥接不可用",
};

function DiagnosisBrief({ flowState, report, runtimeMode }) {
  const summary = issueSummary(report);
  const reportTitle = summary.first ? `${summary.first.category} · 已生成结构化证据` : runtimeMode ? "等待本机只读诊断" : "WB-CHR-011 · Chrome 桥接偏差";
  return (
    <section className="diagnosis-brief" aria-label="诊断决策信息">
      <header><div><span className="brief-kicker">当前报告</span><strong>{reportTitle}</strong></div><b>{flowState}</b></header>
      <div className="brief-facts">
        <article><span>发现</span><strong>{report ? `${summary.issues.length} 项` : runtimeMode ? "尚未诊断" : "1 项偏差"}</strong><p>{summary.first?.evidence?.[0] || (runtimeMode ? "点击只读诊断获取本机证据" : "本机桥接版本与目标清单不一致")}</p></article>
        <article><span>影响</span><strong>{summary.first?.risk ? `${summary.first.risk} 风险` : "等待判定"}</strong><p>{summary.first?.impact || "Browser、Chrome、Computer Use 分别判定"}</p></article>
        <article><span>拟动作</span><strong>{summary.repairable.length ? `${summary.repairable.length} 项可建议修复` : "无自动写入"}</strong><p>{summary.first?.plannedActions?.join(" → ") || "先报告，再由用户决定"}</p></article>
      </div>
    </section>
  );
}

function DecisionSummary({ flowState, actualProgress, indeterminate, report, runtimeMode }) {
  const summary = issueSummary(report);
  return (
    <aside className="decision-summary" aria-label="诊断决策摘要">
      <header><span>诊断决策摘要</span><b>{flowState === "AwaitingDecision" ? "等待用户" : runtimeMode ? "本机状态" : "只读演示"}</b></header>
      <dl>
        <div><dt>问题</dt><dd>{report ? `${summary.issues.length} 项` : "待诊断"}</dd></div>
        <div><dt>最高风险</dt><dd className="semantic-warn">{summary.highestRisk}</dd></div>
        <div><dt>拟写入范围</dt><dd>{summary.writeScopeCount} 处</dd></div>
        <div><dt>可信进度</dt><dd>{actualProgress}%</dd></div>
      </dl>
      <p>{indeterminate ? "长步骤暂无精确百分比，保持最后可信值。" : summary.repairable.length ? "存在允许建议修复的类别；仍需用户在报告中明确确认。" : "没有允许自动修复的类别，可直接打开 GPT 或查看日志。"}</p>
    </aside>
  );
}

function RepairReport({ onClose, report, runtimeMode, canRepair, canOpenGPT, onConfirmRepair, onOpenGPT }) {
  const summary = issueSummary(report);
  const issueFields = summary.issues.flatMap((issue, index) => {
    const knownIssue = typeof issue?.knownIssue === "string"
      ? issue.knownIssue
      : issue?.knownIssue ? JSON.stringify(issue.knownIssue) : "无";
    const confidence = Number.isFinite(issue?.confidence) ? `${Math.round(issue.confidence * 100)}%` : "未提供";
    const prefix = `问题 ${index + 1}`;
    return [
      [prefix, issue?.category ?? "未分类"],
      [`${prefix} · 证据`, issue?.evidence?.join("；") || "未提供"],
      [`${prefix} · 影响`, issue?.impact || "未提供"],
      [`${prefix} · 拟动作`, issue?.plannedActions?.join(" → ") || "无写入动作"],
      [`${prefix} · 风险`, issue?.risk || "unknown"],
      [`${prefix} · 写入范围`, issue?.writeScope?.join("；") || "无"],
      [`${prefix} · 门槛`, `可跳过：${issue?.canSkip === true ? "是" : "否"}；需重启：${issue?.requiresRestart === true ? "是" : "否"}；置信度：${confidence}`],
      [`${prefix} · 已知问题`, knownIssue],
      [`${prefix} · 建议`, issue?.suggestionMode ?? "无"],
    ];
  });
  const fields = report ? [
    ["报告", report.reportId],
    ...issueFields,
    ["有效期", report.expiresAt],
  ] : [
    ["状态", runtimeMode ? "尚未生成本机诊断报告" : "概念演示报告"],
    ["下一步", "先运行只读诊断，再决定是否修复。"],
  ];
  return (
    <div className="inner-modal-backdrop">
      <section className="repair-report" role="dialog" aria-modal="true" aria-label="修复前报告">
        <header><div><Icon name="shield" size={18}/><div><strong>ShowReport · 修复前说明</strong><span>当前状态：{runtimeMode && !canRepair ? "只读审计 / 不可提交" : "AwaitingDecision"}</span></div></div><button type="button" aria-label="关闭修复说明" onClick={onClose}><Icon name="close" size={16}/></button></header>
        <div className="repair-report-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</div>
        <div className="report-freeze"><b>{runtimeMode ? "受控修复门槛" : "A 类冻结"}</b><span>{runtimeMode ? "只有当前、未过期且属于允许类别的报告，才能进入未修改的 3.1.1 修复序列。" : "此概念站不执行插件写入、注册、备份或更新。"}</span></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>返回等待</button><button type="button" className="secondary-button" disabled={runtimeMode && !canOpenGPT} onClick={onOpenGPT}>跳过修复 · 打开 GPT{runtimeMode && !canOpenGPT ? "（不可执行）" : ""}</button>{runtimeMode ? <button type="button" className="primary-button" disabled={!canRepair} onClick={onConfirmRepair}>{canRepair ? "确认并开始受控修复" : "当前报告不可修复"}</button> : null}</footer>
      </section>
    </div>
  );
}

function PluginPanel({ pluginColors = ["#4de0a2", "#ffc05b", "#58b7ff"], visibility = {}, runtimeMode = false }) {
  return (
    <aside className="plugin-panel" aria-label="Browser、Chrome、Computer Use 独立状态">
      <header><span>插件状态</span><small>独立证据，不聚合</small></header>
      <div className="plugin-list">
        {pluginStates.map((plugin, index) => (
          <article key={plugin.id} className={`plugin-card tone-${runtimeMode ? "neutral" : plugin.tone} ${visibility[plugin.id] === false ? "is-summary-only" : ""}`} style={{ "--plugin-identity": pluginColors[index] ?? ["#4de0a2", "#ffc05b", "#58b7ff"][index] }}>
            <div className="plugin-icon"><OfficialPluginIcon pluginId={plugin.id} color={pluginColors[index] ?? ["#4de0a2", "#ffc05b", "#58b7ff"][index]} /></div>
            <div className="plugin-copy"><strong>{plugin.name}</strong><span>{runtimeMode ? "等待只读诊断" : plugin.state}</span><small>{runtimeMode ? "图标可用性不代表插件健康状态" : plugin.evidence}</small></div>
            <div className="plugin-risk"><span>风险</span><b>{runtimeMode ? "待报告" : plugin.risk}</b></div>
          </article>
        ))}
      </div>
      <div className="plugin-evidence-note"><Icon name="shield" size={15} /><span>静态、连接、真实交互分开判定</span></div>
    </aside>
  );
}

const SOCIAL_ACCOUNTS = Object.freeze({
  tibo: { displayName: "Tibo", handle: "@tibo" },
  openai: { displayName: "OpenAI", handle: "@OpenAI" },
  chatgpt: { displayName: "ChatGPT", handle: "@ChatGPTapp" },
});

const CONCEPT_SOCIAL_POSTS = Object.freeze([
  { postId: "concept-tibo-1", account: "tibo", ageHours: 1, text: "正在把恢复工具的每一步决定做得更清楚、更可逆。" },
  { postId: "concept-openai-1", account: "openai", ageHours: 6, text: "这是用于 WinBridge 概念预览的本地示例帖子，不来自网络。" },
  { postId: "concept-chatgpt-1", account: "chatgpt", ageHours: 19, text: "本地 mock 用于展示只读时间线、翻译状态和受控原帖入口。" },
  { postId: "concept-tibo-2", account: "tibo", ageHours: 34, text: "诊断先行，修复动作始终交给用户决定。" },
]);

const safeAvatarDataUrl = (value) => typeof value === "string" && /^data:image\/(png|webp|jpeg);base64,/.test(value) ? value : null;

function normalizeSocialPost(post, index) {
  const account = Object.hasOwn(SOCIAL_ACCOUNTS, post?.account) ? post.account : null;
  const postId = String(post?.postId ?? post?.id ?? "");
  if (!account || !postId) return null;
  return {
    postId,
    account,
    displayName: String(post?.displayName || SOCIAL_ACCOUNTS[account].displayName),
    handle: String(post?.handle || SOCIAL_ACCOUNTS[account].handle),
    createdAt: String(post?.createdAt || ""),
    text: String(post?.text || ""),
    avatarDataUrl: safeAvatarDataUrl(post?.avatarDataUrl),
    order: index,
  };
}

function SocialFeed({ onClose, runtimeMode, runtimeController, settings, appearanceClass = "", appearanceStyle }) {
  const [feedState, setFeedState] = useState({ status: "loading", reason: "", posts: [], cacheAgeSeconds: null, degraded: false });
  const [translations, setTranslations] = useState({});
  const [openStatus, setOpenStatus] = useState({});
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
      setFeedState({ status: "disabled", reason: "社交动态已在设置中关闭。", posts: [], cacheAgeSeconds: null, degraded: false });
      return () => { active = false; };
    }
    if (accountIds.length === 0) {
      setFeedState({ status: "disabled", reason: "请至少启用一个账户。", posts: [], cacheAgeSeconds: null, degraded: false });
      return () => { active = false; };
    }
    setFeedState({ status: "loading", reason: "", posts: [], cacheAgeSeconds: null, degraded: false });
    if (!runtimeMode) {
      const posts = CONCEPT_SOCIAL_POSTS
        .filter((post) => accountIds.includes(post.account) && post.ageHours <= hours)
        .map((post) => ({ ...post, createdAt: new Date(Date.now() - post.ageHours * 60 * 60 * 1000).toISOString() }))
        .slice(0, maxPosts)
        .map(normalizeSocialPost)
        .filter(Boolean);
      setFeedState({ status: "ready", reason: "本地 mock 演示", posts, cacheAgeSeconds: 0, degraded: false });
      return () => { active = false; };
    }
    if (!runtimeController?.capabilities.getSocialFeed) {
      setFeedState({ status: "unavailable", reason: "此页面暂时不可访问", posts: [], cacheAgeSeconds: null, degraded: false });
      return () => { active = false; };
    }
    runtimeController.getSocialFeed({ accounts: accountIds, maxPosts, hours, locale, useJinaFallback: settings.socialUseJinaFallback === true })
      .then((payload) => {
        if (!active) return;
        if (payload?.available !== true) {
          setFeedState({ status: "unavailable", reason: "此页面暂时不可访问", posts: [], cacheAgeSeconds: Number.isFinite(payload?.cacheAgeSeconds) ? payload.cacheAgeSeconds : null, degraded: payload?.degraded === true });
          return;
        }
        const posts = (Array.isArray(payload.posts) ? payload.posts : []).slice(0, maxPosts).map(normalizeSocialPost).filter(Boolean);
        setFeedState({ status: "ready", reason: String(payload?.reason || ""), posts, cacheAgeSeconds: Number.isFinite(payload?.cacheAgeSeconds) ? payload.cacheAgeSeconds : null, degraded: payload?.degraded === true });
      })
      .catch(() => { if (active) setFeedState({ status: "unavailable", reason: "此页面暂时不可访问", posts: [], cacheAgeSeconds: null, degraded: false }); });
    return () => { active = false; };
  }, [runtimeMode, runtimeController, settings.socialEnabled, settings.socialUseJinaFallback, locale, hours, maxPosts, accountIds.join("|")]);

  const translatePost = async (post) => {
    setTranslations((current) => ({ ...current, [post.postId]: { status: "loading", text: "" } }));
    if (!runtimeMode) {
      setTranslations((current) => ({ ...current, [post.postId]: { status: "ready", text: `[${locale}] 本地 mock 翻译：${post.text}` } }));
      return;
    }
    if (!runtimeController?.capabilities.translateSocialPost) {
      setTranslations((current) => ({ ...current, [post.postId]: { status: "error", text: "翻译服务暂时不可用" } }));
      return;
    }
    try {
      const result = await runtimeController.translateSocialPost({ postId: post.postId, targetLocale: locale });
      if (!aliveRef.current) return;
      setTranslations((current) => ({ ...current, [post.postId]: result?.available === true && result?.text ? { status: "ready", text: String(result.text) } : { status: "error", text: "翻译服务暂时不可用" } }));
    } catch {
      if (!aliveRef.current) return;
      setTranslations((current) => ({ ...current, [post.postId]: { status: "error", text: "翻译服务暂时不可用" } }));
    }
  };

  const openPost = async (post) => {
    if (!runtimeMode) {
      setOpenStatus((current) => ({ ...current, [post.postId]: "概念态不打开外部页面" }));
      return;
    }
    if (!runtimeController?.capabilities.openSocialPost) {
      setOpenStatus((current) => ({ ...current, [post.postId]: "原帖暂时不可打开" }));
      return;
    }
    try {
      await runtimeController.openSocialPost({ postId: post.postId });
      if (!aliveRef.current) return;
      setOpenStatus((current) => ({ ...current, [post.postId]: "已交由系统打开" }));
    } catch {
      if (!aliveRef.current) return;
      setOpenStatus((current) => ({ ...current, [post.postId]: "原帖暂时不可打开" }));
    }
  };

  return createPortal(
    <div className={`inner-modal-backdrop ${appearanceClass}`} style={appearanceStyle}>
      <section className="social-feed-dialog" role="dialog" aria-modal="true" aria-label="看看他社交动态">
        <header><div><MenuGlyph name="observe" size={18}/><div><strong>看看他</strong><span>{runtimeMode ? "只读社交动态" : "本地 mock 演示 · 非网络内容"}</span></div></div><button type="button" aria-label="关闭看看他" onClick={onClose}><Icon name="close" size={16}/></button></header>
        <div className="social-feed-meta"><span>最近 {hours} 小时</span><span>最多 {maxPosts} 条</span><span>目标语言 {locale}</span>{Number.isFinite(feedState.cacheAgeSeconds) ? <span>缓存 {Math.max(0, Math.round(feedState.cacheAgeSeconds))} 秒</span> : null}{feedState.degraded ? <span>降级只读来源</span> : null}<b>不影响诊断或修复</b></div>
        <div className="social-feed-scroll">
          {feedState.status === "loading" ? <div className="social-feed-empty"><strong>正在获取只读动态…</strong><span>主窗口与设置不受阻塞</span></div> : null}
          {["disabled", "unavailable"].includes(feedState.status) ? <div className="social-feed-empty"><strong>{feedState.reason}</strong><span>{feedState.status === "disabled" ? "可在更多设置 → 社交动态中调整" : "入口仍可关闭，诊断与修复不受影响"}</span></div> : null}
          {feedState.status === "ready" && feedState.posts.length === 0 ? <div className="social-feed-empty"><strong>时间范围内没有可展示的动态</strong><span>不会自动扩大时间范围</span></div> : null}
          {feedState.posts.map((post) => {
            const translation = translations[post.postId];
            return <article className="social-post" key={post.postId} dir={locale === "ar" ? "rtl" : "ltr"}>
              <div className="social-avatar">{post.avatarDataUrl ? <img src={post.avatarDataUrl} alt="" /> : <span>{post.displayName.slice(0, 1).toUpperCase()}</span>}</div>
              <div className="social-post-body"><header><strong>{post.displayName}</strong><span>{post.handle}</span><time>{post.createdAt ? new Date(post.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "时间未知"}</time></header><p>{post.text}</p>{translation ? <div className={`social-translation is-${translation.status}`}>{translation.status === "loading" ? "正在翻译…" : translation.text}</div> : null}<footer><button type="button" disabled={translation?.status === "loading"} onClick={() => translatePost(post)}>翻译为 {locale}</button><button type="button" onClick={() => openPost(post)}>查看原帖 ↗</button>{openStatus[post.postId] ? <span>{openStatus[post.postId]}</span> : null}</footer></div>
            </article>;
          })}
        </div>
      </section>
    </div>,
    document.body
  );
}

function ResultPage({ onBack, onOpenLogs, onOpenGPT, runtimeMode, canOpenLogs, canOpenGPT, report, repairResult }) {
  const summary = issueSummary(report);
  const firstIssue = summary.first;
  const runtimeCards = [
    ["诊断前", report ? `${summary.issues.length} 项报告` : "报告未提供", firstIssue?.category ?? "无可展示类别"],
    ["执行动作", firstIssue?.plannedActions?.length ? `${firstIssue.plannedActions.length} 个受控动作` : "以运行时日志为准", firstIssue?.plannedActions?.join(" → ") || "未从报告声明动作"],
    ["诊断后", repairResult?.finalVerificationPassed === true ? "最终核验通过" : "未确认", repairResult?.operationId ? `操作 ${repairResult.operationId}` : "等待受控结果"],
    ["未解决项", "未由契约单独返回", "请从完整日志与后续只读诊断核对"],
  ];
  const conceptCards = [
    ["诊断前", "1 项偏差", "Chrome 桥接版本不一致"],
    ["执行动作", "4 个顺序步骤", "备份 → 替换 → 注册 → 核验"],
    ["诊断后", "静态一致", "运行时仍需总控真实验收"],
    ["未解决项", "1 项", "Computer Use 辅助传输待核验"],
  ];
  const cards = runtimeMode ? runtimeCards : conceptCards;
  return (
    <section className="result-page" aria-label={runtimeMode ? "受控修复结果页" : "修复结果页概念"}>
      <header className="result-hero"><span className="result-icon"><Icon name="check" size={24}/></span><div><small>{runtimeMode ? "受控修复结果 · 不自动退出" : "结果页概念 · 不自动退出"}</small><h3>修复流程已结束，等待用户查看结果</h3><p>本页持续保留，除非用户主动关闭或已明确开启“修复完成后自动关闭”。</p></div></header>
      <div className="result-summary-grid">
        {cards.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
      </div>
      <div className="result-details">
        <div><h4>发现的问题</h4><p>{runtimeMode ? (firstIssue?.impact || "本轮报告未提供问题影响说明。") : "Chrome 本机桥接版本与目标清单不同，可能造成连接超时。"}</p></div>
        <div><h4>执行结果</h4><p>{runtimeMode ? (repairResult?.finalVerificationPassed === true ? "运行时返回 finalVerificationPassed=true；页面保持停留供用户核对。" : "未收到合规的最终核验结果，不推断成功。") : "此处仅为信息架构演示；概念站未执行真实替换、注册或核验。"}</p></div>
        <div><h4>证据与日志</h4><p>{runtimeMode ? "完整证据由运行时有界事件和应用日志保留；UI 不读取或展示本地路径。" : "保留修复前后哈希、操作阶段、风险和 GitHub 已知问题映射入口。"}</p></div>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onBack}>返回诊断页</button><button type="button" className="secondary-button" disabled={runtimeMode && !canOpenLogs} onClick={onOpenLogs}>打开完整日志{runtimeMode ? (canOpenLogs ? "" : "（不可执行）") : "（概念）"}</button><button type="button" className="primary-button" disabled={runtimeMode && !canOpenGPT} onClick={onOpenGPT}>直接打开 GPT{runtimeMode ? (canOpenGPT ? "" : "（不可执行）") : "（概念）"}</button></footer>
    </section>
  );
}

export default function RecoveryWindow({ scheme, onSchemeChange, mix, setMix, settings, setSettings, progress, setProgress, onRestoreDefaults, onExportConfig, onImportConfig, runtimeMode = false, bridgeAvailable = false, runtimeSettingsHydrated = false, runtimeSettingsError = "" }) {
  const [gearOpen, setGearOpen] = useState(!runtimeMode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  // Future auto-close integration: suppress window close while this local game surface is active.
  const [gameActive, setGameActive] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
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
        setRuntimeError(`运行时能力信息不可用：${message}`);
        setLogs((current) => [...current, runtimeLog({ level: "warn", category: "runtime", message: `运行时能力信息不可用：${message}` })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
      });
    } else {
      setRuntimeError("当前运行时未提供 getAppInfo；真实修复保持禁用。 ");
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "runtime", message: "当前运行时未提供 getAppInfo；真实修复保持禁用。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    const initialReport = controller.capabilities.getDiagnosisReport ? Promise.resolve().then(() => controller.getDiagnosisReport()) : Promise.resolve(null);
    if (!controller.capabilities.getDiagnosisReport) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "report", message: "当前运行时未提供 getDiagnosisReport；报告查看与修复保持禁用。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.onEngineEvent) {
      setRuntimeError("当前运行时未提供 onEngineEvent；真实修复保持禁用。 ");
      setLogs((current) => [...current, runtimeLog({ level: "error", category: "runtime", message: "当前运行时未提供 onEngineEvent；真实修复保持禁用。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.onLogBatch) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "logs", message: "当前运行时未提供 onLogBatch；仅显示 UI 自身状态消息。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    if (!controller.capabilities.getSettings || !controller.capabilities.saveSettings) {
      setLogs((current) => [...current, runtimeLog({ level: "warn", category: "settings", message: "原生设置接口不完整；当前仅保留渲染层 localStorage 降级。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
    }
    initialReport.then((report) => {
      if (!active) return;
      setRuntimeReport(report);
      if (report) setFlowState("AwaitingDecision");
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
        const message = normalized.message || (normalized.cancelled ? "操作已取消" : "操作失败");
        setRuntimeError(message);
        setLogs((current) => [...current, runtimeLog({ level: normalized.cancelled ? "warn" : "error", category: "runtime", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
        setOperationBusy(false);
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
            setLogs((current) => [...current, runtimeLog({ level: "info", category: "diagnosis", message: "只读诊断终态已确认；报告决策状态由本次 runDiagnosis 返回的 Worker 内存报告驱动。" })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
          } else {
            const message = "诊断收到 ResultReady，但诊断终态核验未通过；不进入报告决策状态。";
            setRuntimeError(message);
            setLogs((current) => [...current, runtimeLog({ level: "error", category: "diagnosis", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
          }
          operationKindRef.current = null;
          return;
        }
        if (operationKind === "repair") {
          if (normalized.verified) {
            setProgress(100);
            setFlowState("ResultReady");
            setScreen("result");
          } else {
            const message = "修复收到 ResultReady，但最终核验门槛未满足；不进入修复结果页。";
            setRuntimeError(message);
            setLogs((current) => [...current, runtimeLog({ level: "error", category: "verification", message })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
            setFlowState("AwaitingDecision");
          }
          operationKindRef.current = null;
          return;
        }
        setProgress((current) => Math.min(current, 99));
        const message = "收到无法归属到当前诊断或修复操作的 ResultReady；未推断修复成功。";
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
      const dropped = Number(batch.droppedBeforeBatch) > 0
        ? [runtimeLog({ level: "warn", category: "logs", message: `为控制内存，已丢弃更早的 ${Number(batch.droppedBeforeBatch)} 条日志。` })]
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
    if (!runtimeSettingsError || runtimeSettingsError === lastSettingsErrorRef.current) return;
    lastSettingsErrorRef.current = runtimeSettingsError;
    setRuntimeError(`设置同步失败：${runtimeSettingsError}`);
    setLogs((current) => [...current, runtimeLog({ level: "error", category: "settings", message: `设置同步失败：${runtimeSettingsError}` })].slice(-Math.max(40, Number(logLimitRef.current) || 80)));
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
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    scanTimersRef.current.forEach((timer) => clearTimeout(timer));
    setDemoSession((current) => current + 1);
    setScreen("diagnosis");
    setFlowState("Diagnosing");
    setProgressMode("determinate");
    setProgress(18);
    setLogs((current) => [...current.slice(-10), { time: stamp, type: "INFO", category: "模拟", message: "刷新只读诊断摘要；未执行任何写入。" }]);
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
      if (!runtimeController) throw new Error("Runtime bridge is unavailable.");
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(message);
      appendRuntimeMessage("error", category, message);
      return null;
    }
  };

  const cancelRuntimeOperation = async () => {
    if (!runtimeController?.capabilities.cancelOperation) {
      const message = "当前运行时未提供 cancelOperation。";
      setRuntimeError(message);
      appendRuntimeMessage("warn", "runtime", message);
      return;
    }
    const result = await runRuntimeAction(() => runtimeController.cancelOperation(), "runtime");
    if (result?.cancelled === false) {
      setOperationBusy(false);
      operationKindRef.current = null;
      appendRuntimeMessage("info", "runtime", "运行时确认当前没有可取消的活动操作。 ");
    } else if (result?.cancelled === true) {
      appendRuntimeMessage("warn", "runtime", "取消请求已接受，等待 Cancelled 终态事件。 ");
    }
  };

  const runRuntimeDiagnosis = async () => {
    if (!runtimeController?.capabilities.runDiagnosis || operationBusy) {
      const message = operationBusy ? "当前已有受控操作正在执行。" : "当前运行时未提供只读诊断能力。";
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
    setRuntimeReport(null);
    setRuntimeRepairResult(null);
    setReportOpen(false);
    appendRuntimeMessage("info", "diagnosis", "开始只读诊断；当前阶段不会执行插件写入。 ");
    try {
      const report = await runtimeController.runDiagnosis();
      setRuntimeReport(report);
      if (report) {
        setFlowState("AwaitingDecision");
        setReportOpen(true);
      } else {
        setFlowState("ReportReady");
        appendRuntimeMessage("warn", "diagnosis", "诊断完成，但未返回可展示的报告。 ");
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
      const message = "Runtime bridge is unavailable.";
      setRuntimeError(message);
      appendRuntimeMessage("error", "report", message);
      return;
    }
    if (runtimeReport) {
      setReportOpen(true);
      return;
    }
    if (!runtimeController.capabilities.getDiagnosisReport) {
      const message = "当前运行时未提供诊断报告读取能力。";
      setRuntimeError(message);
      appendRuntimeMessage("warn", "report", message);
      return;
    }
    try {
      const report = await runtimeController.getDiagnosisReport();
      setRuntimeReport(report);
      if (report) {
        setReportOpen(true);
        setFlowState("AwaitingDecision");
      } else {
        const message = "本次 Worker 生命周期内没有可用诊断报告；磁盘审计报告不能作为修复凭据。";
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
      const message = operationBusy ? "当前已有受控操作正在执行。" : `当前报告不可修复：${repairEligibilityLabels[reason] ?? reason}`;
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
    appendRuntimeMessage("warn", "repair", "用户已确认，开始受控修复；备份由冻结修复序列创建。 ");
    try {
      const result = await runtimeController.startRepair(runtimeReport.reportId);
      setRuntimeRepairResult(result);
      if (result?.finalVerificationPassed === true) {
        appendRuntimeMessage("info", "repair", "修复命令已返回最终核验通过；结果页仍以 ResultReady 终态事件为准。 ");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeError(message);
      appendRuntimeMessage("error", "repair", message);
      setFlowState("AwaitingDecision");
      setOperationBusy(false);
    }
  };

  const repairEligibility = runtimeController?.getRepairEligibility(runtimeReport?.reportId) ?? { allowed: false, reason: "runtime-unavailable" };
  const canRepair = Boolean(runtimeInfo.realRepairEnabled && repairEligibility.allowed && !operationBusy);

  return (
    <div className={`recovery-window layout-${scheme.id} material-${mix.material} palette-${paletteClass} density-${mix.density} geometry-${mix.geometry}`} data-testid="recovery-window" data-layout={scheme.id} data-material={mix.material} data-palette={mix.colorPreset} data-palette-base={paletteClass} data-game-active={gameActive ? "true" : "false"} style={glassStyle}>
      <header className="recovery-titlebar">
        <div className="product-title"><span className="product-mark">W</span><div><strong>WinBridge Recovery <b>4.0</b></strong><small>{runtimeMode ? (bridgeAvailable ? "桌面运行态 · 受控桥接已连接" : "桌面运行态预览 · 操作不可执行") : "预发布概念 · 不连接修复引擎"}</small></div></div>
        <div className="titlebar-runtime"><span className="architecture-chip">Electron UI · 独立 Worker</span></div>
        <div className="titlebar-safety"><span className="readonly-chip"><Icon name="shield" size={14}/>{operationBusy ? "操作受控执行中" : "写入锁定"}</span>{!runtimeMode ? <button type="button" aria-label="概念窗口关闭按钮（无操作）"><Icon name="close" size={15}/></button> : null}</div>
      </header>
      <div className="state-interface" aria-label="恢复协议状态接口">
        <span>状态接口</span>
        {recoveryStates.map((state, index) => <div key={state.id} className={`${flowState === state.id ? "is-current" : ""} ${state.write ? "is-write-state" : ""}`} aria-current={flowState === state.id ? "step" : undefined}><b>{state.id}</b><small>{state.label}</small>{index < recoveryStates.length - 1 ? <i>›</i> : null}</div>)}
      </div>
      <div className="recovery-body">
        <StageRail flowState={flowState} progress={progress} reduceMotion={settings.reduceMotion} />
        <main className="recovery-main">
          {screen === "result" ? <ResultPage runtimeMode={runtimeMode} report={runtimeReport} repairResult={runtimeRepairResult} canOpenLogs={Boolean(runtimeController?.capabilities.openLogs)} canOpenGPT={Boolean(runtimeController?.capabilities.openGPT)} onBack={() => { setDemoSession((current) => current + 1); if (!runtimeMode) { setProgress(68); setFlowState("AwaitingDecision"); } setScreen("diagnosis"); }} onOpenLogs={() => runtimeMode ? runRuntimeAction(() => runtimeController.openLogs(), "logs") : null} onOpenGPT={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : null} /> : <><DiagnosisBrief flowState={flowState} report={runtimeReport} runtimeMode={runtimeMode}/><TerminalPanel logs={logs} limit={Math.max(40, Number(settings.logLimit) || 80)} /></>}
        </main>
        <PluginPanel pluginColors={mix.pluginColors} visibility={settings.pluginVisibility} runtimeMode={runtimeMode} />
      </div>
      <section className="progress-action-zone">
        <div className="fluid-demo-column">
          <NebulaFluidProgress actualProgress={progress} channels={mix.channels} speed={mix.speed} reducedMotion={settings.reduceMotion} lowEndMode={settings.lowEndMode} indeterminate={progressMode === "indeterminate"} resultReady={flowState === "ResultReady"} sessionKey={demoSession} />
          {!runtimeMode ? <div className="progress-demo-controls">
            <label className="progress-slider"><span>actualProgress</span><input ref={progressSliderRef} aria-label="预览进度" type="range" min="0" max={flowState === "ResultReady" ? "100" : "99"} value={progress} onInput={(event) => updateActualProgress(event.currentTarget.value)} onChange={(event) => updateActualProgress(event.currentTarget.value)} onKeyDown={handleProgressKeyDown}/><b>{progress}%</b></label>
            <button type="button" className="demo-button" onClick={runVisualDemo} disabled={demoRunning}>{demoRunning ? "演示进行中…" : "自动演示缓冲动画"}</button>
            <button type="button" className={`mode-button ${progressMode === "indeterminate" ? "is-on" : ""}`} onClick={() => setProgressMode((current) => current === "indeterminate" ? "determinate" : "indeterminate")}>{progressMode === "indeterminate" ? "结束长步骤呼吸" : "模拟未知长步骤"}</button>
          </div> : runtimeError ? <div className="runtime-error" role="alert"><Icon name="shield" size={14}/><span>{runtimeError}</span></div> : null}
        </div>
        <DecisionSummary flowState={flowState} actualProgress={progress} indeterminate={progressMode === "indeterminate"} report={runtimeReport} runtimeMode={runtimeMode}/>
      </section>
      <section className="safety-strip" aria-label="安全边界信息条">
        <span><Icon name="shield" size={14}/>路径门槛 <code>%USERPROFILE%\.codex\plugins</code></span>
        <span>备份 <code>%LOCALAPPDATA%\WinBridge Recovery\Backups</code></span>
        <span>自动修复 <b>OFF</b></span>
        <span>修复后自动关闭 <b className={settings.autoCloseAfterRepair ? "is-on-text" : ""}>{settings.autoCloseAfterRepair ? "ON（用户已开启）" : "OFF（默认）"}</b></span>
      </section>
      <footer className="command-dock">
        <div className="gear-anchor" ref={gearRef}>
          {gearOpen ? (
            <div className="gear-menu" role="menu" aria-label="齿轮紧凑菜单">
              <button type="button" role="menuitem" onClick={() => { setGamesOpen(true); setThemeOpen(false); }}><MenuGlyph name="games" size={17}/><span><strong>小游戏</strong><small>Snake · Minesweeper</small></span><b>2</b></button>
              <button type="button" role="menuitem" onClick={() => setThemeOpen((value) => !value)}><MenuGlyph name="theme" size={17}/><span><strong>主题</strong><small>布局 × 材质 × 配色</small></span><b>›</b></button>
              <button type="button" role="menuitem" onClick={() => setSocialOpen(true)}><MenuGlyph name="observe" size={17}/><span><strong>看看他</strong><small>48 小时只读动态</small></span><b aria-hidden="true">↗</b></button>
              <button type="button" role="menuitem" onClick={() => setSettingsOpen(true)}><MenuGlyph name="settings" size={17}/><span><strong>更多设置</strong><small>完整设置中心</small></span><b>›</b></button>
              {themeOpen ? (
                <div ref={themePanelRef} className="theme-submenu quick-appearance" role="menu" aria-label="主题选择">
                  <span>布局</span><div className="quick-layout-list">{schemes.map((item) => <button type="button" key={item.id} className={scheme.id === item.id ? "is-selected" : ""} onClick={() => onSchemeChange(item)}>{item.name}</button>)}</div>
                  <span>材质</span><div><button type="button" className={mix.material === "glass" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "glass" }))}>Glass</button><button type="button" className={mix.material === "solid" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "solid" }))}>Solid</button></div>
                  <span>配色</span><div>{colorPresets.map((preset) => <button type="button" key={preset.id} className={mix.colorPreset === preset.id ? "is-selected" : ""} title={preset.name} onClick={() => applyColorPreset(setMix, preset.id)}><i style={{ background: preset.accent }}/></button>)}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          <button className="gear-button" type="button" aria-label="打开设置菜单" aria-expanded={gearOpen} onClick={() => setGearOpen((value) => !value)}><MenuGlyph name="settings" size={20}/></button>
        </div>
        <div className="command-status"><span>{flowState || "等待只读诊断"}</span><small>动画仅缓冲呈现，不影响真实状态</small></div>
        <div className="primary-actions">
          <button type="button" onClick={runtimeMode ? runRuntimeDiagnosis : simulateReadOnlyScan} disabled={runtimeMode && (!runtimeController?.capabilities.runDiagnosis || operationBusy)}>{runtimeMode && operationBusy ? "诊断/修复进行中…" : runtimeMode && !runtimeController?.capabilities.runDiagnosis ? "只读诊断（不可执行）" : "只读诊断"}</button>
          <button type="button" onClick={runtimeMode ? openRuntimeReport : () => { setReportOpen(true); setFlowState("AwaitingDecision"); }} disabled={runtimeMode && !runtimeReport && !runtimeController?.capabilities.getDiagnosisReport}>查看修复说明</button>
          <button type="button" disabled title="备份只在用户确认修复后由冻结修复序列创建">备份随修复创建</button>
          <button type="button" disabled title="当前 preload 契约不提供独立回滚命令">回滚不可单独执行</button>
          <button type="button" className="repair-action" title={!runtimeMode ? "打开概念报告并演示用户确认入口" : canRepair ? "打开报告并由用户再次确认" : `当前不可修复：${repairEligibilityLabels[repairEligibility.reason] ?? repairEligibility.reason}`} onClick={() => setReportOpen(true)} disabled={runtimeMode ? !canRepair : false}>用户决定修复</button>
          <button type="button" onClick={runtimeMode ? cancelRuntimeOperation : undefined} disabled={!runtimeMode || !operationBusy || !runtimeController?.capabilities.cancelOperation}>取消当前操作</button>
          {runtimeMode ? <button type="button" onClick={() => runRuntimeAction(() => runtimeController.openLogs(), "logs")} disabled={!runtimeController?.capabilities.openLogs}>打开日志</button> : null}
          {!runtimeMode ? <button type="button" className="result-action" onClick={() => { setScreen("result"); setFlowState("ResultReady"); setProgress(100); }}>预览结果页</button> : null}
          <button type="button" className="gpt-action" disabled={runtimeMode && !runtimeController?.capabilities.openGPT} onClick={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : null}>直接打开 GPT{runtimeMode && !runtimeController?.capabilities.openGPT ? "（不可执行）" : ""}</button>
        </div>
      </footer>
      {gamesOpen ? <GameCenter onClose={() => setGamesOpen(false)} onGameActiveChange={setGameActive} appearanceClass={`palette-${paletteClass} material-${mix.material}`} appearanceStyle={glassStyle} /> : null}
      {reportOpen ? <RepairReport onClose={() => setReportOpen(false)} report={runtimeReport} runtimeMode={runtimeMode} canRepair={canRepair} canOpenGPT={Boolean(runtimeController?.capabilities.openGPT)} onConfirmRepair={startRuntimeRepair} onOpenGPT={() => runtimeMode ? runRuntimeAction(() => runtimeController.openGPT(), "gpt") : setReportOpen(false)} /> : null}
      {socialOpen ? <SocialFeed onClose={() => setSocialOpen(false)} runtimeMode={runtimeMode} runtimeController={runtimeController} settings={settings} appearanceClass={`palette-${paletteClass} material-${mix.material}`} appearanceStyle={glassStyle} /> : null}
      <SettingsCenter open={settingsOpen} onClose={() => setSettingsOpen(false)} scheme={scheme} onSchemeChange={onSchemeChange} mix={mix} setMix={setMix} settings={settings} setSettings={setSettings} onRestoreDefaults={onRestoreDefaults} onExportConfig={onExportConfig} onImportConfig={onImportConfig} runtimeMode={runtimeMode} bridgeAvailable={bridgeAvailable} runtimeSettingsHydrated={runtimeSettingsHydrated} runtimeSettingsError={runtimeSettingsError}/>
    </div>
  );
}
