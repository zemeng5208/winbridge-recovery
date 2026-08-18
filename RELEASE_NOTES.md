# WinBridge Recovery v4.0 Development

## Access Guard alpha

This development branch now carries the first WinBridge 4.0 access-denied and file-lock hardening work, based on real-world `Move-Item` / `Access Denied` failures reported against the 3.1.1 repair flow.

### New behavior

- Added `WinBridge-4.0-AccessGuard.ps1` as a read-only environment and lock diagnostic layer.
- `RepairAndLaunch` now runs Access Guard before the repair core starts.
- The preflight blocks repair when ChatGPT/Codex Desktop is still running, instead of allowing the repair and Desktop to operate on the same plugin/runtime state at the same time.
- `DiagnoseOnly` runs the same data collection without blocking or modifying the target state.
- If the repair core starts and later fails, the configured launcher automatically runs Access Guard again in `PostFailure` mode so the run log and failure-time environment can be reviewed together.
- Added `DIAGNOSE-ACCESS-DENIED.cmd` for one-click read-only collection of the same report.
- Reports collect target existence, attributes, reparse-point state, owner, SDDL/ACL context, `icacls` output, relevant ChatGPT/Codex/helper/browser processes, Restart Manager lock owners, antivirus/security-product context, matching security/encryption/DLP service candidates, file-system minifilters, and BitLocker status.
- Restart Manager interop uses `System.Runtime.InteropServices.ComTypes.FILETIME` explicitly to avoid the `FILETIME` type ambiguity seen in an earlier diagnostic attempt.
- Generic `node.exe` processes are not treated as Codex helpers unless their path or command line contains Codex/plugin/CUA-specific indicators.
- Security/encryption/DLP discovery is diagnostic only. A matching service is reported as a candidate, not asserted to be the root cause.

### Atomic directory move hardening

- The configured 4.0 launcher now applies a checked patch to the generated runtime copy of `Start-WinBridge-Recovery.ps1`.
- The original core source file remains unchanged and the existing SHA-256 source-integrity check is retained.
- Five directory move/swap points used by atomic install, removal, rollback, and restore are replaced in the runtime copy with bounded retry logic.
- Each move receives up to six attempts with short backoff delays. This is intended only for transient races such as a short antivirus/EDR scan or another temporary file handle.
- The patch validates the expected core layout and exact occurrence count before changing the runtime copy. If a future core layout no longer matches, WinBridge refuses to apply the patch rather than modifying an unknown structure.
- Permanent permission, policy, encryption, ACL, reparse-point, or filter-driver failures are not bypassed; after the bounded retry is exhausted the original operation still fails and a post-failure Access Guard report is collected.

### Safety boundaries retained

WinBridge 4.0 Access Guard does **not**:

- disable, uninstall, evade, or bypass enterprise EDR/DLP/encryption software;
- modify company security policy;
- take ownership of the entire `.codex` tree or reset its ACLs;
- change ownership or permissions under `C:\Program Files\WindowsApps`;
- force-delete repair targets;
- kill every `node.exe` process;
- remove backup/integrity checks;
- use injection, hooks, drivers, or kernel techniques to defeat a security product.

If a company security product or file-system filter is the actual policy owner of the directory, the correct next step is to use the generated evidence with the company IT/security administrator rather than bypassing the control.

### Validation status

- GitHub-side source review of the new wrapper integration and safety boundaries: PASS.
- The original `Start-WinBridge-Recovery.ps1` source remains unchanged by the 4.0 runtime patch design.
- Windows-only runtime execution of Restart Manager, `fltmc`, `manage-bde`, and the bounded `Move-Item` retry path has **not yet been executed in this Linux tool environment**. This development branch still requires a real Windows 10/11 + Windows PowerShell 5.1 test before the behavior should be treated as release-ready.

---

# WinBridge Recovery v3.1.1

## Maintenance update

- Fixed in-app update discovery when the newest GitHub release is marked as a prerelease.
- Fixed Snake and Minesweeper closing immediately after selection when launcher auto-close is enabled.
- Restored the compact gear menu: mini games, theme, public activity, then full settings.
- Reduced main progress and particle animation frequency and wave sampling to improve pointer and settings responsiveness.
- Fixed uninstall failures on deeply nested backup trees that exceed the legacy Windows path limit.
- The uninstaller now uses Unicode long-path APIs, tolerates entries that disappear during cleanup, clears blocking file attributes, and does not traverse directory reparse points.
- Unified private and public launcher version metadata at `3.1.1`.

## Verification

- Public and private launcher compilation: PASS.
- Public launcher file version: `3.1.1.0`.
- Settings, game selection, and launcher functions: user acceptance test PASS.
- Uninstaller source regression test: PASS with a 427-character path, a read-only file, and an already-missing directory.
- Rebuilt installer payload regression test: PASS using the uninstaller extracted by an isolated `--test-mode` installation.
- Repair-core PowerShell behavior was not modified in this maintenance release.

## v3.1.1 download verification

```text
SHA256  DC3248E7C16620CA2B0940D036F1C01C81B77EC96672E8456B7654A13605E9A6  WinBridge-Recovery-Setup.exe
SHA256  6918D3280B79249B5DDD7C46ACB157D4FA51586E8C26474DEB563D77E76EFC5D  WinBridge-Recovery-v3.1.1-portable.zip
```

---

# WinBridge Recovery v3.1.0 Beta 1

Independent Windows recovery launcher for GPT/Codex Desktop Browser, Chrome, and Computer Use plugin state.

## What changed

- Added a complete accordion settings center with clear left/off and right/on switches.
- Added selectable retention of one, two, or three verified recovery backups.
- Added selectable public activity count from one to ten posts.
- Added six UI languages: Arabic, Chinese, English, French, Russian, and Spanish; first run follows the Windows UI language.
- Added an optional public activity view for Tibo, OpenAI, and ChatGPT, with RSS sources, cache-first behavior, and reader fallback.
- Activity visibility now depends on a real endpoint probe. When no source is reachable and no cache exists, the feature is hidden rather than showing a broken surface.
- Activity translation follows the selected interface language across the six supported languages.
- Replaced Breakout with Minesweeper and retained Snake.
- Added in-app update checking, installer download, SHA-256 verification, and update-mode installation.
- Added a configurable download mirror prefix with official GitHub fallback; verification remains mandatory for every source.
- Update mode reuses the existing install and backup locations when the installed registration is available.
- Removed the obsolete Breakout implementation from the runtime source.

## Recovery behavior retained

- Reads the current official package's `cua_node/manifest.json` instead of assuming a fixed runtime layout.
- Uses the full package version and bundled-plugin, CLI, and CUA hashes for resource-mirror identity.
- Keeps only the newest two valid resource mirrors.
- Preserves marketplace, cache, `latest`, registration, rollback, and post-launch consistency checks.
- Does not redistribute official Desktop or plugin payloads.

## Verification status

- Public and private launcher compilation: PASS.
- Six-language settings resource load: PASS.
- Minesweeper reveal, flood-fill, flag count, and timer interaction: PASS on the development machine.
- Social activity window loaded four live/cached public posts and completed Chinese translation: PASS during development.
- Browser, Chrome, and Computer Use independent interaction checks: previously PASS on the development machine; this historical result is not a substitute for a fresh target-machine check.
- In-app update source compiles and requires SHA-256 before installation: PASS.
- v3.1 update metadata is supplied by the GitHub Release and companion SHA-256 files; the update path rejects installers without a matching SHA-256.
- Final v3.1 installer and uninstaller isolated checks: PASS. The installed payload reported v3.1.0 and MIT License, uninstall removed only the owned product, preserved the selected backup folder, and left an unrelated marker untouched.
- Final portable ZIP clean-extraction self-test: PASS. The original repair-core script hash remained unchanged.
- Public source and package privacy scan: PASS with zero detected machine-local paths, email addresses, access tokens, or private-key markers.

## Safety notes

- Public activity sources may be unavailable on restricted networks. The launcher does not bypass those restrictions.
- A mirror prefix only changes the download route. It cannot change the expected SHA-256.
- The installer uses a self-signed testing certificate and is not publicly trusted. Verify the published SHA-256 before running it.

## Download verification

```text
SHA256  6775CE0559985A221C183145A405964F05A9CC228D276FCAB95DB9466177D978  WinBridge-Recovery-Setup.exe
SHA256  91919C978BBBD3A2082107F522CE948915422EF778FC173FDEFD80F703DFC45E  WinBridge-Recovery-v3.1.0-beta.1-portable.zip
```

The portable ZIP contains 27 runtime/documentation/certificate files. It passed the packaged self-test after clean extraction and contains no machine-local configuration, logs, backups, resource mirrors, credentials, private signing material, or official Desktop/plugin payloads.