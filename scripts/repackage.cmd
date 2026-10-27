@echo off
rem Repackage releases\v26.55 from the existing build (no rebuild). Close any running VeloPhi first.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 > .cache\repackage-26.55.log 2>&1
type .cache\repackage-26.55.log
pause
