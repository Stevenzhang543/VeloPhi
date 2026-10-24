@echo off
rem Nova_A release: regenerate the Rhai signatures, run every check, build, collect evidence and package
rem the eleven-file release set into releases\v<label> (label = package.json version without ".0").
rem Never commits, stages or tags: the release is built from the working tree.
rem Summary: .cache\evidence-<label>\checks-release\checks.log   Packaging log: .cache\package-<label>.log
setlocal
cd /d "%~dp0.."
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version.replace(/\.0$/, '')"`) do set LABEL=%%v
if "%LABEL%"=="" (echo Could not read the version from package.json & exit /b 1)
taskkill /im "Nova_A-v%LABEL%-windows-x64-portable.exe" >nul 2>&1
taskkill /im "My Game.exe" >nul 2>&1
set OUT=.cache\evidence-%LABEL%\checks-release
if not exist "%OUT%" mkdir "%OUT%"
set SUM=%OUT%\checks.log
echo Nova_A %LABEL% release checks started %DATE% %TIME% > "%SUM%"
call :check rhai-signatures node scripts\generate-rhai-api-signatures.mjs
call :check component-primitives node scripts\generate-component-primitives.mjs --check
call :check component-enums node scripts\generate-component-enums.mjs --check
call pnpm build > "%OUT%\pnpm-build.log" 2>&1 && echo pnpm-build PASS >> "%SUM%" || (echo pnpm-build FAIL >> "%SUM%" & goto :done)
call pnpm tauri build > "%OUT%\tauri-build.log" 2>&1 && echo tauri-build PASS >> "%SUM%" || (echo tauri-build FAIL >> "%SUM%" & goto :done)
call :check tauri-test cargo test --manifest-path src-tauri\Cargo.toml
call :check tsc-node pnpm exec tsc --project tsconfig.node.json --noEmit
call :check cargo-fmt cargo fmt --all --check
call :check cargo-clippy cargo clippy --workspace --all-targets -- -D warnings
call :check cargo-test cargo test --workspace
call :check physics-stress cargo run --release -p nova_physics --example physics_stress
call :check physics-bench cargo run --release -p nova_physics --example physics_bench
call :check script-bench cargo run --release -p nova_script --example script_bench
rem Repository checks: manual, template catalog, ignore rules, typography, engine module boundaries.
for %%S in (audit-manual verify-template-catalog audit-repository-hygiene audit-typography build-engine-profile audit-engine-boundaries verify-engine-scheduler verify-engine-asset-admission verify-engine-platform-host) do call :check %%S node scripts\%%S.mjs
rem Behaviour checks (each writes .cache\verify\*.json and screenshots to release-audits\).
for %%S in (verify-2647-rhythm verify-2647-rhythm-editor verify-2647-rhythm-player bench-2647-rhythm-frame verify-2646-rhythm verify-2646-physics verify-2646-rhythm-editor verify-2646-rhythm-player verify-2645-physics verify-2645-prefabs verify-2645-input verify-2645-debugger verify-2645-effects verify-2644-animation verify-2644-level-tools verify-2644-editor-structure verify-2644-debugger verify-2644-trig verify-2643-character-edge verify-2643-event-timing verify-2643-scripting verify-2643-blocks verify-2643-player-boundary verify-2643-web-player verify-2643-editor-shell verify-2640-editor-workflow verify-2641-editor-ui verify-2642-glass-budget verify-2642-lighting verify-2642-lighting-render verify-2642-fixed-timers verify-2642-levels verify-2642-script-write-read verify-v26.11-templates verify-v26.12-api-signatures verify-v26.15-library-metadata) do (
  if exist "scripts\%%S.mjs" call :check %%S node scripts\%%S.mjs
)
if not exist "%OUT%\verify" mkdir "%OUT%\verify"
copy /y ".cache\verify\*.json" "%OUT%\verify\" >nul
if not exist ".cache\evidence-%LABEL%\screenshots" mkdir ".cache\evidence-%LABEL%\screenshots"
copy /y "release-audits\v%LABEL%-*" ".cache\evidence-%LABEL%\screenshots\" >nul
echo CHECKS-DONE %DATE% %TIME% >> "%SUM%"
findstr /c:" FAIL" "%SUM%" >nul && (echo PACKAGE-SKIPPED because a check failed >> "%SUM%" & goto :done)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-release.ps1 -Label %LABEL% > ".cache\package-%LABEL%.log" 2>&1 && echo package PASS >> "%SUM%" || echo package FAIL >> "%SUM%"
:done
echo RELEASE-DONE %DATE% %TIME% >> "%SUM%"
type "%SUM%"
endlocal
exit /b 0

:check
rem :check <name> <command...>  runs the command with its output in %OUT%\<name>.log and records PASS or FAIL.
set NAME=%~1
shift
set ARGS=
:collect
if "%~1"=="" goto :run
set ARGS=%ARGS% %1
shift
goto :collect
:run
call %ARGS% > "%OUT%\%NAME%.log" 2>&1 && echo %NAME% PASS >> "%SUM%" || echo %NAME% FAIL >> "%SUM%"
exit /b 0
