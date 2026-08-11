@echo off
setlocal
cd /d "%~dp0"
title WinBridge Recovery - Read-Only Diagnosis
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Invoke-WinBridge-Configured.ps1" -Mode DiagnoseOnly -NoPause
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Diagnosis failed. Review the error above and the newest file in Logs.
echo Press Enter to close.
set /p "CHATGPT_PLUGIN_LAUNCHER_WAIT="
exit /b %RC%
