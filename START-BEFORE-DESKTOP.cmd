@echo off
setlocal
cd /d "%~dp0"
title WinBridge Recovery
echo Close ChatGPT Desktop from the system tray first.
echo This launcher will close Chrome and Edge completely.
echo Unsaved browser forms or active downloads can be lost.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Invoke-WinBridge-Configured.ps1" -Mode RepairAndLaunch -NoPause
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Launcher failed. Review the error above and the newest file in Logs.
if "%RC%"=="0" echo Launcher completed successfully.
echo Press Enter to close.
set /p "CHATGPT_PLUGIN_LAUNCHER_WAIT="
exit /b %RC%
