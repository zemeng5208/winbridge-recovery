# WinBridge Recovery 4.0 Runtime Shell

## “看看他”只读 Runtime（V4App 契约）

- UI 仅调用 `getSocialFeed(options)`、`translateSocialPost({ postId, targetLocale })`、`openSocialPost({ postId })`，不能提交 URL、host、path、header 或任意待翻译文本。
- 固定账户为 Tibo (`thsottiaux`)、OpenAI (`OpenAI`) 和 ChatGPT (`ChatGPT`)；默认 48 小时、最多 4 条。只有可严格解析的 UTC 发布时间、位于窗口内且不超过本机时间 5 分钟固定偏差的记录可以展示；该偏差只用于容忍发布源与本机的轻微时钟差。未确认、缺失、无效、过旧或更远未来的记录一律排除，0–2 条是合法结果且不会回填。
- Worker 负责固定来源顺序、最多三账户并行、解析、缓存、postId 登记和双重响应上限；main 只接受三个内部结构化 broker 操作，并使用 Electron `net.fetch` 重建固定 URL。没有 renderer 通用网络代理。
- 社交缓存只写应用自己的 `<userData>/runtime-v4/social/feed-cache.json`，最多 24 条、512 KiB，并通过同目录 staging/replace 更新。在线失败返回带 `cacheAgeSeconds` 的缓存；无缓存返回 `available=false, reason=temporarily-unavailable`。
- 本实现不读取浏览器 Cookie、账号、登录状态或代理密钥。头像字段为可选，本版不主动抓取头像；UI 应安全使用首字母或内置占位符。
- 社交失败和不可达只影响该入口，不改变诊断、修复、启动或退出流程。完整方法与返回结构见 `docs/PRELOAD-API-CONTRACT.md`，网络边界见 `docs/ARCHITECTURE.md`。

## 生产 Renderer CSP

- 打包态在主进程中、`loadFile` 之前为专用 Runtime session 注册严格响应头 CSP；该约束不依赖手改 `frontend/dist/index.html`，重新执行前端同步后仍然存在。
- Renderer 的 `connect-src` 固定为 `'none'`；社交请求不会因此放宽，因为它只通过 preload → Worker → main broker。
- 开发态不注册生产响应头拦截器，因此不会意外阻断既有本地 Vite/回退工作流。内置 fallback 自身保留同等严格的 meta CSP。

这是独立预发布 Electron 外壳。它不会修改 3.1.1 正式目录，也不会自动执行真实修复。

## 边界

- Renderer 只看到 `window.winBridgeApi` 的固定白名单，不获得 `ipcRenderer`、`fs`、`child_process` 或任意 channel。
- Electron 主进程只负责窗口、白名单 IPC 和自有 Worker 生命周期。
- 文件持久化、系统探测、诊断适配和外部引擎进程全部在独立 Worker 中执行。
- 默认禁止真实修复。只有已打包应用以精确启动参数 `--enable-real-repair` 启动时才具备候选能力；能力开启后仍必须先有结构化诊断报告和显式用户选择。
- 退出时只终止本应用自己 fork/spawn 的 Worker 和直接辅助进程 PID；绝不按进程名终止 ChatGPT、Codex、Chrome 或 Edge。
- `engine/frozen-3.1.1` 是来源和 SHA-256 均固定的 3.1.1 快照；会话运行前复制到应用数据目录，绝不反向写源快照或 Publish。
- Runtime 只允许受控同步脚本读取固定相邻来源 `..\design-lab\dist`；脚本不会修改 UI 工程，也不接受调用者提供其他路径。

## 开发

```powershell
npm install
npm test
npm start
```

`npm start` 是开发入口：存在已同步 `frontend/dist` 时加载它，否则允许回退到内置 fallback，便于 Runtime 独立开发。fallback 不是正式打包输入。

## 前端集成

在 UI 工程完成 `..\design-lab\dist` 构建后，依次运行：

```powershell
npm run sync:frontend
npm run verify:frontend
```

同步固定校验精确小写 `index.html`、HTML/CSS/JavaScript 的本地静态引用、文件数量和大小上限，并为所有文件生成 SHA-256 清单。目标先写到 `frontend` 内唯一 staging 目录，校验通过后再同目录替换 `frontend/dist`；失败时保留上一套完整目标或不产生目标。

## 可移植目录包

```powershell
npm run pack:win
```

`pack:check` 与 `pack:win` 都会先运行同一前端校验。`frontend/dist`、集成清单或任一引用资源缺失/被修改时直接失败；已打包应用也禁止回退 fallback。输出在 `out/WinBridge-Recovery-V4-win32-x64`。这不是安装器、签名版本或正式发布物，也不会创建桌面快捷方式。

## 真实能力门槛

- `runDiagnosis()`：调用冻结快照的 `DiagnoseOnly`，但本专项不运行它。
- `startRepair(reportId)`：需要已打包应用以精确参数 `--enable-real-repair` 启动、当前结构化报告、显式调用、报告尚未过期，并至少包含一项 `suggest-repair`。开发直启、无参数双击和合成测试均关闭。
- `openGPT()`：只在用户显式点击时由 Worker 启动系统已安装的包；退出钩子不会终止它。
- `getPluginAssets()`：无参数只读读取当前 `CODEX_HOME` 中 Browser、Chrome、Computer Use 的官方清单图标；只返回受限 data URL、显示名、版本和哈希，不返回路径、不复制资源，单项缺失或越界时返回 `available=false`。

未来由总控创建的独立测试快捷方式可显式追加 `--enable-real-repair`。本专项不创建快捷方式，也不将该参数写入普通开发命令或打包脚本。

测试证据只覆盖 schema、合成 fixture、进度投影、IPC 白名单、Worker/辅助进程生命周期、自有路径持久化与真实修复拒绝；不属于最终验收。
