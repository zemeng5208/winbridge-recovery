# 来源与许可证清单

## 事实、推断、建议

事实：下列仓库许可证在本轮通过仓库许可证文件或 API 读取确认。除 3.1.1 阶段环外，概念站没有复制这些研究项目的代码或截图。

推断：Token Monitor、PowerToys、WPF UI、Windows Terminal 与 DevToys 的信息分组、导航密度和状态层级适合作为成熟 Windows 工具模式参考，但不能只凭视觉相似推断具体实现。

建议：未来若发生文件级复用，先固定仓库版本 / commit、具体文件、修改点和分发义务，再进入代码审核；不要把仓库首页许可证自动扩展到来源不明的图片、字体或第三方子资产。

## 清单

| 来源 | 许可证 | 文件级范围 | 本轮用途 / 义务 |
|---|---|---|---|
| 抖音视频 `7670470019972791162` | 未提供代码许可证 | 无可复用文件 | 仅研究关键帧；独立实现；截图不发布 |
| WinBridge Recovery 3.1.1 | MIT | `LauncherUI/WinBridgeRecovery.cs` 的 `AddStage`、`SetStage`、`StageProgressOrbit` | 同项目阶段环适配；保留版权和 MIT 文本 |
| `Javis603/token-monitor` | MIT | `src/electron/renderer/index.html`, `styles.css`, `dashboard.html`, `dashboard.css`, `themePresets.js` | 只研究设置信息密度、分组和主题；未复制代码 |
| `microsoft/PowerToys` | MIT | `src/settings-ui/Settings.UI/Views` 与 `ViewModels` | 只研究 Windows 设置导航与状态分组 |
| `lepoco/wpfui` | MIT | `samples/Wpf.Ui.Demo.Mvvm/Views/Pages/SettingsPage.xaml`, `src/Wpf.Ui/Controls/NavigationView/*` | 只研究 Fluent 导航与主题边界 |
| `microsoft/terminal` | MIT | `src/cascadia/TerminalApp/TerminalPage.xaml` | 只研究终端密度与可读性 |
| `DevToys-app/DevToys` | MIT | 设置 UI 体系；未来复用前需再次文件级核对 | 只研究工具集合分组与设置提示 |

## 概念站运行依赖

锁文件记录的直接依赖：React `19.2.8`、React DOM `19.2.8`、Vite `8.2.1`、`@vitejs/plugin-react` `6.0.5`，均为 MIT。当前阶段不发布；发布前总控需聚合这些运行依赖的许可证文本和最终 bundle 义务。
