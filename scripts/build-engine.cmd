@echo off
rem Build the Rust core as WebAssembly (manual 26.50, D29) and record its SHA-256.
rem Output: src\engine\velophi_core.wasm and src\engine\velophi_core.wasm.sha256
setlocal
set "ROOT=%~dp0.."
pushd "%ROOT%\engine" || (echo engine folder not found & exit /b 1)
set "CARGO_TARGET_DIR=%ROOT%\engine\target"
where cargo >nul 2>nul || (echo cargo not found: install Rust from https://rustup.rs & popd & exit /b 1)
rustup target list --installed | findstr /x "wasm32-unknown-unknown" >nul || rustup target add wasm32-unknown-unknown || (echo cannot add the wasm32-unknown-unknown target & popd & exit /b 1)
cargo build -p velophi-wasm --release --target wasm32-unknown-unknown || (echo WASM build failed & popd & exit /b 1)
popd
if not exist "%ROOT%\src\engine" mkdir "%ROOT%\src\engine"
copy /y "%ROOT%\engine\target\wasm32-unknown-unknown\release\velophi_wasm.wasm" "%ROOT%\src\engine\velophi_core.wasm" >nul || (echo copy failed & exit /b 1)
powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 '%ROOT%\src\engine\velophi_core.wasm').Hash.ToLower() | Set-Content -NoNewline -Encoding ascii '%ROOT%\src\engine\velophi_core.wasm.sha256'" || (echo hash failed & exit /b 1)
echo WASM built:
type "%ROOT%\src\engine\velophi_core.wasm.sha256"
echo.
endlocal
exit /b 0
