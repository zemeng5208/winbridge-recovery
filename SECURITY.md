# Security

## Scope

This project manages local launcher state for ChatGPT/Codex Desktop on Windows. Reports about unintended file writes, unsafe path handling, secret exposure, backup deletion, command injection, privilege escalation, or installer/uninstaller behavior are in scope.

## Reporting

Open a GitHub issue with a minimal reproduction that does not contain account credentials, browser cookies, API keys, access tokens, private certificates, session databases, or personal absolute paths. Redact usernames and machine-specific values from logs before attaching them.

Do not publish live credentials as a proof of concept. Revoke any credential that may already have been exposed.

## Trust model

- The launcher consumes resources from the locally installed official Desktop package.
- The project test certificate is self-signed and is not a publicly trusted commercial certificate.
- The repository may contain the public `.cer` certificate; it must never contain its private key.
- A successful static check does not prove all plugin surfaces are available at runtime.
