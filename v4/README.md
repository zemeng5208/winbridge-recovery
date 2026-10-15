# WinBridge Recovery 4.0.0

This directory contains the first integrated WinBridge Recovery 4.0 source release.

> Status: `4.0.0` first integrated release. The ordinary desktop demo keeps real repair disabled unless the explicit packaged repair capability is enabled.

## Projects

- `design-lab`: React/Vite interface, themes, structured terminal, fluid progress UI, settings, and mini games.
- `runtime`: Electron shell, isolated Worker, bounded logs, plugin asset bridge, integrated 4.0.0 engine snapshot, tests, and packaging validation.

Real repair is disabled by default. The desktop demonstration build therefore cannot modify plugin state unless it is deliberately launched with the packaged repair capability flag.

## Local development

```powershell
cd v4\design-lab
npm ci
npm test
npm run build

cd ..\runtime
npm ci
npm run sync:frontend
npm run verify:frontend
npm test
npm run verify:snapshot
npm run pack:check
npm start
```

`pack:check` validates packaging inputs without creating a package.

## Interface language

The desktop interface supports Simplified Chinese (`zh-CN`) and English (`en-US`). Choose it under Settings → General → Interface language; the change applies immediately and is saved by the runtime as the `language` setting (settings schema v1), so it survives restarts. It is stored in `settings/interface.json` next to `settings.json`, which keeps its 4.0.0 shape so an older build can still read it.

- Existing installs whose settings were written before this option keep the Chinese interface.
- A new install starts with `system`, which follows the Windows display language: any Chinese display language uses `zh-CN`; every other display language uses `en-US`.
- Restore defaults keeps the selected language.

Interface copy lives in `design-lab/src/i18n/zh-CN.js` and `en-US.js` with matching keys (`npm test` checks parity, placeholders, and that every surface renders without untranslated text). Output from the frozen engine, Worker, and PowerShell is shown verbatim and is not translated.

## Collaboration

Base follow-up development on the integrated 4.0 branch after it is reviewed. Create focused feature branches, keep commits scoped to real changes, and run the relevant checks before merging.

Do not commit `node_modules`, build output, local logs, screenshots, caches, secrets, personal paths, or signing material.

## Current boundaries

- Real repair remains gated and disabled in ordinary demonstration runs.
- The mature 3.1.1 repair core remains preserved inside the verified 4.0.0 wrapper snapshot.
- The formal Windows x64 installer and portable ZIP are published from the release assets; the installer and portable V4 executable use a self-signed test certificate rather than a publicly trusted certificate and should be verified with their SHA-256 sidecars before use.
