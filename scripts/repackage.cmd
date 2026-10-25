@echo off
rem Repackage releases\v26.51 from the existing build (no rebuild). Close any running Verity first.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 > .cache\repackage-26.51.log 2>&1
type .cache\repackage-26.51.log
pause
