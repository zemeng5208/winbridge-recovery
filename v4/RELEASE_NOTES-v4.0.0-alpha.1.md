# WinBridge Recovery 4.0.0 Alpha 1

**Development Preview / 开发预览**

This pre-release publishes the first collaborative source snapshot of WinBridge Recovery 4.0. It is intended for development, review, and testing only.

## Included

- New isolated Electron runtime and Worker architecture.
- Diagnose-first workflow with explicit user decision before repair.
- Structured, bounded terminal output with semantic highlighting.
- Independent Browser, Chrome, and Computer Use status surfaces.
- Configurable layouts, material modes, colors, and accessibility fallbacks.
- Fluid progress presentation with trusted progress gating.
- Snake and Minesweeper development previews.
- Fixed-operation social feed architecture with bounded cache and translation contracts.
- Frozen 3.1.1 engine snapshot and validation gates.
- 74 automated runtime and security-boundary tests passing at the publication checkpoint.

## Important limitations

- This is not a stable release.
- Real repair is disabled by default and has not received final 4.0 acceptance.
- The interface, APIs, settings schema, and packaging layout may change.
- No installer, portable ZIP, executable, or other binary asset is included in this pre-release.
- Continue using 3.1.1 for normal daily use.

## Contributing

Use the `v4-development` branch as the integration base. Create a focused branch and open a pull request back to `v4-development`. Please include the relevant validation output and avoid committing generated files or machine-local information.

## Verification recorded for this snapshot

- Runtime tests: 74 passed, 0 failed.
- Frontend integrity verification: passed.
- Frozen 3.1.1 snapshot verification: passed.
- Packaging input validation passed in the isolated development workspace. In the public-tree recheck, `npm ci` did not install the Electron runtime binary on this host, so its fresh `pack:check` stopped at that missing dependency. No package was created or attached.
