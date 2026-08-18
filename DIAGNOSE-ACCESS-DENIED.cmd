@echo off
setlocal
cd /d "%~dp0"
echo [INFO] WinBridge Recovery 4.0 - Access Denied / File Lock Diagnosis
echo [INFO] This is read-only. It does not stop processes or change security policy/ACLs.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0WinBridge-4.0-AccessGuard.ps1" -Mode Diagnose -LauncherRoot "%~dp0"
set "rc=%ERRORLEVEL%"
echo.
if not "%rc%"=="0" echo [WARN] Diagnostic process returned exit code %rc%.
echo [INFO] Check the Logs folder for access-guard-*.txt.
pause
exit /b %rc%
