# WinBridge Recovery UI

This is the external WPF interface for the repair engine in the parent folder.

## Modes

- Default: runs `RepairAndLaunch`.
- `--diagnose`: runs the existing `DiagnoseOnly` mode.
- `--demo`: visual and parser demonstration without running the repair engine.

## Build

Run `Build-LauncherUI.ps1` with Windows PowerShell 5.1. It uses the installed .NET Framework compiler through `Add-Type`; no SDK or downloaded dependency is required.

The UI does not duplicate or replace the repair algorithm. It launches `Start-WinBridge-Recovery.ps1`, reads its standard output, and maps verified log messages to progress and plugin state.
