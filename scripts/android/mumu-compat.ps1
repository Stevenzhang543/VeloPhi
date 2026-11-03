# VeloPhi 26.59 fix 3 (D192): which rendering feature makes the emulator's WebView crash when the screen turns.
# Runs scripts\android\mumu.ps1 -Step rotate once without switches, once with WebView debugging on, then once per
# diagnosis switch of src\app\compat.ts (debug.velophi.compat), and writes a table to .cache\mumu\compat.log.
# A run "crashes" when the app process changes or disappears while turning (with the 26.59 fix 3 APK the app
# restarts itself, so the process id changes). Needs the test APK (build-apk.ps1 -Test) installed on MuMu.
param([int]$Times = 2, [string[]]$Flags = @('bare', 'nocore', 'noedge', 'sw', 'blank', 'nocv', 'nocq', 'nohas', 'nobackdrop', 'noglass', 'noclip', 'nocontain', 'noanim', 'nofixed', 'nogrid', 'notransform', 'nofilter', 'nosticky', 'nooverflow'))
$ErrorActionPreference = 'Continue'
# -Flags a,b,c from cmd arrives as one string
$Flags = @($Flags | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$out = Join-Path $root '.cache\mumu'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$table = Join-Path $out 'compat.log'
"VeloPhi compat matrix $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -Encoding UTF8 $table
$mumu = Join-Path $PSScriptRoot 'mumu.ps1'
function One([string]$name, [string]$compat, [int]$devtools) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $mumu -Step rotate -Times $Times -Tag "-c-$name" -Compat $compat -Devtools $devtools | Out-Null
  $log = Join-Path $out "rotate-c-$name.log"
  $lines = @(Get-Content -Encoding UTF8 $log | Where-Object { $_ -match '^rotation \d+' })
  $bad = @($lines | Where-Object { $_ -match 'CHANGED OR GONE' }).Count
  $gone = @($lines | Where-Object { $_ -match 'pid=\s+PROCESS' }).Count
  $row = '{0,-14} {1}/{2} rotations crashed{3}' -f $name, $bad, $lines.Count, $(if ($gone) { " ($gone without recovery)" } else { '' })
  $row | Add-Content -Encoding UTF8 $table
  Write-Host $row
}
One 'none' 'none' 0
One 'devtools' 'none' 1
# a+b runs the switches a and b together
foreach ($f in $Flags) { One $f ($f -replace '\+', ',') 0 }
'done' | Add-Content -Encoding UTF8 $table
