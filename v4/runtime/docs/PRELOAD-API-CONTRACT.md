# WinBridge Runtime preload API contract v1

## Social feed API addendum (frozen names for this integration round)

These three methods are formal members of `window.winBridgeApi`. UI must feature-detect the bridge object, but must not guess method names or IPC channels dynamically.

### `getSocialFeed(options = {})`

Accepted keys only:

```ts
{
  accounts?: Array<"tibo" | "openai" | "chatgpt">; // unique, 1..3
  maxPosts?: number;                                  // integer, 1..10; default 4
  hours?: number;                                     // integer, 24..72; default 48
  useJinaFallback?: boolean;
  locale?: "zh" | "en" | "fr" | "es" | "ru" | "ar";
}
```

The request accepts no URL, host, path, header, query, body, or account handle. A returned post must have a strictly parsed canonical UTC `publishedAt`, must not be marked `timeUnconfirmed`, must be at or after the selected window start, and must not be more than five minutes ahead of the local clock. The fixed five-minute ceiling exists only for minor publisher/local clock skew. Missing, invalid, unconfirmed, old, or farther-future records are excluded and are never backfilled merely to reach a minimum count.

Return value conforms to `schemas/social-feed.schema.json`:

```ts
{
  schemaVersion: 1;
  available: boolean;
  degraded: boolean;
  reason: null | "disabled" | "temporarily-unavailable" |
          "partial-online-result" | "cached-after-online-failure";
  fetchedAt: string | null;
  cacheAgeSeconds: number | null;
  locale: "zh" | "en" | "fr" | "es" | "ru" | "ar" | null;
  failedAccounts: Array<"tibo" | "openai" | "chatgpt">;
  posts: Array<{
    postId: string;
    account: "tibo" | "openai" | "chatgpt";
    displayName: "Tibo" | "OpenAI" | "ChatGPT";
    handle: "thsottiaux" | "OpenAI" | "ChatGPT";
    text: string;
    link: string;
    publishedAt: string; // canonical YYYY-MM-DDTHH:mm:ss.sssZ
    timeUnconfirmed: false;
    source: "xxu-rss" | "rsshub" | "jina";
    avatarDataUrl?: string;
  }>;
}
```

`available=false, reason="disabled"` is a normal settings result. `available=false, reason="temporarily-unavailable"` is the non-blocking no-cache fallback. A cached result uses `degraded=true`, `reason="cached-after-online-failure"`, and reports `cacheAgeSeconds`, but it is filtered through the same timestamp boundary again before return. Zero, one, or two qualifying posts are valid results. Jina records without a trustworthy publication timestamp yield zero posts. Avatar is optional and is not fetched by the first Runtime implementation.

### `translateSocialPost(request)`

Accepted value is exactly `{ postId, targetLocale }`, where `postId` must belong to the latest successfully returned feed and `targetLocale` is one of `zh/en/fr/es/ru/ar`. Arbitrary text is not accepted. Returns either:

```ts
{ schemaVersion: 1; status: "translated"; postId: string; targetLocale: string; text: string }
```

or the recognizable non-blocking failure:

```ts
{ schemaVersion: 1; status: "unavailable"; postId: string; targetLocale: string; reason: "temporarily-unavailable" }
```

Unknown/stale `postId`, invalid locale, extra fields, Worker unavailability, and shutdown reject the Promise.

### `openSocialPost(request)`

Accepted value is exactly `{ postId }`. The post must still be registered by both Worker and main broker. Only canonical HTTPS profile/status links for the three fixed X accounts may reach `shell.openExternal`. Success returns `{ opened: true, postId }`; unknown/stale ids, non-allowlisted links, OS refusal, and shutdown reject.

### Social shutdown and network semantics

Once shutdown begins, all three methods reject with `Runtime shutdown is in progress`; UI must not retry. There are no social events: refresh/translation are Promise results and do not use `onEngineEvent` or `onLogBatch`. The private Worker/main broker is not preload API and must never be called by UI. It uses Electron `net.fetch` with manual redirects, omitted credentials, fixed headers, per-request and total cancellation, bounded content types and response sizes. It does not read browser cookies, login state, arbitrary proxy credentials, or query-bearing renderer input.

本文件是 UI 与 V4App 的唯一 preload 契约。对象名固定为 `window.winBridgeApi`。方法名、参数和事件名在本轮冻结；UI 不得通过动态字符串猜测方法或 IPC channel。

## 通用语义

- 所有命令方法都返回 `Promise`。除下述明确的 `null` / `available=false` 降级外，失败时 Promise reject；UI 不应解析错误字符串来推断能力。
- shutdown 开始后所有新命令统一 reject，错误消息为 `Runtime shutdown is in progress`。窗口随后可能销毁，UI 不应重试。
- IPC 仅接受已绑定 BrowserWindow 的 mainFrame、canonical 应用根内的 canonical 实际入口。子 frame、其他本地文件、相似路径前缀和非 `file:` 来源均无权调用。
- 无参数方法严格不接受 IPC 参数；`saveSettings` 和 `startRepair` 各严格接受一个参数。Renderer 不会获得 `ipcRenderer` 或任意 channel。

## 命令方法

### `getAppInfo()` — 正式白名单

参数：无。

返回：

```ts
{
  name: string;
  version: string;
  electron: string;
  chromium: string;
  node: string;
  packaged: boolean;
  runtimeMode: true;
  realRepairEnabled: boolean;
  resultPagePersistsByDefault: true;
}
```

`realRepairEnabled=true` 只表示“已打包且以精确 `--enable-real-repair` 启动”。它不是修复授权，也不能替代诊断报告、有效期、类别和用户显式点击门槛。不可用语义：方法 reject；没有部分对象。

### `getSettings()`

参数：无。返回严格符合 `schemas/settings.schema.json` 的完整对象；默认值见 `schemas/settings.defaults.json`。

### `saveSettings(settings)`

参数：一个普通对象，且只能包含 settings schema 的公开字段。未知字段、错误类型/范围、或 `autoCloseAfterRepair=true` 但无 `autoCloseAfterRepairExplicit=true` 时 reject。返回保存后的完整规范化对象。

UI 的丰富设置模型必须显式映射到 Runtime allowlist，不得整对象透传。

### `getSystemProfile()`

参数：无。首次调用执行一次探测并缓存，以后读取缓存。

```ts
{
  schemaVersion: 1;
  detectedAt: string;
  platform: string;
  release: string;
  architecture: string;
  cpuLogicalCount: number;
  totalMemoryBytes: number;
  nodeRuntime: string;
  appPackage: null | {
    packageName: "OpenAI.Codex";
    packageFamilyName: string;
    version: string;
    desktopExecutableAvailable: true;
  };
  appPackageError: null | string;
  cachePolicy: "first-detection-then-manual-refresh";
}
```

包不可用属于安全降级：`appPackage=null` 且 `appPackageError` 有说明，不打开 Store。

### `refreshSystemProfile()`

参数：无。显式重新探测并覆盖应用自有缓存；返回结构同 `getSystemProfile()`。

### `runDiagnosis()`

参数：无。启动冻结 3.1.1 的隔离 `DiagnoseOnly` 会话；返回 `DiagnosticReport`。不会自动调用修复。

`DiagnosticReport`：

```ts
{
  schemaVersion: 1;
  reportId: string;
  createdAt: string;
  engineSnapshot: { version: string; sourceCommit: string; manifestSha256: string | null };
  issues: DiagnosticIssue[];
  summary: {
    issueCount: number;
    exitCode: 0;
    engineReportValidated: true;
    repairSuggestedCount: number;
  };
  rawReportPath: null;
  expiresAt: string;
}
```

只有冻结进程 exit code 为 0，且 session 内受限大小的 `diagnosis-*.json` 通过 `toolVersion=3.1.1`、`mode=DiagnoseOnly`、timestamp/issues 结构校验后，报告才会保存和返回。否则方法 reject、发送 `Failed` 事件，并且不会产生新的可修复报告。

每个 `DiagnosticIssue` 固定包含：`category, evidence, impact, plannedActions, risk, writeScope, knownIssue, canSkip, requiresRestart, confidence, suggestionMode`。四个 report-only 类的 `plannedActions` 与 `writeScope` 必为空。

### `getDiagnosisReport()`

参数：无。返回本次 Worker 生命周期内成功生成、尚未被新诊断或修复消费的当前 `DiagnosticReport`；不存在时返回 `null`。磁盘报告只用于应用自有审计，不会在重启后恢复为修复凭据。`null` 是正常不可用语义，不是错误。

“可提交修复”的完整门槛由 Worker 在 `startRepair` 时重新判断：能力开关为 true；报告由当前 Worker 会话成功生成而不是从磁盘重新信任；传入 ID 与当前内存报告一致；当前时间早于 `expiresAt`；至少一项 `suggestionMode="suggest-repair"`；调用来自用户显式操作。新诊断开始即失效旧资格；修复开始即一次性消费资格。UI 不得只凭非空对象或 `realRepairEnabled` 判断。

### `startRepair(reportId)`

参数：一个 16–128 字符的受限 ID 字符串。仅供上述全部门槛已满足且用户明确点击修复后调用；report-only 项永远不能单独触发修复。

成功返回：

```ts
{ operationId: string; reportId: string; finalVerificationPassed: true }
```

缺报告、非当前 ID、过期、无 suggest-repair、能力关闭、冻结核心失败或最终核验不足均 reject。即使修复成功，结果页默认保留，不自动退出。

### `cancelOperation()`

参数：无。返回 `{ cancelled: boolean }`；没有活动操作时 `cancelled=false`，这是正常结果。

### `openLogs()`

参数：无。由主进程打开应用自有日志目录；成功返回 `{ opened: true }`，系统拒绝时 reject。UI 不获得路径。

### `openGPT()`

参数：无。只读发现健康的 `OpenAI.Codex` 包并显式启动其 `app/ChatGPT.exe`。成功返回 `{ opened: true, packageName: "OpenAI.Codex", version: string }`。包/可执行文件缺失时 reject，不打开 Store；退出钩子不会终止已启动的 GPT。

### `getPluginAssets()`

参数：无。返回严格符合 `schemas/plugin-assets.schema.json` 的对象：

```ts
{
  readOnly: true;
  items: Array<
    | { id: "browser" | "chrome" | "computer-use"; available: false }
    | { id: "browser" | "chrome" | "computer-use"; available: true;
        displayName: string; version: string; hash: string; dataUrl: string }
  >;
}
```

`items` 固定按 browser、chrome、computer-use 排序。单个插件缺失、manifest/路径/类型/大小/签名不合法或读取失败时，仅该项返回 `{id, available:false}`；其他项继续读取。不会返回失败原因或本地路径，也不会写盘或复制官方资源。整个 Worker/IPC 不可用时方法才 reject。

## 事件订阅

### `onEngineEvent(callback)`

参数：一个函数。立即返回无参数解绑函数 `unsubscribe()`；解绑后不再回调。

Payload：

```ts
{
  schemaVersion: 1;
  eventId: string;
  operationId: string;
  timestamp: string;
  kind: "Progress" | "Stage" | "Failed" | "Cancelled" | "ResultReady";
  actualProgress: number;       // 0..100，脚本可信值，主进程单调钳制
  displayedProgress: number;    // 单调、不倒退、不超过 actualProgress
  engineStageState: string;
  presentedStageState: string;
  message: string;
  finalVerificationPassed: boolean;
  priority: "normal" | "terminal";
  details: object | null;
}
```

`Failed`、`Cancelled`、`ResultReady` 是 terminal priority；terminal 后普通事件被丢弃。只有 `kind="ResultReady"` 且 `finalVerificationPassed=true` 可以到 100。失败/取消不保证另发进度事件。

### `onLogBatch(callback)`

参数与解绑语义同上。Payload：

```ts
{
  schemaVersion: 1;
  entries: Array<{
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    category: string;
    message: string;
    operationId: string | null;
  }>;
  droppedBeforeBatch: number;
}
```

日志有界且有背压；`droppedBeforeBatch>0` 表示为控制内存已丢弃更旧条目。UI 应批量追加并自行限制 DOM 行数。shutdown 不承诺额外终止事件；窗口销毁时应调用两个 unsubscribe。

## UI 不应调用或依赖

- 任何 `wb:*` channel、`ipcRenderer`、Worker command（包括 `plugins.assets`、`test.*`）、`fs`、`child_process`、PowerShell 或冻结脚本。
- 任何 Vite 开发端点（包括 `/__concept/plugin-assets`）作为 Runtime 资源来源。
- 未公开设置字段、任意本地路径、环境变量或动态方法名。
- 在 `getAppInfo().realRepairEnabled=false`、报告为 `null`、报告过期、ID 非当前、仅有 report-only 问题或没有用户显式确认时调用 `startRepair`。
- 根据错误字符串、日志文案、`actualProgress=100` 之外的启发式推断最终成功；最终成功只认合规 `ResultReady + finalVerificationPassed=true`。
