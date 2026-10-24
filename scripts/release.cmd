@echo off
rem Verity 26.48 release build (Windows). Double-click to run.
rem Runs: npm ci, type check, tests, Tauri build (web build + NSIS installer), packaging into releases\v26.48.
rem No Git write operations of any kind.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
if not exist .cache mkdir .cache
set "LOG=%CD%\.cache\release-26.48.log"
echo Verity 26.48 release started %date% %time% > "%LOG%"
echo [1/6] tools
(where node && node --version && where npm && call npm --version && where cargo && cargo --version && rustc --version) >> "%LOG%" 2>&1 || goto fail
echo [2/6] npm ci
call npm ci --no-audit --no-fund >> "%LOG%" 2>&1 || goto fail
echo [3/6] type check
call npx vue-tsc --noEmit -p . >> "%LOG%" 2>&1 || goto fail
echo [4/6] tests
if not exist .cache\evidence-26.48 mkdir .cache\evidence-26.48
call npx vitest run --reporter=default --reporter=junit --outputFile.junit=.cache\evidence-26.48\vitest-junit.xml >> "%LOG%" 2>&1 || goto fail
echo [5/6] tauri build (web build + Windows executable + NSIS installer)
call npx tauri build --ci >> "%LOG%" 2>&1 || goto fail
echo [6/6] package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 >> "%LOG%" 2>&1 || goto fail
echo RELEASE OK >> "%LOG%"
echo.
echo RELEASE OK - releases\v26.48
echo Log: %LOG%
if not defined NOPAUSE pause
exit /b 0
:fail
echo RELEASE FAILED >> "%LOG%"
echo.
echo RELEASE FAILED - see %LOG%
if not defined NOPAUSE pause
exit /b 1
