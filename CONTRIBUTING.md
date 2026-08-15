# Contributing to WinBridge Recovery

Thank you for helping improve WinBridge Recovery.

WinBridge Recovery is an independent, non-commercial open-source project focused on Windows Codex Desktop plugin recovery and diagnostics. The earlier script-based predecessor is preserved at [codex-desktop-plugin-repair-safety-kit](https://github.com/zemeng5208/codex-desktop-plugin-repair-safety-kit), while active development, support, issues, and releases are maintained in this repository.

WinBridge is a **plugin/runtime recovery tool**, not a Computer Use/Browser task-checkpoint system. The project intentionally does not attempt to restore the last clicked/viewed page, reconstruct action or screenshot history, recover hidden Agent/CUA execution state, or resume an interrupted task from the exact execution step. It also does not add background screen/key/activity recording as a partial substitute. See `SCOPE-AND-LIMITATIONS.md` before proposing work in this area.

## Reporting a bug

Use the repository's **Bug report** issue form and include, when relevant:

- WinBridge Recovery version
- Windows version
- Codex Desktop package version
- affected surface: Browser, Chrome, Computer Use, marketplace/cache, `latest`, runtime path, installer, portable package, or launcher
- the smallest reproducible sequence
- the minimal diagnostic output needed to understand the problem

Please search existing issues first when practical.

Failure to restore a previously interrupted Computer Use/Browser task, page, action history, hidden task state, or exact execution step is not by itself a WinBridge repair bug because those capabilities are outside the supported product scope.

## Privacy and safety

Never post:

- passwords or credentials
- cookies or authentication tokens
- API keys
- session databases
- private keys or signing material
- complete private configuration files
- logs containing account, machine, or personal information that is unrelated to the bug

Redact usernames, IDs, account data, private paths, and unrelated configuration values before posting diagnostics.

WinBridge Recovery does not bypass enterprise, browser, account, or security policy decisions. Requests to add such bypasses are out of scope.

Do not add broad user-activity collection, background screen recording, key logging, or hidden task-state extraction in an attempt to emulate unsupported task/session checkpoint recovery.

## Feature requests

Use the **Feature request** issue form. Explain the real recovery, diagnostics, compatibility, safety, packaging, or user-experience problem the proposal would solve.

Proposals whose primary goal is exact Computer Use/Browser session restoration, hidden CUA state recovery, or exact-step task continuation are intentionally outside the current roadmap unless a stable, supported interface becomes available that permits reliable recovery without weakening the project's privacy and safety model.

## Questions

Use the **General question** form for setup, compatibility, diagnosis, backup/rollback, build, project-scope, or expected-behavior questions that are not clearly bugs.

## Pull requests

Small, focused pull requests are preferred. Please:

1. Explain the problem being addressed.
2. Keep unrelated refactors out of the same change when possible.
3. Preserve the project's safety boundaries.
4. Do not add or redistribute official OpenAI/Codex application or plugin payloads.
5. Do not add credentials, machine-local configuration, logs, backups, or private signing material.
6. Do not add unsupported hidden task-state extraction or broad activity recording as an attempted checkpoint system.
7. Document meaningful user-visible changes.
8. Include relevant validation or test notes when behavior changes.

## Project history

Active development is maintained in **WinBridge Recovery**. The earlier Safety Kit repository remains public to preserve the script-based predecessor and its original Git history rather than rewriting that history into this repository.
