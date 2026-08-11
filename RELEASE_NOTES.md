# WinBridge Recovery v2.1.0 Beta 1

Independent Windows recovery launcher for GPT/Codex Desktop Browser, Chrome, and Computer Use plugin state.

## Highlights

- New neutral product name and original WinBridge visual identity.
- Removed third-party logo-style assets and the optional X/Twitter feed feature.
- Added clear non-affiliation, student, non-commercial, and third-party-rights notices.
- Preserved version-aware marketplace, cache, runtime, registration, backup, rollback, and launch workflows.
- Hardened installer paths against directory junction/reparse-point traversal.
- Hardened uninstall so it removes only the manifest-owned product folder and preserves unrelated files in a user-selected parent directory.
- Desktop shortcut is now `WinBridge Recovery.lnk` and will not overwrite an unrelated shortcut with the same name.

## Verification

- Launcher and guardian compilation: PASS.
- Installer compilation: PASS.
- Isolated silent install: PASS.
- Isolated uninstall: PASS.
- Unrelated file in selected install parent survived uninstall: PASS.
- Recovery backup directory preserved by default: PASS.
- Source privacy/secret scan: 0 matches for configured high-risk patterns.

The installer uses a self-signed testing certificate. Windows may report an untrusted certificate chain. Verify the published SHA-256 before running it.
