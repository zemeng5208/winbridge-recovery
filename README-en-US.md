# WinBridge Recovery

**Independent Windows recovery launcher for GPT/Codex Desktop Browser, Chrome, and Computer Use plugins.**

WinBridge Recovery detects and repairs bundled marketplace, plugin cache, `latest` pointer, runtime path, and registration drift after Desktop updates or restarts. It uses only the official package already installed on the target computer.

> Independent, non-commercial student project. Not affiliated with, sponsored by, or endorsed by OpenAI. Third-party names are used only to identify compatibility. No third-party logos or official application/plugin files are redistributed.

## Feedback

**Tried WinBridge Recovery? Please tell me what happened — success reports are useful too.**

- [Quick feedback: worked / partly worked / did not work](https://github.com/zemeng5208/winbridge-recovery/issues/new?template=quick_feedback.yml)
- [Report a bug](https://github.com/zemeng5208/winbridge-recovery/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/zemeng5208/winbridge-recovery/issues/new?template=feature_request.yml)
- [Ask a question](https://github.com/zemeng5208/winbridge-recovery/issues/new?template=question.yml)

A one-sentence report is enough. If WinBridge solved your problem, saying so helps validate the recovery path; if it did not, even a short description helps identify what should be fixed next. If you find the project useful, a GitHub Star also helps other users discover it.

Please do **not** post passwords, cookies, tokens, API keys, account/session data, private configuration, or unredacted private paths/logs.

## Project history

WinBridge Recovery is the current maintained implementation of an earlier public, script-based project: **[Codex Desktop Plugin Repair Safety Kit](https://github.com/zemeng5208/codex-desktop-plugin-repair-safety-kit)**.

The earlier Safety Kit focused on conservative health checks and targeted `node_repl` repair for Windows Codex Desktop plugin-runtime failures. WinBridge Recovery continues the same recovery problem space at a broader engineering level, adding version-aware package detection, bundled marketplace/cache and `latest` reconciliation, runtime/registration recovery, verified backups and rollback, a GUI launcher, installer, portable distribution, and compatibility work for newer Desktop package layouts.

The predecessor repository is intentionally preserved rather than merged or rewritten so its original Git history remains available as the earlier public stage of the project. Active development and releases are maintained here.

## Features

- Version-aware detection of the locally installed Codex Desktop package.
- Reads the current package's `cua_node/manifest.json` instead of assuming a fixed runtime layout.
- Uses the full package version plus bundled-plugin, CLI, and CUA content hashes to invalidate stale mirrors after updates.
- Browser lock prevention by closing Chrome and Edge before cache reconciliation.
- Repair only when static state is inconsistent.
- Long-path-safe backup manifests for deeply nested plugin dependencies.
- User-selectable retention of one, two, or three verified recovery backups; backups are preserved by default during uninstall.
- Six interface languages: Arabic, Chinese, English, French, Russian, and Spanish. The first run follows the Windows UI language.
- Optional public activity view for Tibo, OpenAI, and ChatGPT. It is hidden when its public sources cannot be reached and never attempts to bypass network restrictions.
- Snake and Minesweeper mini games, plus classic-black and glass appearance themes.
- In-app update download, SHA-256 verification, and installer launch. A configurable mirror prefix may be used before the official GitHub fallback.
- Post-launch consistency checks, diagnostics, rollback, and self-test.

## Safety boundaries

- Does not take ownership of or patch `C:\Program Files\WindowsApps`.
- Does not bundle credentials, passwords, cookies, tokens, API keys, sessions, logs, or private keys.
- Does not bypass enterprise or browser security policy decisions.
- Writes only to documented installation, backup, and required Codex user-state locations.
- Uninstall removes only files owned by the installation manifest, not an arbitrary selected parent directory.

## Install or run portable

### Installer

Download `WinBridge-Recovery-Setup.exe` from the latest GitHub Release. The installer lets you choose the application and backup locations, creates the desktop shortcut, and registers the included uninstaller.

### Portable ZIP

Download `WinBridge-Recovery-v3.1.1-portable.zip`, extract the complete `WinBridge-Recovery` folder to a normal user-writable location, and run:

```text
WinBridge-Recovery\LauncherUI\WinBridgeRecovery.exe
```

The portable package does not install a service, create an uninstall entry, or bundle any official Desktop/plugin files. Keep the extracted folder together; do not run individual scripts directly from inside the ZIP. On first use it detects the current Windows and locally installed official Desktop package. Recovery content is generated only from that package.

Before either method, compare the downloaded file's SHA-256 with the value shown in the Release notes. The included signature is a self-signed testing certificate and is not publicly trusted.

## Updates and public activity

The settings window can check the latest GitHub release and download the installer inside the application. The update helper waits for the launcher to exit, then opens the installer in update mode so the existing application and backup locations can be reused. The downloaded installer is rejected unless its SHA-256 matches the release digest or companion `.sha256` asset.

For networks where GitHub release downloads are slow, an administrator may create `Config\update.ini` beside the installed launcher:

```ini
mirror_prefix=https://example.invalid/
```

The mirror must proxy the original release URL. It is tried first and the official URL remains the fallback. This option does not weaken verification and does not guarantee that any particular regional network can reach GitHub metadata.

The public activity view is opt-in after a successful connectivity probe. If all configured public RSS/reader sources are unavailable, the setting and entry are hidden. Cached posts may still be shown when available. Translation follows the selected interface language and currently targets the six UN official languages.

## Build

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Installer\Build-Installer.ps1 -OutputPath .\WinBridge-Recovery-Setup.exe
```

The optional self-signed test certificate is not publicly trusted. Verify the SHA-256 published with each release.

See [README-zh-CN.md](README-zh-CN.md), [LEGAL-NOTICE.md](LEGAL-NOTICE.md), and [SECURITY.md](SECURITY.md).
