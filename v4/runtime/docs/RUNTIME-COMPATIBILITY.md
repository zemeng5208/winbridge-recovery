# Runtime compatibility record

## Locked development toolchain

- Host development Node observed during the isolated build: `26.3.0`.
- npm observed during the isolated build: `11.16.0`.
- Electron is exactly locked to `43.4.0`.
- `@electron/packager` is exactly locked to `20.3.0`.
- Target package: Windows x64, portable directory, no installer and no signature in this phase.

Electron runs the main/preload code with its bundled Node/Chromium versions; the independent worker is forked with Electron's executable in Node mode in a packaged build. The host development Node is used only for dependency scripts and synthetic tests. No native addon is present, so there is no ABI rebuild requirement in this first runtime shell.

## Capability policy

- `npm start` and all synthetic tests: real repair capability is disabled.
- Packaged Electron alpha remains non-repairing unless launched with the exact `--enable-real-repair` switch. The main process requires both Electron's `app.isPackaged` and that switch, then passes only the derived boolean to its own Worker.
- Capability is not authorization. `startRepair(reportId)` still rejects when the report is absent, not current, expired, or contains only `report-only` categories. Only a direct fixed-channel API call with a current eligible report can reach the unchanged `RepairAndLaunch` entrypoint.
- Ordinary `npm start`, ordinary packaged double-click, lookalike arguments, and all synthetic tests keep the capability off. A future total-control-created test shortcut may carry the exact switch; this runtime task does not create it.
- No real diagnosis or repair was invoked during specialist validation.

## Local-content security

The renderer loads only a local `file:` document from the application root. Every IPC request is bound to the one BrowserWindow, its main frame, and the canonical real path of the selected entry; sibling-prefix, alternate local documents, subframes, and non-file URLs are rejected. Navigation is denied, new windows are denied and optionally handed to the system only for the explicit trusted HTTPS allowlist, webviews are disabled and blocked again at attachment time, permissions are denied, and the fallback document has a restrictive CSP with frames and objects disabled. The integrated UI must retain an equivalent or stricter CSP.
