# WinBridge Recovery 4.0 · V4DesignLab

独立的 A 类 UI 概念选择站。它不连接 3.1.1 修复引擎，不读取或写入插件，不安装、卸载、修复或发布任何内容。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址：`http://127.0.0.1:41740/`

生产构建自检：

```powershell
npm run build
```

## 五套方案

- A 云母指挥舱：Windows 11 云母语义，默认稳健候选。
- B 碳黑作业台：高密度平面控制台，风险与完成色更直接。
- C 深海观测站：深蓝玻璃层次，强调诊断过程和专注感。
- D 瓷白仪表盘：日间阅读与技术文档感。
- E 信号工作室：暖石墨底色与高辨识度三色状态。

五套方案共享同一强制信息架构：左下齿轮及四项一级菜单、中央实时终端、左侧 1–5 阶段、三插件独立状态、Snake 与 Minesweeper、主题切换、安全门槛、结果页和直接打开 GPT。

左侧 1–5 阶段采用 `core-exact / layout-adaptive`：数字造型、环绕/旋转、等待/进行中/完成三态和状态驱动关系保持 3.1.1 核心；位置、间距和文案排版可随壳层适配。抖音流体条只用于独立的主横向进度，不替代阶段组件。

## 配置导出

“预览 JSON”和“导出纯配置”只输出配置数据，不包含代码、截图、视频帧或外部状态。预览进度的鼠标、键盘及原生 `input` / `change` 事件都写回同一状态，因此百分比、流体前沿和 JSON 保持一致。

## 研究与边界

- [流体研究规范](research/FLUID_REFERENCE.md)
- [3.1.1 阶段组件保真规范](research/STAGE_CORE_REFERENCE.md)
- [来源与许可证](research/SOURCES.md)
- [五套方案与上游约束](research/DESIGN_SPEC.md)
- `research/internal/` 仅供内部视觉对照，禁止进入发布资产。

当前状态只代表开发构建与静态自检可运行，不代表最终视觉、性能、真实修复或发布验收。

## 4.0 architecture direction

The interactive concept now targets a packaged Electron desktop application, not a hosted website. The future desktop build remains an installable Windows EXE with Setup and portable distributions. Electron owns the visual shell; a separate C# repair worker will own privileged process, file, registry, backup, and rollback work. The concept site does not start that worker.

The main fluid progress surface uses the MIT-licensed WebGL2 renderer from `yizhe21803/nebula-capsules-guanyu-lab`, pinned at commit `aef3f7d010a721e00404ec8dc69239714e38e77c`. See `THIRD_PARTY_NOTICES.md` and `src/third_party/nebula-progress/LICENSE`.
