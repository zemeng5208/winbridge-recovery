# WinBridge Recovery

**Independent Windows recovery launcher for GPT/Codex Desktop Browser, Chrome, and Computer Use plugins.**

WinBridge Recovery detects and repairs bundled marketplace, plugin cache, `latest` pointer, runtime path, and registration drift after Desktop updates or restarts. It uses only the official package already installed on the target computer.

> Independent, non-commercial student project. Not affiliated with, sponsored by, or endorsed by OpenAI. Third-party names are used only to identify compatibility. No third-party logos or official application/plugin files are redistributed.

## Features

- Version-aware detection of the locally installed Codex Desktop package.
- Browser lock prevention by closing Chrome and Edge before cache reconciliation.
- Repair only when static state is inconsistent.
- Up to three verified recovery backups, preserved by default during uninstall.
- Post-launch consistency checks, diagnostics, rollback, self-test, themes, and mini games.

## Safety boundaries

- Does not take ownership of or patch `C:\Program Files\WindowsApps`.
- Does not bundle credentials, passwords, cookies, tokens, API keys, sessions, logs, or private keys.
- Does not bypass enterprise or browser security policy decisions.
- Writes only to documented installation, backup, and required Codex user-state locations.
- Uninstall removes only files owned by the installation manifest, not an arbitrary selected parent directory.

## Build

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Installer\Build-Installer.ps1 -OutputPath .\WinBridge-Recovery-Setup.exe
```

The optional self-signed test certificate is not publicly trusted. Verify the SHA-256 published with each release.

See [README-zh-CN.md](README-zh-CN.md), [LEGAL-NOTICE.md](LEGAL-NOTICE.md), and [SECURITY.md](SECURITY.md).
