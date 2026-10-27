# Packages a finished build into releases\v26.55 (no rebuild). Run from the repository root.
# Never deletes: an existing releases\v26.55 is moved aside to .cache\superseded-<time> first.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Version = '26.55'
$Full = '26.55.0'
$Root = (Get-Location).Path
$Out = Join-Path $Root "releases\v$Version"
$Ev = Join-Path $Root ".cache\evidence-$Version"
$Stage = Join-Path $Root ".cache\stage-$Version"

function Fail($msg) { Write-Host "PACKAGE FAILED: $msg"; exit 1 }

$exe = Join-Path $Root 'src-tauri\target\release\velophi.exe'
$setup = Join-Path $Root "src-tauri\target\release\bundle\nsis\VeloPhi_${Full}_x64-setup.exe"
foreach ($f in @($exe, $setup, (Join-Path $Root 'dist\index.html'))) { if (-not (Test-Path $f)) { Fail "missing $f" } }

if (Test-Path $Out) {
  $aside = Join-Path $Root (".cache\superseded-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Force -Path $aside | Out-Null
  Move-Item -Path $Out -Destination $aside
  Write-Host "previous release folder moved to $aside"
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
if (Test-Path $Stage) { Move-Item -Path $Stage -Destination ($Stage + '-old-' + (Get-Date -Format 'HHmmss')) }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
New-Item -ItemType Directory -Force -Path $Ev | Out-Null

# Executables
Copy-Item $exe (Join-Path $Out "VeloPhi-v$Version-windows-x64-portable.exe")
Copy-Item $setup (Join-Path $Out "VeloPhi-v$Version-windows-x64-setup.exe")

# Web package: the built front end + hosting notes
$web = Join-Path $Stage 'web'
New-Item -ItemType Directory -Force -Path $web | Out-Null
Copy-Item -Recurse (Join-Path $Root 'dist\*') $web
Copy-Item (Join-Path $Root 'docs\WEB_HOSTING.md') (Join-Path $web 'HOSTING.md')
Compress-Archive -Path (Join-Path $web '*') -DestinationPath (Join-Path $Out "VeloPhi-v$Version-web.zip") -CompressionLevel Optimal

# Source package: the working tree without generated or local folders
$src = Join-Path $Stage "VeloPhi-v$Version-source"
New-Item -ItemType Directory -Force -Path $src | Out-Null
$exclude = @('node_modules', 'dist', '.cache', 'releases', 'target', 'gen', '.git', '.verity-workspace')
Get-ChildItem -Path $Root -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
  if ($_.PSIsContainer) {
    robocopy $_.FullName (Join-Path $src $_.Name) /E /XD target gen node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
  } else { Copy-Item $_.FullName $src }
}
Compress-Archive -Path $src -DestinationPath (Join-Path $Out "VeloPhi-v$Version-source.zip") -CompressionLevel Optimal

# Documents
Copy-Item (Join-Path $Root ("docs\RELEASE_NOTES_" + ($Version -replace '\.', '_') + ".md")) (Join-Path $Out 'RELEASE_NOTES.md')
Copy-Item (Join-Path $Root 'docs\THIRD_PARTY_NOTICES.md') (Join-Path $Out 'THIRD_PARTY_NOTICES.md')
Copy-Item (Join-Path $Root 'README.md') (Join-Path $Out 'README.md')

# Evidence: logs, test report, build info
Copy-Item (Join-Path $Root ".cache\release-$Version.log") $Ev -ErrorAction SilentlyContinue
$info = [ordered]@{
  product = 'VeloPhi'; version = $Full; builtAt = (Get-Date).ToString('s')
  node = (node --version); rustc = (rustc --version); os = [System.Environment]::OSVersion.VersionString
  webview2 = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv
}
$info | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Ev 'build-info.json')
if (Test-Path (Join-Path $Root 'docs\reports')) {
  # Copy the contents so a second packaging run refreshes the files instead of nesting a reports folder
  New-Item -ItemType Directory -Force -Path (Join-Path $Ev 'reports') | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Root 'docs\reports\*') (Join-Path $Ev 'reports')
}
Compress-Archive -Path (Join-Path $Ev '*') -DestinationPath (Join-Path $Out "VeloPhi-v$Version-release-evidence.zip") -CompressionLevel Optimal

# Checksums
$lines = Get-ChildItem $Out -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object Name | ForEach-Object {
  $h = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  "$h  $($_.Name)"
}
Set-Content -Encoding ASCII -Path (Join-Path $Out 'SHA256SUMS.txt') -Value $lines

# The expected file set
$expected = @(
  'README.md', 'RELEASE_NOTES.md', 'SHA256SUMS.txt', 'THIRD_PARTY_NOTICES.md',
  "VeloPhi-v$Version-release-evidence.zip", "VeloPhi-v$Version-source.zip", "VeloPhi-v$Version-web.zip",
  "VeloPhi-v$Version-windows-x64-portable.exe", "VeloPhi-v$Version-windows-x64-setup.exe"
) | Sort-Object
$actual = Get-ChildItem $Out -File | ForEach-Object Name | Sort-Object
if (Compare-Object $expected $actual) { Fail ("file set differs: " + ((Compare-Object $expected $actual | ForEach-Object { $_.SideIndicator + $_.InputObject }) -join ', ')) }
Get-ChildItem $Out -File | ForEach-Object { '{0,12:N0}  {1}' -f $_.Length, $_.Name }
Write-Host "PACKAGE OK $Out"
