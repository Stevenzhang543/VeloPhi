# VeloPhi APK checks on the MuMu Android emulator (26.59 fix 3). Finds adb (the Android SDK of build-apk, or
# MuMu's own), connects to the running MuMu instance, and runs one step:
#   probe    - where adb and MuMu are, which devices answer, Android version, screen size
#   install  - install releases\v26.59\VeloPhi-v26.59-android.apk (or -Apk <path>) and start it
#   rotate   - start the app, then turn the screen landscape / portrait N times (-Times), with logcat
#   logcat   - the last crash buffer and the app's log
#   cdp      - (test APK) rotation checks through the WebView's DevTools protocol: scripts\android\mumu-cdp.mjs
#              with -Plan rotate (one run with screenshots) or matrix (CSS variants, to find what a WebView trips on)
#   shot     - a screenshot of the emulator (.cache\mumu\shot.png)
# Output goes to .cache\mumu\<step>.log (read by whoever started it); no Git, nothing outside the repository changes.
param(
  [ValidateSet('probe', 'install', 'rotate', 'logcat', 'cdp', 'shot', 'a11y-off', 'a11y-on')][string]$Step = 'probe',
  [string]$Apk = '',
  [int]$Times = 6,
  [string]$Plan = 'rotate',
  [int]$Cycles = 3,
  [string]$Tag = '',
  [int]$Devtools = 0,
  [string]$Compat = ''
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $root '.cache\mumu'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$log = Join-Path $out "$Step$Tag.log"
"VeloPhi MuMu check: $Step  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -Encoding UTF8 $log
function Log([string]$s) { $s | Add-Content -Encoding UTF8 $log; Write-Host $s }
$pkg = 'app.velophi.physics'

# ---- adb ----
$cands = @()
$sdk = Join-Path $env:LOCALAPPDATA 'VeloPhi-Android\sdk\platform-tools\adb.exe'
if (Test-Path $sdk) { $cands += $sdk }
$roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, 'C:\', 'D:\', 'E:\', 'F:\') | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$mumuExe = $null
foreach ($r in $roots) {
  foreach ($d in @('Netease', 'MuMu', 'MuMuPlayer', 'MuMuPlayer-12.0', 'Program Files\Netease', 'Netease\MuMuPlayer-12.0', 'Netease\MuMu Player 12', 'Netease\MuMu')) {
    $p = Join-Path $r $d
    if (-not (Test-Path $p)) { continue }
    Get-ChildItem -Path $p -Recurse -Depth 4 -Filter 'adb.exe' -ErrorAction SilentlyContinue | ForEach-Object { $cands += $_.FullName }
    if (-not $mumuExe) {
      $m = Get-ChildItem -Path $p -Recurse -Depth 4 -Include 'MuMuPlayer.exe', 'MuMuNxDevice.exe', 'MuMuManager.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($m) { $mumuExe = $m.FullName }
    }
  }
}
$onPath = (Get-Command adb -ErrorAction SilentlyContinue).Source
if ($onPath) { $cands += $onPath }
$cands = $cands | Select-Object -Unique
Log "adb candidates: $($cands -join ' | ')"
Log "MuMu: $mumuExe"
if (-not $cands) { Log 'NO ADB FOUND'; exit 2 }
$adb = $cands[0]
Log "using adb: $adb"
function Adb { $r = & $adb @args 2>&1; ($r | ForEach-Object { "$_" } | Out-String).TrimEnd() }

# ---- connect (MuMu 12: 16384 + 32*n; older: 7555) ----
Log (Adb start-server)
foreach ($port in 16384, 16416, 16448, 7555, 5555) { Log "connect ${port}: $(Adb connect "127.0.0.1:$port")" }
$devs = Adb devices
Log "devices:`n$devs"
$serial = ($devs -split "`n" | Where-Object { $_ -match '\tdevice$' } | ForEach-Object { ($_ -split "`t")[0] } | Select-Object -First 1)
if (-not $serial) { Log 'NO DEVICE (start MuMu first)'; exit 3 }
Log "serial: $serial"
# One string per shell command (PowerShell would read -p, -n ... as its own parameters)
function Sh([string]$cmd) { $r = & $adb -s $serial shell $cmd 2>&1; ($r | Out-String).TrimEnd() }

switch ($Step) {
  'probe' {
    Log "android: $(Sh "getprop ro.build.version.release") sdk $(Sh "getprop ro.build.version.sdk") abi $(Sh "getprop ro.product.cpu.abilist")"
    Log "model: $(Sh "getprop ro.product.model")"
    Log "wm size: $(Sh "wm size")  density: $(Sh "wm density")"
    Log "webview: $(Sh "dumpsys webviewupdate" | Select-String -Pattern 'Current WebView package' | Out-String)"
    Log "installed: $(Sh "pm list packages $pkg")"
    Log "rotation: accelerometer=$(Sh "settings get system accelerometer_rotation") user=$(Sh "settings get system user_rotation")"
    Log "accessibility: enabled=$(Sh "settings get secure accessibility_enabled") services=$(Sh "settings get secure enabled_accessibility_services")"
    Log "accessibility services running: $(Sh "dumpsys accessibility" | Select-String -Pattern 'Bound services|Enabled services|installed' | Out-String)"
  }
  'install' {
    if (-not $Apk) { $Apk = Join-Path $root 'releases\v26.59\VeloPhi-v26.59-android.apk' }
    Log "apk: $Apk ($((Get-Item $Apk).Length) bytes)"
    Log (Adb -s $serial install -r -g $Apk)
    Log (Sh "monkey -p $pkg -c android.intent.category.LAUNCHER 1")
    Start-Sleep -Seconds 8
    Log "pid: $(Sh "pidof $pkg")"
  }
  'rotate' {
    # Without the DevTools switch (as on a phone) unless asked; -Compat sets debug.velophi.compat (MainActivity hands
    # it to the page as window.__velophiCompat, see src/app/compat.ts)
    Sh "setprop debug.velophi.devtools $Devtools" | Out-Null
    Sh "setprop debug.velophi.compat '$(if ($Compat) { $Compat } else { 'none' })'" | Out-Null
    Log "devtools=$Devtools compat=$Compat"
    Log (Adb -s $serial logcat -c)
    Log (Sh "am force-stop $pkg")
    Log (Sh "monkey -p $pkg -c android.intent.category.LAUNCHER 1")
    Start-Sleep -Seconds 10
    $pid0 = Sh "pidof $pkg"
    Log "pid after start: $pid0"
    Sh "settings put system accelerometer_rotation 0" | Out-Null
    for ($i = 1; $i -le $Times; $i++) {
      $rot = if ($i % 2 -eq 1) { 1 } else { 0 }
      Sh "settings put system user_rotation $rot" | Out-Null
      Start-Sleep -Seconds 4
      $p = Sh "pidof $pkg"
      Log "rotation $i -> user_rotation=$rot  pid=$p  $(if ($p -ne $pid0) { 'PROCESS CHANGED OR GONE' } else { 'ok' })"
      if (-not $p) { break }
      # After a recovery (the app restarted itself) keep turning the new process
      if ($p -ne $pid0) { $pid0 = $p }
    }
    Sh "settings put system user_rotation 0" | Out-Null
    Log '---- logcat (crash buffer, without minidumps) ----'
    Log ((Adb -s $serial logcat -d -b crash) -split "`n" | Where-Object { $_ -notmatch 'crashpad' } | Select-Object -Last 120 | Out-String)
    Log '---- logcat (app, chromium, tauri, errors) ----'
    $all = Adb -s $serial logcat -d -v time
    ($all -split "`n" | Where-Object { $_ -match 'velophi|chromium|Tauri|RustStdoutStderr|AndroidRuntime|FATAL|DEBUG|libc|WebView|cr_|E/|F/' } | Select-Object -Last 400) -join "`n" | Add-Content -Encoding UTF8 $log
  }
  'cdp' {
    Sh "setprop debug.velophi.devtools 1" | Out-Null
    Log "devtools prop: $(Sh "getprop debug.velophi.devtools")"
    Sh "logcat -c" | Out-Null
    & node (Join-Path $root 'scripts\android\mumu-cdp.mjs') --adb $adb --serial $serial --out $out --plan $Plan --cycles $Cycles 2>&1 | ForEach-Object { Log "$_" }
    Log '---- logcat (renderer, recovery) ----'
    $all = Adb -s $serial logcat -d -v time
    ($all -split "`n" | Where-Object { $_ -match 'VeloPhi|Render process|crash wasn|FATAL|Abort message|signal 11|signal 5|RecoverActivity|AndroidRuntime' } | Select-Object -Last 120) -join "`n" | Add-Content -Encoding UTF8 $log
  }
  # Accessibility services make Chromium build its accessibility tree; switch them off (remembering the list) or on
  'a11y-off' {
    $svc = Sh "settings get secure enabled_accessibility_services"
    $svc | Set-Content -Encoding ASCII (Join-Path $out 'a11y-services.txt')
    Log "services were: $svc"
    Sh "settings put secure enabled_accessibility_services ''" | Out-Null
    Sh "settings put secure accessibility_enabled 0" | Out-Null
    Log "now: enabled=$(Sh "settings get secure accessibility_enabled") services=$(Sh "settings get secure enabled_accessibility_services")"
  }
  'a11y-on' {
    $f = Join-Path $out 'a11y-services.txt'
    $svc = if (Test-Path $f) { (Get-Content -Raw $f).Trim() } else { '' }
    if ($svc -and $svc -ne 'null') { Sh "settings put secure enabled_accessibility_services $svc" | Out-Null; Sh "settings put secure accessibility_enabled 1" | Out-Null }
    Log "now: enabled=$(Sh "settings get secure accessibility_enabled") services=$(Sh "settings get secure enabled_accessibility_services")"
  }
  'shot' {
    $png = Join-Path $out 'shot.png'
    cmd /c "`"$adb`" -s $serial exec-out screencap -p > `"$png`""
    Log "shot: $png ($((Get-Item $png).Length) bytes)"
  }
  'logcat' {
    Log (Adb -s $serial logcat -d -b crash)
    $all = Adb -s $serial logcat -d -v time
    ($all -split "`n" | Select-Object -Last 600) -join "`n" | Add-Content -Encoding UTF8 $log
  }
}
Log "done $Step"
