export const schemes = [
  {
    id: "control-tower",
    code: "A",
    english: "Classic Layout",
    density: "balanced",
    geometry: "soft",
  },
  {
    id: "report-first",
    code: "B",
    english: "Report Layout",
    density: "balanced",
    geometry: "soft",
  },
  {
    id: "terminal-command",
    code: "C",
    english: "Terminal Layout",
    density: "compact",
    geometry: "soft",
  },
  {
    id: "guided-repair",
    code: "D",
    english: "Guided Layout",
    density: "airy",
    geometry: "round",
  },
  {
    id: "compact-workbench",
    code: "E",
    english: "Compact Layout",
    density: "compact",
    geometry: "square",
  },
];

export const colorPresets = [
  {
    id: "obsidian",
    accent: "#58dcff",
    channels: ["#22e6ff", "#3478ff", "#d14cff"],
    pluginColors: ["#4de0a2", "#ffc05b", "#58b7ff"],
    swatches: ["#080b11", "#17212d", "#58dcff"],
  },
  {
    id: "purple-white",
    accent: "#7657e8",
    channels: ["#39d9ff", "#6f67ff", "#d94dcc"],
    pluginColors: ["#2fac7c", "#d68a2b", "#486fd0"],
    swatches: ["#f8f7fc", "#ebe8f6", "#7657e8"],
  },
  {
    id: "blue-white",
    accent: "#2467d6",
    channels: ["#20cde8", "#3678ee", "#8f54ef"],
    pluginColors: ["#199b76", "#d67b2f", "#2467d6"],
    swatches: ["#f5f9ff", "#e6eefb", "#2467d6"],
  },
  {
    id: "ice-cyan",
    accent: "#35e4d2",
    channels: ["#34f1e0", "#2d9cff", "#9c64ff"],
    pluginColors: ["#35e4a0", "#f2bd4e", "#43a7ff"],
    swatches: ["#071516", "#133033", "#35e4d2"],
  },
  {
    id: "graphite",
    accent: "#9fb6c9",
    channels: ["#5ad8e6", "#7396ff", "#c06bd8"],
    pluginColors: ["#65c99d", "#d9ad62", "#91aac0"],
    swatches: ["#101214", "#24282c", "#9fb6c9"],
  },
];

// Display text lives in src/i18n (stages.<id>.*, plugin.*, log.*).
export const diagnosticStages = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

export const pluginStates = [
  { id: "browser", name: "Browser", state: "plugin.state.connectable", risk: "plugin.risk.low", tone: "ok", evidence: "plugin.evidence.conceptBrowser" },
  { id: "chrome", name: "Chrome", state: "plugin.state.driftFound", risk: "plugin.risk.medium", tone: "warn", evidence: "plugin.evidence.conceptChrome" },
  { id: "computer-use", name: "Computer Use", state: "plugin.state.staticOk", risk: "plugin.risk.toVerify", tone: "info", evidence: "plugin.evidence.conceptComputerUse" },
];

export const logSeed = [
  { time: "10:31:02", type: "INFO", category: "startup", categoryKey: "log.category.startup", messageKey: "log.seed.startup" },
  { time: "10:31:03", type: "EVID", category: "path", categoryKey: "log.category.path", messageKey: "log.seed.path" },
  { time: "10:31:04", type: "OK", category: "Browser", messageKey: "log.seed.browser" },
  { time: "10:31:05", type: "WARN", category: "Chrome", messageKey: "log.seed.chrome" },
  { time: "10:31:06", type: "MAP", category: "GitHub", messageKey: "log.seed.github" },
  { time: "10:31:07", type: "INFO", category: "Computer Use", messageKey: "log.seed.computerUse" },
  { time: "10:31:08", type: "SAFE", category: "backup", categoryKey: "log.category.backup", messageKey: "log.seed.backup" },
  { time: "10:31:09", type: "PLAN", category: "action", categoryKey: "log.category.action", messageKey: "log.seed.action" },
  { time: "10:31:10", type: "WAIT", category: "decision", categoryKey: "log.category.decision", messageKey: "log.seed.decision" },
];

export const settingCategories = [
  { id: "general" },
  { id: "appearance" },
  { id: "progress" },
  { id: "diagnostics" },
  { id: "safety" },
  { id: "backup" },
  { id: "plugins" },
  { id: "social" },
  { id: "games" },
  { id: "performance" },
  { id: "about" },
];

export const preservationRows = [
  { id: "gear", label: "左下角齿轮入口", evidence: "固定在主窗口左下角，不被顶栏设置替代" },
  { id: "gear-menu", label: "齿轮四项紧凑一级菜单", evidence: "小游戏、主题、看看他、更多设置保持原字样与顺序" },
  { id: "terminal", label: "中央实时终端 / 日志", evidence: "主工作区中央，结构化且有上限" },
  { id: "stages", label: "左侧 1–5 阶段", mode: "core-exact / layout-adaptive", evidence: "数字造型、环绕/旋转、等待/进行中/完成三态与状态驱动关系高保真；位置、间距、文案排版随壳层适配" },
  { id: "plugins", label: "三插件独立状态区", evidence: "Browser、Chrome、Computer Use 不聚合" },
  { id: "games", label: "Snake 与 Minesweeper", evidence: "同一小游戏选择窗口并列展示" },
  { id: "themes", label: "现有主题切换", evidence: "齿轮菜单保留主题入口，设置中心提供完整选项" },
  { id: "safety-core", label: "3.1.1 安全能力语义", evidence: "诊断、修复说明、备份、回滚、路径门槛、直接打开 GPT 均可见" },
  { id: "result-page", label: "修复后停留结果页", evidence: "诊断前后、问题、动作、结果、未解决项、日志入口齐全" },
  { id: "auto-close", label: "自动关闭默认关闭", evidence: "设置存在，但默认与导出值固定为 false" },
  { id: "new-defaults", label: "新增设置不代替用户开启", evidence: "全部新增布尔项默认 false" },
];

export const recoveryStates = [
  { id: "Diagnosing", write: false },
  { id: "ReportReady", write: false },
  { id: "AwaitingDecision", write: false },
  { id: "Repairing", write: true },
  { id: "ResultReady", write: false },
];

export const upstreamConstraints = [
  { source: "Issues", decision: "DiagnoseOnly → ShowReport → AwaitDecision", surface: "主窗口状态接口、只读诊断按钮、修复说明报告", behavior: "报告完成后停在 AwaitingDecision；不自动修改", frozen: "新插件写入 / 注册 / 备份 / 更新逻辑" },
  { source: "Issues", decision: "修复前七字段说明", surface: "查看修复说明对话框", behavior: "code、证据、影响、拟动作、风险、写入范围、可跳过性逐项可见", frozen: "不得用一个总风险分替代单项说明" },
  { source: "Issues", decision: "修复后停留结果页", surface: "ResultReady 结果页", behavior: "诊断前后、问题、动作、结果、未解决项、日志入口持续保留", frozen: "默认自动退出" },
  { source: "性能", decision: "设置窗口立即构造", surface: "设置标题栏、插件 / 诊断设置行", behavior: "窗口先显示；网络能力在后台只读更新，不阻塞首帧", frozen: "构造期间串行网络探测" },
  { source: "性能", decision: "UI 日志有界队列与批渲染", surface: "中央实时终端", behavior: "80 行上限、批次指示、筛选、暂停自动跟随；完整日志仍在文件", frozen: "无界输入队列、逐行 WPF 对象和逐行 ScrollToEnd" },
  { source: "性能", decision: "只读状态进度", surface: "1–5 阶段与流体进度条", behavior: "进度表达诊断 / 报告准备，不隐式承诺写入完成", frozen: "磁盘日志协议与设置写入时序变更" },
];

export const fluidObservations = [
  { stamp: "01.2s", title: "低进度建立", observed: "近黑胶囊轨道保持稳定；百分比边界处出现窄而明亮的纵向不规则前沿，左侧仅轻度着色。", implementation: "独立暗场 + 进度坐标前沿；文字层固定在最上方，不参与形变。" },
  { stamp: "04.7–05.3s", title: "前沿挤压", observed: "实际百分比处是近似纵向的等离子前沿；3–5 个凸凹瓣在相邻帧中挤压、回弹，亮边比尾部雾更硬。", implementation: "同一进度坐标上的阴影、主体、亮边、热点四层同步变形；不使用普通渐变扫光、粒子或波浪线。" },
  { stamp: "08.6s", title: "融合过渡", observed: "青、蓝、洋红集中在前沿及其后方 28–45 px 内融合，左侧主体依旧克制，局部辉光不溢出胶囊。", implementation: "两层受限尾雾 + 三色前沿；轨道裁切限制辉光，避免把整段填充做成彩虹渐变。" },
  { stamp: "11.1s", title: "多通道显色", observed: "高进度时前沿仍保留清晰亮核、彩色主体与柔软尾雾，文字位置完全稳定。", implementation: "三色 CSS 变量只作用于前沿和邻近雾区；进度坐标采用单调缓动。" },
  { stamp: "13.0s", title: "接近完成", observed: "前沿抵近末端时横向体积被压缩，但纵向火焰/等离子轮廓仍在，背景与文本不抖动。", implementation: "88% 后逐步压缩前沿宽度；低动态冻结形变，低端模式退化为静态不规则亮边。" },
];

export const sourceEntries = [
  { name: "yizhe21803/nebula-capsules-guanyu-lab", url: "https://github.com/yizhe21803/nebula-capsules-guanyu-lab", license: "MIT · commit aef3f7d010a721e00404ec8dc69239714e38e77c", files: "progress-flow-renderer.js, progress-motion-data.js, progress-reference-atlases.js", use: "主进度流体的 WebGL2 渲染、运动数据与参考纹理；React 适配层负责状态绑定和安全进度门槛", kind: "open-source" },
  { name: "抖音公开视频：把进度条做成流体，有多上头？", url: "https://www.douyin.com/video/7670470019972791162", license: "视觉参考页面，不作为代码许可证", files: "无复制文件", use: "内部研究帧覆盖 01.2 / 04.7 / 05.3 / 08.6 / 11.1 / 13.0 秒；截图不进入发布资产", kind: "reference-only" },
  { name: "Javis603/token-monitor", url: "https://github.com/Javis603/token-monitor", license: "MIT", files: "src/electron/renderer/index.html, styles.css, dashboard.html, dashboard.css, themePresets.js", use: "研究设置分组、信息密度和主题组织；本概念站未复制代码或截图", kind: "open-source" },
  { name: "microsoft/PowerToys", url: "https://github.com/microsoft/PowerToys", license: "MIT", files: "src/settings-ui/Settings.UI/Views 与 ViewModels", use: "研究 Windows 工具的设置导航、状态分组和启停清晰度；未复制代码", kind: "open-source" },
  { name: "lepoco/wpfui", url: "https://github.com/lepoco/wpfui", license: "MIT", files: "samples/Wpf.Ui.Demo.Mvvm/Views/Pages/SettingsPage.xaml, src/Wpf.Ui/Controls/NavigationView/*", use: "研究未来 WPF 迁移的 Fluent 导航与主题切换边界；未复制代码", kind: "open-source" },
  { name: "microsoft/terminal", url: "https://github.com/microsoft/terminal", license: "MIT", files: "src/cascadia/TerminalApp/TerminalPage.xaml", use: "研究终端可读性、状态层级与密度；未复制代码", kind: "open-source" },
  { name: "DevToys-app/DevToys", url: "https://github.com/DevToys-app/DevToys", license: "MIT", files: "LICENSE.md 与设置 UI 组件体系（未来复用前需再次文件级核对）", use: "研究工具集合的清晰分组与设置持久化提示；未复制代码", kind: "open-source" },
];
