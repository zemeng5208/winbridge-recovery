# WinBridge Recovery

**Windows GPT/Codex Desktop 插件修复与安全启动工具。**

它用于检查和恢复 Browser、Chrome 与 Computer Use 三个桌面插件在更新或重启后出现的 marketplace、缓存、`latest` 指针、运行时路径和注册状态不一致问题。

> 本项目是学生独立开发的非商业社区测试项目，与 OpenAI 无隶属、赞助或认可关系。第三方名称仅用于说明兼容对象；项目不包含第三方品牌图标，也不重新分发官方应用或插件文件。

## 项目沿革

WinBridge Recovery 是早期公开脚本项目 **[Codex Desktop Plugin Repair Safety Kit](https://github.com/zemeng5208/codex-desktop-plugin-repair-safety-kit)** 的当前维护实现。

早期 Safety Kit 主要针对 Windows Codex Desktop 插件运行时异常，提供保守的健康检查以及面向 `node_repl` 的定向修复。WinBridge Recovery 延续同一类恢复问题，并进一步扩展为完整工程化工具：加入版本感知的官方包识别、bundled marketplace / cache / `latest` 状态协调、运行时与注册状态恢复、经过校验的备份与回滚、GUI 启动器、安装器、免安装便携包，以及针对新版 Desktop 包结构的持续兼容工作。

旧仓库不会被合并或重写，而是作为项目早期公开阶段继续保留，从而保留原始 Git 历史。当前开发、版本发布和主要文档以本仓库为准。

## 主要功能

- 自动识别当前安装的官方 Codex Desktop 包及其当前资源版本。
- 从当前官方包的 `cua_node/manifest.json` 读取运行时布局，不再假设固定的 `bin` 目录结构。
- 使用完整包版本以及 bundled plugin、CLI、CUA 内容哈希识别更新，避免继续使用旧资源镜像。
- 启动前关闭 Chrome 与 Edge，降低 Native Host 文件锁导致缓存更新失败的概率。
- 只在检测到状态不一致时，从本机当前官方包重建缺失的 marketplace、缓存和注册信息。
- 对深层插件依赖使用长路径安全的备份清单与校验逻辑。
- 保留最多三份通过校验的恢复备份，普通卸载默认不删除备份。
- 启动 Desktop 后进行两次连续静态一致性检查。
- 提供诊断、回滚、自检、主题和小游戏界面。

## 安全边界

- 不接管或修改 `C:\Program Files\WindowsApps` 的所有权。
- 不携带账号、密码、Cookie、Token、API Key、会话数据库、用户日志或私钥。
- 不绕过 Browser 的企业网络或安全策略决定。
- 修复来源仅为目标电脑当前安装的官方包；安装包本身不内置官方插件副本。
- 只写入文档中列明的安装目录、备份目录和修复操作所需的 Codex 用户状态位置。

## 安装与使用

运行 Release 中的 `WinBridge-Recovery-Setup.exe`，选择程序目录。D 盘可用时，备份默认位于 `D:\CodexPluginRepairBackups`；否则使用当前用户的本地应用数据目录。

安装后双击桌面上的 **WinBridge Recovery**。启动器会提醒并关闭 Chrome/Edge，完成检查、必要修复、Desktop 启动及后检查。完成后再打开 Chrome 验证扩展连接。

### 免安装便携 ZIP

也可以从最新 GitHub Release 下载 `WinBridge-Recovery-v3.0.0-beta.1-portable.zip`。将其中完整的 `WinBridge-Recovery` 文件夹解压到普通、可写的用户目录，然后运行：

```text
WinBridge-Recovery\LauncherUI\WinBridgeRecovery.exe
```

便携包不会安装系统服务、创建卸载注册项，也不包含官方 Desktop 或插件文件。请保持解压后的目录结构完整，不要直接在 ZIP 内运行脚本。首次启动会检测当前 Windows 环境和本机已安装的官方 Desktop 包，修复资源只从目标电脑的当前官方包生成。

无论使用安装器还是便携 ZIP，运行前都应核对 Release Notes 中公布的 SHA-256。项目使用的是自签测试证书，并非 Windows 公开信任的商业签名。

## 验证标准

静态检查通过不等于三个插件完整可用。最终应分别验证：

- Browser：真实打开网页、读取内容并交互；
- Chrome：通过扩展连接真实标签页并交互；
- Computer Use：辅助传输正常，并完成一次真实 Windows UI 操作。

三个表面不能互相替代。若 Browser 明确返回企业网络或安全策略拒绝，应停止尝试，本工具不会绕过该策略。

## 从源码构建

需要 Windows 11、Windows PowerShell 5.1 和系统自带 .NET Framework CodeDOM：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Installer\Build-Installer.ps1 -OutputPath .\WinBridge-Recovery-Setup.exe
```

测试证书不是公开受信任的商业签名。运行前请核对 Release 页面公布的 SHA-256。

## 卸载

卸载器只删除自身清单确认拥有的 `WinBridge-Recovery` 程序目录、快捷方式和卸载注册项，不递归删除用户选择的父目录。默认保留恢复备份，也不会删除官方 Desktop、用户会话或其他 MCP 配置。

详见 [LEGAL-NOTICE.md](LEGAL-NOTICE.md)、[SECURITY.md](SECURITY.md) 和 [TESTING-NOTICE.md](TESTING-NOTICE.md)。
