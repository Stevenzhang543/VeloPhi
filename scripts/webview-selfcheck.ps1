# Release self-check inside WebView2 (26.52): starts the built desktop app with --selftest, which runs every
# template with Rust/WebAssembly and TypeScript in the real WebView2, compares the fingerprints, writes the report
# and closes (see src/app/selfCheck.ts). Fails when the app does not finish in 10 minutes or any template differs.
$ErrorActionPreference = 'Stop'
$Root = (Get-Location).Path
$Version = '26.52'
$Ev = Join-Path $Root ".cache\evidence-$Version"
New-Item -ItemType Directory -Force -Path $Ev | Out-Null
$exe = Join-Path $Root 'src-tauri\target\release\velophi.exe'
$report = Join-Path $Ev 'webview-selfcheck.json'
if (Test-Path $report) { Move-Item $report ($report + '.old-' + (Get-Date -Format 'HHmmss')) }
$p = Start-Process -FilePath $exe -ArgumentList @('--selftest', $report) -PassThru
if (-not $p.WaitForExit(600000)) { $p.Kill(); Write-Host 'SELFCHECK FAILED: timeout'; exit 2 }
if (-not (Test-Path $report)) { Write-Host 'SELFCHECK FAILED: no report'; exit 3 }
$r = Get-Content $report -Raw | ConvertFrom-Json
Write-Host ("templates {0}, {1:N1} s, {2}" -f $r.templates, $r.seconds, $r.userAgent)
if (-not $r.ok) { Write-Host ('SELFCHECK FAILED: ' + ($r.mismatches -join ', ')); exit 1 }
Write-Host 'SELFCHECK OK: Rust/WebAssembly and TypeScript agree in WebView2'
