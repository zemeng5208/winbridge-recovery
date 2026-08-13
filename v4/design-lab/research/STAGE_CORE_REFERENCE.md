# 3.1.1 左侧 1–5 阶段组件保真规范

## 采用范围

总控最新范围是 `core-exact / layout-adaptive`：

- 核心高保真：数字造型、数字周围环绕/旋转动画、等待/进行中/完成三态、原有点击关系和交互语义。
- 可适配：位置、整体尺寸、行高、间距、周边容器、阶段文案、字体排布和主题背景。
- 明确分离：左侧阶段环不是本次抖音流体主进度条，不能被普通时间线、卡片导航或横向流体条替代。

## 事实证据

内部截图：

- `research/internal/stage-refs/stage-ref-01-89pct.png`：阶段 1 进行中，其余等待中。
- `research/internal/stage-refs/stage-ref-02-16pct.png`：相同三态逻辑在较低总进度下的表现。

只读源码：`Publish/chatgpt-plugin-safe-launcher/LauncherUI/WinBridgeRecovery.cs`。

| 核心 | 3.1.1 事实 |
|---|---|
| 数字 | `38 × 38` 环中心，14 px 粗体；青 → 蓝紫 → 洋红对角渐变，带黑色无位移阴影 |
| 轨道 | 88 个采样点构成轻微波纹圆环；非完全规则圆 |
| 等待 | 暗蓝灰轨道，无彩色进度弧；仍以很慢节奏环绕 |
| 进行中 | 最少显示 16% 彩色弧，青蓝紫洋红渐变，带约 4.7 px 辉光和洋红亮点；速度最快 |
| 完成 | 整圈彩色弧点亮，状态文字为绿色；仍以较慢速度环绕 |
| 驱动 | `SetStage` 与 `UpdateStageOrbits` 根据流程阶段和全局进度更新，不由阶段项自行改变修复状态 |
| 点击 | `StageProgressOrbit.IsHitTestVisible = false`；`AddStage` 没有阶段点击处理。阶段项不是导航或修复按钮 |

## 概念站实现

- `src/components/StageProgressOrbit.jsx` 复用 3.1.1 的 38 px 结构、88 点波纹和状态色逻辑，改写为 React/SVG。
- `src/components/RecoveryWindow.jsx` 根据 `Diagnosing`、`ReportReady`、`AwaitingDecision`、`Repairing`、`ResultReady` 驱动五阶段状态。
- 阶段 `<li>` 没有 `onClick`，并明确标注为 `status-driven`；不会变成导航或修复触发器。
- 五套壳层共享同一组件；壳层只能改变周边背景、列宽和文案布局。

## 许可证

3.1.1 源项目许可证为 MIT，版权为 `Copyright (c) 2026 zemeng5208`。本概念适配记录在 `THIRD_PARTY_NOTICES.md`，许可证副本位于 `LICENSES/WinBridge-Recovery-MIT.txt`。若分发包含该适配，必须保留版权与 MIT 许可文本。

本规范只证明概念站已按事实建模，不代表总控完成动画、视觉或真实运行验收。
