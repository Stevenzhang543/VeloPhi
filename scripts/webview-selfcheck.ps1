# Release self-check inside WebView2 (26.51; 26.53 D69): starts the built desktop app with --selftest, which runs every
# template on the native Rust engine of the app, on the WebAssembly core in the worker and on the interface thread,
# compares the fingerprints, writes the report and closes (see src/app/selfCheck.ts). Fails when the app does not
# finish in 10 minutes, the native engine was not used, or any template differs.
$ErrorActionPreference = 'Stop'
$Root = (Get-Location).Path
$Version = '26.55'
$Ev = Join-Path $Root ".cache\evidence-$Version"
New-Item -ItemType Directory -Force -Path $Ev | Out-Null
$exe = Join-Path $Root 'src-tauri\target\release\velophi.exe'
$report = Join-Path $Ev 'webview-selfcheck.json'
if (Test-Path $report) { Move-Item $report ($report + '.old-' + (Get-Date -Format 'HHmmss')) }
$p = Start-Process -FilePath $exe -ArgumentList @('--selftest', $report) -PassThru
if (-not $p.WaitForExit(600000)) { $p.Kill(); Write-Host 'SELFCHECK FAILED: timeout'; exit 2 }
if (-not (Test-Path $report)) { Write-Host 'SELFCHECK FAILED: no report'; exit 3 }
$r = Get-Content $report -Raw | ConvertFrom-Json
Write-Host ("templates {0}, {1:N1} s, native {2} ms, worker {3} ms, {4}" -f $r.templates, $r.seconds, $r.nativeMs, $r.workerMs, $r.userAgent)
if (-not $r.ok) { Write-Host ('SELFCHECK FAILED: ' + ($r.mismatches -join ', ')); exit 1 }
Write-Host 'SELFCHECK OK: native Rust and WebAssembly agree in WebView2'
