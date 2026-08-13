# WinBridge Recovery 4.0 Development Preview

This directory contains the in-progress WinBridge Recovery 4.0 source code.

> Status: `4.0.0-alpha.1` development preview. It is not a stable release and does not replace the current 3.1.1 build.

## Projects

- `design-lab`: React/Vite interface, themes, structured terminal, fluid progress UI, settings, and mini games.
- `runtime`: Electron shell, isolated Worker, bounded logs, plugin asset bridge, frozen 3.1.1 engine snapshot, tests, and packaging validation.

Real repair is disabled by default. This preview is published as source code only; no EXE, ZIP, portable package, or installer is attached.

## Local development

```powershell
cd v4\design-lab
npm ci
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

## Collaboration

Base development work on the `v4-development` branch. Create a focused feature branch, keep commits scoped to real changes, run the relevant checks, and open a pull request back to `v4-development`.

Do not commit `node_modules`, build output, local logs, screenshots, caches, secrets, personal paths, or signing material.

## Current boundaries

- The UI and runtime architecture are still changing.
- Real repair remains gated and disabled during ordinary development runs.
- 3.1.1 remains the recommended build for normal use.
- This source preview provides no installation or update guarantee.

