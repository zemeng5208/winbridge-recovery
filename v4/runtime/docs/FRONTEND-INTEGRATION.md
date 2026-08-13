# Selected UI integration handoff

## Settings mapping

The Runtime settings allowlist is public in `schemas/settings.schema.json`; exact defaults are in `schemas/settings.defaults.json`. The UI may have a richer view model, but it must explicitly map only these Runtime-owned fields before calling `saveSettings(settings)`. Unknown keys are rejected in both main IPC validation and the Worker store. Do not pass an arbitrary UI settings object.

`autoCloseAfterRepair` defaults to `false`. It can be `true` only when the paired `autoCloseAfterRepairExplicit` marker is also `true`; no performance or lifecycle layer reads it as an implicit close command.

## Runtime plugin assets

Use the no-argument `getPluginAssets()` bridge for the Browser, Chrome, and Computer Use official icons. It returns `{ readOnly: true, items }`; each item has `id` and `available`, and available items additionally contain `displayName`, `version`, `hash`, and an in-memory `dataUrl`. The UI must render a fallback when `available=false`. It must not infer or request local paths, and the host exposes no arbitrary asset or file channel.

## Repair launch capability

The UI must treat `getAppInfo().realRepairEnabled` only as capability display state. It never authorizes repair by itself. Diagnosis, current `reportId`, eligible non-report-only findings, and the user's explicit repair action remain mandatory. Ordinary development and ordinary packaged launch report `false`; only a packaged alpha started with the exact `--enable-real-repair` switch may report `true`.

## Window chrome

The host uses `titleBarStyle: hidden` with the Windows native `titleBarOverlay`; it intentionally does not use `frame: false` and does not expose minimize/maximize/close IPC. The integrated UI must reserve the top 42 px overlay area and declare an appropriate `-webkit-app-region: drag` region while marking interactive controls `no-drag`. The native Windows caption buttons remain authoritative.

总控可在接入阶段提供 `assets/winbridge-recovery.ico`。主进程仅在该文件存在时使用它，不依赖个人路径，也不阻塞当前运行时。

总控选定 UI 并完成固定相邻目录构建后，不手工复制文件；在 V4App 中运行：

```powershell
npm run sync:frontend
npm run verify:frontend
```

`sync:frontend` 不接受路径参数，只读取 `..\design-lab\dist`，并写入 `runtime\frontend\dist`。源目录必须是固定真实目录，不能是重定向到其他位置的 link/junction。同步边界如下：

- 必须存在精确小写 `index.html`；单文件最多 32 MiB、index 最多 4 MiB、最多 4096 个文件、总量最多 256 MiB。
- HTML、CSS 和静态 JavaScript 引用的资源必须存在。资源必须是适用于 `file:` 加载的相对路径；`/assets/...` 根绝对引用会被拒绝，应由 Vite 使用相对 base 构建。
- 源树中的 link/junction、路径穿越、外部资源引用和保留清单文件均被拒绝。
- 每个文件的路径、大小和 SHA-256，以及本地引用关系写入目标内 `.winbridge-frontend-manifest.json`。
- 文件先复制到 `frontend` 下唯一 staging 目录，完成全量复验后才替换 `frontend/dist`。替换失败会尝试恢复上一套完整 dist；未解决的 staging/previous 目录会阻断正式校验。

开发 `npm start` 会优先加载已同步 UI；没有它时允许加载内置 fallback。`pack:check`、`pack:win` 和已打包 Runtime 均不允许 fallback：缺少 dist、清单、资源或哈希不一致时必须失败。

运行时模式由 UI 检测 `window.winBridgeApi` 自动启用。

接入要求：

- UI 只能调用 `docs/PRELOAD-API-CONTRACT.md` 冻结的 14 个方法。
- UI 不依赖 Node integration，不使用 `require`、`ipcRenderer` 或本地绝对路径。
- 资源引用必须能在 `file://` 相对路径下工作；不得依赖 Vite 开发端点或站点根绝对路径。
- `actualProgress`、`displayedProgress`、`engineStageState`、`presentedStageState` 直接消费 bridge 事件，不另行推测脚本阶段。
- 失败/取消事件必须覆盖普通动画；只有 `ResultReady + finalVerificationPassed` 呈现 100%。
- 最终修复完成默认停留在结果页；性能层不覆盖自动关闭选择。

总控负责 UI 合入、运行时视觉测试、真实诊断/修复测试、桌面测试快捷方式和最终验收。
