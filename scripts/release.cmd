@echo off
rem Verity 26.50 release build (Windows). Double-click to run.
rem Runs: npm ci, Rust engine tests and WebAssembly build, type check, tests, Tauri build (web build + NSIS
rem installer), packaging into releases\v26.50. No Git write operations of any kind.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
if not exist .cache mkdir .cache
set "LOG=%CD%\.cache\release-26.50.log"
echo Verity 26.50 release started %date% %time% > "%LOG%"
echo [1/8] tools
(where node && node --version && where npm && call npm --version && where cargo && cargo --version && rustc --version) >> "%LOG%" 2>&1 || goto fail
echo [2/8] npm ci
call npm ci --no-audit --no-fund >> "%LOG%" 2>&1 || goto fail
echo [3/8] Rust engine tests (native)
pushd engine
set "CARGO_TARGET_DIR=%CD%\target"
cargo test --release --workspace >> "%LOG%" 2>&1 || (popd & goto fail)
popd
set "CARGO_TARGET_DIR="
echo [4/8] Rust engine WebAssembly build
call scripts\build-engine.cmd >> "%LOG%" 2>&1 || goto fail
echo [5/8] type check
call npx vue-tsc --noEmit -p . >> "%LOG%" 2>&1 || goto fail
echo [6/8] tests
if not exist .cache\evidence-26.50 mkdir .cache\evidence-26.50
call npx vitest run --reporter=default --reporter=junit --outputFile.junit=.cache\evidence-26.50\vitest-junit.xml >> "%LOG%" 2>&1 || goto fail
echo [7/8] tauri build (web build + Windows executable + NSIS installer)
call npx tauri build --ci >> "%LOG%" 2>&1 || goto fail
echo [8/8] package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 >> "%LOG%" 2>&1 || goto fail
echo RELEASE OK >> "%LOG%"
echo.
echo RELEASE OK - releases\v26.50
echo Log: %LOG%
if not defined NOPAUSE pause
exit /b 0
:fail
echo RELEASE FAILED >> "%LOG%"
echo.
echo RELEASE FAILED - see %LOG%
if not defined NOPAUSE pause
exit /b 1
