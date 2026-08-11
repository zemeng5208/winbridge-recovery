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
- Real v3.1 update metadata and asset download: pending until the v3.1 release assets are published; the update path rejects installers without a matching SHA-256.
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
