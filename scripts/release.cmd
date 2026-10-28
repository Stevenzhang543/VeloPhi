@echo off
rem VeloPhi 26.56 release build (Windows). Double-click to run.
rem Runs: npm ci, Rust engine tests (native), WebAssembly build, type check, all tests on the new WebAssembly core,
rem the calculation parity check (TypeScript reference vs native Rust), Tauri build (web build + NSIS installer),
rem the check that the web build contains no reference code, the engine self-check inside WebView2 (native Rust vs
rem WebAssembly in the worker and on the interface thread, every template), packaging into releases\v26.56.
rem No Git write operations of any kind.
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."
if not exist .cache mkdir .cache
set "LOG=%CD%\.cache\release-26.56.log"
set "EV=%CD%\.cache\evidence-26.56"
if not exist "%EV%" mkdir "%EV%"
echo VeloPhi 26.56 release started %date% %time% > "%LOG%"
echo [1/11] tools
(where node && node --version && where npm && call npm --version && where cargo && cargo --version && rustc --version) >> "%LOG%" 2>&1 || goto fail
echo [2/11] npm ci
call npm ci --no-audit --no-fund >> "%LOG%" 2>&1 || goto fail
echo [3/11] Rust engine tests (native: core, WebAssembly ABI, native desktop engine)
pushd engine
set "CARGO_TARGET_DIR=%CD%\target"
cargo test --release --workspace >> "%LOG%" 2>&1 || (popd & goto fail)
popd
set "CARGO_TARGET_DIR="
echo [4/11] Rust engine WebAssembly build
call scripts\build-engine.cmd >> "%LOG%" 2>&1 || goto fail
echo [5/11] type check
call npx vue-tsc --noEmit -p . >> "%LOG%" 2>&1 || goto fail
echo [6/11] tests (on the WebAssembly core just built)
set "VELOPHI_CORE=wasm"
call npx vitest run --reporter=default --reporter=junit --outputFile.junit=.cache\evidence-26.56\vitest-junit.xml >> "%LOG%" 2>&1 || goto fail
set "VELOPHI_CORE="
echo [7/11] calculation parity (TypeScript reference vs native Rust)
call node scripts\calc-parity.mjs --random 30 --random2651 20 --random2652 20 --impacts 10 > "%EV%\calc-parity.txt" 2>&1 || (type "%EV%\calc-parity.txt" >> "%LOG%" & goto fail)
type "%EV%\calc-parity.txt" >> "%LOG%"
echo [8/11] tauri build (web build + Windows executable + NSIS installer)
call npx tauri build --ci >> "%LOG%" 2>&1 || goto fail
echo [9/11] web build contains no reference code
call node scripts\check-dist.mjs >> "%LOG%" 2>&1 || goto fail
echo [10/11] engine self-check in WebView2 (native Rust vs WebAssembly, every template)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webview-selfcheck.ps1 >> "%LOG%" 2>&1 || goto fail
echo [11/11] package
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 >> "%LOG%" 2>&1 || goto fail
echo RELEASE OK >> "%LOG%"
echo.
echo RELEASE OK - releases\v26.56
echo Log: %LOG%
if not defined NOPAUSE pause
exit /b 0
:fail
echo RELEASE FAILED >> "%LOG%"
echo.
echo RELEASE FAILED - see %LOG%
if not defined NOPAUSE pause
exit /b 1
