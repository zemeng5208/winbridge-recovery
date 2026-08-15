# Security

## Scope

This project manages local launcher and plugin/runtime recovery state for ChatGPT/Codex Desktop on Windows. Reports about unintended file writes, unsafe path handling, secret exposure, backup deletion, command injection, privilege escalation, or installer/uninstaller behavior are in scope.

Computer Use/Browser task-state reconstruction is **not** part of the security or product scope. WinBridge does not promise to restore the last page, click/action history, screenshots, files changed by a previous Agent task, unsaved editor buffers, hidden model context, internal CUA run state, or the exact execution step of an interrupted task.

## Reporting

Open a GitHub issue with a minimal reproduction that does not contain account credentials, browser cookies, API keys, access tokens, private certificates, session databases, or personal absolute paths. Redact usernames and machine-specific values from logs before attaching them.

Do not publish live credentials as a proof of concept. Revoke any credential that may already have been exposed.

A failure to resume an interrupted Computer Use/Browser task, recover its previous page, or reconstruct its action history is not by itself a WinBridge security defect or repair-core defect; see `SCOPE-AND-LIMITATIONS.md`.

## Data minimization

WinBridge intentionally avoids becoming a broad work-activity recorder. It does not add background screen recording, key logging, task click-history capture, or generalized work-context collection as a substitute for unsupported internal task checkpoint recovery.

This boundary reduces privacy exposure, permissions, sensitive local storage, and the amount of user activity data that the project would otherwise need to protect.

## Trust model

- The launcher consumes resources from the locally installed official Desktop package.
- The project test certificate is self-signed and is not a publicly trusted commercial certificate.
- The repository may contain the public `.cer` certificate; it must never contain its private key.
- A successful static check does not prove all plugin surfaces are available at runtime.
- A successful repair means plugin/runtime consistency has been restored; it does not mean a previously interrupted Computer Use/Browser task or internal session checkpoint has been restored.
- WinBridge is an independent external project and does not rely on unsupported access to hidden model context or internal task execution state.
