# WinBridge Recovery 4.0 — Access Guard

This document describes the first WinBridge Recovery 4.0 hardening work on the `v4-development` branch.

The design is based on real `Move-Item` / `Access Denied` failures where the visible symptom is the same but the real owner may differ: a running Desktop process, an orphan helper, a sampled file lock, antivirus/EDR/DLP/encryption software, ACL/reparse state, a file-system minifilter, or a short transient race.

## Goals

1. Stop repair before it begins when ChatGPT/Codex Desktop is still running.
2. Collect useful evidence without guessing which product or process is responsible.
3. Give `DiagnoseOnly` a read-only environment/lock report.
4. Capture a second report immediately after a core failure.
5. Reduce false failures caused by very short-lived directory rename/move contention.
6. Preserve the existing backup, rollback, source-integrity, and WindowsApps safety boundaries.

## Files

- `WinBridge-4.0-AccessGuard.ps1`
  - read-only process, lock, ACL, reparse, security, encryption, and filter-environment collector.
- `DIAGNOSE-ACCESS-DENIED.cmd`
  - one-click read-only entry point.
- `Invoke-WinBridge-Configured.ps1`
  - integrates preflight, diagnosis, post-failure collection, and the bounded runtime move retry patch.
- `RELEASE_NOTES.md`
  - development status and validation limits.

## Access Guard modes

### `Preflight`

Used automatically by `RepairAndLaunch`.

Exit codes:

- `0` — no immediate blocking condition was proven.
- `20` — ChatGPT/Codex Desktop is still running; repair is blocked.
- `21` — Restart Manager reported a process holding at least one sampled repair-target file; repair is blocked.
- `22` — Access Guard itself could not complete. The configured launcher logs a warning and falls back to the existing WinBridge core safety checks.

A security/encryption/DLP service candidate alone does **not** block repair because a name/path match does not prove that the product owns the failing handle or policy.

### `Diagnose`

Read-only collection. It reports risks but does not block the normal diagnostic flow.

### `PostFailure`

Runs automatically after the configured repair core has actually started and then fails. This gives a failure-time snapshot next to the normal run log.

## What the report collects

The report is written to:

```text
Logs\access-guard-YYYYMMDD-HHMMSS-<mode>.txt
```

It can include:

- Windows version/build/architecture;
- PowerShell version;
- repair target paths;
- target existence, attributes, last-write time, and reparse-point state;
- owner, protected-inheritance state, SDDL, and `icacls` output;
- ChatGPT/Codex Desktop processes;
- known plugin helpers such as `extension-host`, `node_repl`, and `codex-computer-use`;
- `node.exe` only when its path/command line contains Codex/plugin/CUA-specific indicators;
- Chrome/Edge presence as context;
- Restart Manager locking-process information for a bounded sample of files;
- Windows SecurityCenter antivirus-product names when available;
- conservative security/encryption/DLP service candidates;
- `fltmc filters` output when available;
- BitLocker status as read-only context.

The report can contain usernames, paths, service names, and process command lines. Redact it before posting publicly.

## Restart Manager limits

Restart Manager is useful but not absolute.

A clean Restart Manager result does **not** prove that the directory is free because the failure can still come from:

- a directory handle rather than a sampled file handle;
- a lock that exists only for a few milliseconds;
- a file-system minifilter;
- policy enforcement by enterprise security software;
- ACL/owner/DELETE/DELETE_CHILD rules;
- reparse/junction behavior;
- another condition Restart Manager does not expose.

The C# interop explicitly aliases:

```text
System.Runtime.InteropServices.ComTypes.FILETIME
```

so the diagnostic does not reproduce the earlier ambiguous `FILETIME` Add-Type error.

## Bounded atomic-move retry

The 4.0 configured launcher generates the normal runtime copy of `Start-WinBridge-Recovery.ps1`, then applies a checked patch to that runtime copy only.

The source core remains unchanged.

The patch replaces five atomic move/swap points with a helper that performs at most six attempts using short delays:

```text
250 ms
500 ms
1000 ms
1500 ms
2500 ms
```

The retry exists only to tolerate transient contention. It does not change permissions or security policy.

Before patching, the launcher verifies:

- exactly one `Install-DirectoryAtomically` function marker exists;
- every expected `Move-Item` source line exists exactly once.

If the core layout changes in a future version, the patch refuses to run instead of silently modifying an unknown script layout.

## Safety boundary

Do not add any future 4.0 fix that automatically:

- disables/uninstalls/bypasses EDR, DLP, antivirus, or encryption software;
- changes enterprise policy;
- takes ownership of the whole `.codex` tree;
- runs broad `icacls /reset` on `.codex`;
- changes ownership/ACLs under `C:\Program Files\WindowsApps`;
- deletes the entire `.codex` tree;
- kills every `node.exe` process;
- removes Recovery/Golden backup validation;
- removes source-integrity checks;
- uses injection, hooks, kernel drivers, or similar techniques to defeat security controls.

If a company security product or filter driver is the actual owner of the restriction, the supported path is to use the report with the company's IT/security administrator.

## Windows validation checklist

The code was authored/reviewed through GitHub from a non-Windows tool environment. Before release, perform these tests on real Windows.

### Baseline

- Windows 10 22H2 / build 19045 with Windows PowerShell 5.1.
- Windows 11 current supported build with Windows PowerShell 5.1.
- `DiagnoseOnly` with no ChatGPT/Codex Desktop running.
- `RepairAndLaunch` with a healthy plugin/runtime state.
- `SELF-TEST.cmd` and existing rollback flow.

### Concurrent Desktop

1. Start ChatGPT/Codex Desktop.
2. Start `RepairAndLaunch`.
3. Confirm Access Guard writes a report and exits with the Desktop-block condition before the repair core starts.
4. Confirm no target files were modified.

### Issue #5-style resource-mirror contention

1. Use a test-only process to hold a file inside the generated `R` staging/mirror tree.
2. Trigger a resource-mirror rebuild.
3. Confirm bounded retry logs each transient failure.
4. Release the test handle before the final attempt and confirm the swap succeeds.
5. Repeat while keeping the handle until all attempts are exhausted; confirm the operation fails and a post-failure report is produced.

### Issue #10-style plugin-cache contention

1. Hold a test file under `.codex\plugins\cache\openai-bundled\chrome`.
2. Confirm Restart Manager reports the test process when possible.
3. Confirm Preflight blocks before modification when the sampled file is reported locked.
4. Confirm a clean rerun succeeds after releasing the handle.

### Enterprise/security environment

On a managed test machine, if available:

- confirm security/encryption/DLP service candidates are reported as candidates only;
- confirm WinBridge does not stop/disable/reconfigure the product;
- confirm `fltmc` output is captured when permissions allow;
- confirm a policy-owned failure remains a failure after bounded retry and produces evidence for IT/security review.

### Regression

- backup creation and SHA-256 validation still pass;
- interrupted transaction rollback still works;
- `latest` pointers still reconcile correctly;
- Browser/Chrome/Computer Use cache repair still works;
- original `Start-WinBridge-Recovery.ps1` SHA-256 remains unchanged across the configured run;
- no generic unrelated `node.exe` is killed or treated as automatically removable.
