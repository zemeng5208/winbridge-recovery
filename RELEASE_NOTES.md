# WinBridge Recovery v3.0.0 Beta 1

Independent Windows recovery launcher for GPT/Codex Desktop Browser, Chrome, and Computer Use plugin state.

## Highlights

- Adapts to current package runtime paths through the official `cua_node/manifest.json` contract.
- Uses the full package version and bundled-plugin, CLI, and CUA hashes for resource-mirror identity.
- Removes the obsolete requirement for `cua_node/bin/CHANGELOG.md`.
- Adds long-path-safe backup manifest creation and validation for deeply nested dependencies.
- Keeps the newest two valid resource mirrors while accepting both legacy and v3 mirror names.
- Preserves the existing marketplace, cache, `latest`, registration, rollback, safe-launch, theme, and mini-game workflows.

## Verification

- Launcher and guardian compilation: PASS.
- Installer compilation: PASS.
- PowerShell syntax and self-test: PASS.
- Long-path backup regression (315-character dependency path): PASS.
- Current package adaptation (`26.803.10989.0`): PASS.
- Browser, Chrome, and Computer Use independent interaction checks: PASS on the development machine.
- Isolated silent install: PASS.
- Isolated uninstall: PASS.
- Unrelated file in selected install parent survived uninstall: PASS.
- Recovery backup directory preserved by default: PASS.
- Source privacy/secret scan: 0 matches for configured high-risk patterns.

## Upgrade note

v3 replaces stale v1/v2 resource mirrors only when validation fails. It does not bundle official application or plugin files; recovery content is derived from the official package installed on the target computer.

The installer uses a self-signed testing certificate. Windows may report an untrusted certificate chain. Verify the published SHA-256 before running it.

## Download verification

```text
SHA256  8F6158F88D501B75B9B252493CFF5B7086111A6BBE968172F3C172DACDF0A560  WinBridge-Recovery-Setup.exe
SHA256  704AC5FC15DB8D74F3BC9FC5BCC7A5B677342049D2E9D8B211885F9DE74527DC  WinBridge-Recovery-v3.0.0-beta.1-portable.zip
```

The portable ZIP contains 26 runtime/documentation files, passed the packaged self-test after extraction, and contains no machine-local configuration, logs, backups, resource mirrors, credentials, private signing material, or official Desktop/plugin payloads.
