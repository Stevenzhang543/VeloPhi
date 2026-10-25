@echo off
rem Verity 26.51 release build (Windows). Double-click to run.
rem Runs: npm ci, Rust engine tests and WebAssembly build, type check, tests, Tauri build (web build + NSIS
rem installer), the engine self-check inside WebView2, packaging into releases\v26.51. No Git write operations of any kind.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
if not exist .cache mkdir .cache
set "LOG=%CD%\.cache\release-26.51.log"
echo Verity 26.51 release started %date% %time% > "%LOG%"
echo [1/9] tools
(where node && node --version && where npm && call npm --version && where cargo && cargo --version && rustc --version) >> "%LOG%" 2>&1 || goto fail
echo [2/9] npm ci
call npm ci --no-audit --no-fund >> "%LOG%" 2>&1 || goto fail
echo [3/9] Rust engine tests (native)
pushd engine
set "CARGO_TARGET_DIR=%CD%\target"
cargo test --release --workspace >> "%LOG%" 2>&1 || (popd & goto fail)
popd
set "CARGO_TARGET_DIR="
echo [4/9] Rust engine WebAssembly build
call scripts\build-engine.cmd >> "%LOG%" 2>&1 || goto fail
echo [5/9] type check
call npx vue-tsc --noEmit -p . >> "%LOG%" 2>&1 || goto fail
echo [6/9] tests
if not exist .cache\evidence-26.51 mkdir .cache\evidence-26.51
call npx vitest run --reporter=default --reporter=junit --outputFile.junit=.cache\evidence-26.51\vitest-junit.xml >> "%LOG%" 2>&1 || goto fail
echo [7/9] tauri build (web build + Windows executable + NSIS installer)
call npx tauri build --ci >> "%LOG%" 2>&1 || goto fail
echo [8/9] engine self-check in WebView2 (Rust/WebAssembly vs TypeScript, every template)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webview-selfcheck.ps1 >> "%LOG%" 2>&1 || goto fail
echo [9/9] package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 >> "%LOG%" 2>&1 || goto fail
echo RELEASE OK >> "%LOG%"
echo.
echo RELEASE OK - releases\v26.51
echo Log: %LOG%
if not defined NOPAUSE pause
exit /b 0
:fail
echo RELEASE FAILED >> "%LOG%"
echo.
echo RELEASE FAILED - see %LOG%
if not defined NOPAUSE pause
exit /b 1
