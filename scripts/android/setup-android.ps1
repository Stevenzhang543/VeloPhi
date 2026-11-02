# VeloPhi 26.59 (D176): installs or finds the Android build tools. No administrator rights are needed and nothing
# is written to the repository except .cache\android-env.ps1 (the paths below, for build-apk.ps1).
#
#   JDK 21          Microsoft Build of OpenJDK (fallback: Eclipse Temurin)
#   Android SDK     command-line tools, platform tools, the newest stable build tools, SDK platform 37, NDK
#   Rust            the four Android targets (rustup)
#
# Everything goes to one folder: $env:VELOPHI_ANDROID_HOME, default %LOCALAPPDATA%\VeloPhi-Android (C:\VeloPhi-Android
# when that path contains spaces, which the Android NDK does not accept). Run again at any time: what is already
# there is kept. Run from the repository root: powershell -ExecutionPolicy Bypass -File scripts\android\setup-android.ps1
param([string]$Root = $env:VELOPHI_ANDROID_HOME)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is many times faster without the progress bar
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]'Tls13' } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }

$Repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $Repo 'src-tauri\tauri.conf.json'))) { throw 'run this from the repository root' }
if (-not $Root) {
  $Root = Join-Path $env:LOCALAPPDATA 'VeloPhi-Android'
  if ($Root -match '\s') { $Root = 'C:\VeloPhi-Android' }
}
if ($Root -match '\s') { throw "the Android tools folder must not contain spaces: $Root" }
New-Item -ItemType Directory -Force -Path $Root, (Join-Path $Root 'downloads') | Out-Null
Write-Host "Android tools folder: $Root"

# Native tools write notes to stderr; in Windows PowerShell 5.1 that would stop the script under 'Stop'.
function Invoke-Native([scriptblock]$Block) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Block } finally { $ErrorActionPreference = $old }
}

function Get-File([string[]]$Urls, [string]$Out) {
  if ((Test-Path $Out) -and (Get-Item $Out).Length -gt 1MB) { Write-Host "  already downloaded: $Out"; return }
  foreach ($u in $Urls) {
    for ($i = 1; $i -le 3; $i++) {
      try {
        Write-Host "  downloading $u (try $i)"
        Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile "$Out.part" -TimeoutSec 1800
        Move-Item -Force "$Out.part" $Out
        return
      } catch { Write-Host "    failed: $($_.Exception.Message)"; Start-Sleep -Seconds (3 * $i) }
    }
  }
  throw "could not download $Out"
}

function Expand-Zip([string]$Zip, [string]$Dest) {
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (Test-Path $tar) { Invoke-Native { & $tar -xf $Zip -C $Dest }; if ($LASTEXITCODE -ne 0) { throw "tar failed on $Zip" } }
  else { Expand-Archive -Path $Zip -DestinationPath $Dest -Force }
}

# 1. JDK 21
$Jdk = Join-Path $Root 'jdk'
if ($env:VELOPHI_JAVA_HOME) { $Jdk = $env:VELOPHI_JAVA_HOME }
if (-not (Test-Path (Join-Path $Jdk 'bin\java.exe'))) {
  Write-Host '[1/5] JDK 21'
  $zip = Join-Path $Root 'downloads\jdk21.zip'
  Get-File @('https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip',
             'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk') $zip
  $tmp = Join-Path $Root 'jdk-unpack'
  Expand-Zip $zip $tmp
  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Move-Item $inner.FullName $Jdk
  Remove-Item -Recurse -Force $tmp
} else { Write-Host "[1/5] JDK found: $Jdk" }
$env:JAVA_HOME = $Jdk
Invoke-Native { & (Join-Path $Jdk 'bin\java.exe') -version 2>&1 | ForEach-Object { Write-Host "  $_" } }

# 2. Android command-line tools, pinned to 19.0 (build 13114758). From the 2026 releases on, sdkmanager is only a
#    deprecated wrapper around the new "android" CLI (different --list output, no licence step), so the classic tools
#    are used; a newer copy found in the SDK is moved aside to <root>\old (not deleted).
$Sdk = Join-Path $Root 'sdk'
$Tools = Join-Path $Sdk 'cmdline-tools\latest'
$SdkManager = Join-Path $Tools 'bin\sdkmanager.bat'
function Get-ToolsRevision {
  $p = Join-Path $Tools 'source.properties'
  if (-not (Test-Path $p)) { return $null }
  $line = Get-Content $p | Where-Object { $_ -match '^Pkg\.Revision=' } | Select-Object -First 1
  if ($line -and $line -match '=([0-9]+)') { return [int]$Matches[1] }
  return $null
}
$rev = Get-ToolsRevision
if ((Test-Path $Tools) -and ((-not $rev) -or $rev -gt 19)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'old') | Out-Null
  $aside = Join-Path $Root ("old\cmdline-tools-" + $(if ($rev) { $rev } else { 'unknown' }) + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Write-Host "  command-line tools revision $rev use the new Android CLI; moved to $aside"
  Move-Item $Tools $aside
}
if (-not (Test-Path $SdkManager)) {
  Write-Host '[2/5] Android command-line tools 19.0'
  $zip = Join-Path $Root 'downloads\cmdline-tools-13114758.zip'
  Get-File @('https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip') $zip
  $tmp = Join-Path $Root 'cmdline-unpack'
  Expand-Zip $zip $tmp
  New-Item -ItemType Directory -Force -Path (Join-Path $Sdk 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $tmp 'cmdline-tools') $Tools
  Remove-Item -Recurse -Force $tmp
} else { Write-Host "[2/5] command-line tools found (revision $rev)" }

# 3. SDK packages (licences accepted for the build; read them at https://developer.android.com/studio/terms).
#    The newest stable NDK and build tools are taken from Google's repository index (independent of the sdkmanager
#    output format); the --list output is only a fallback.
Write-Host '[3/5] SDK packages'
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
# Answers for sdkmanager's licence prompts, fed from a file (piping from Windows PowerShell does not reach it).
$yesFile = Join-Path $Root 'yes.txt'
[IO.File]::WriteAllText($yesFile, ("y`r`n" * 80), [Text.Encoding]::ASCII)
function Invoke-SdkManager([string[]]$SdkArgs) {
  $out = Join-Path $Root 'sdkmanager-out.txt'
  $err = Join-Path $Root 'sdkmanager-err.txt'
  $argLine = (@("--sdk_root=$Sdk") + ($SdkArgs | ForEach-Object { '"' + $_ + '"' })) -join ' '
  $p = Start-Process -FilePath $SdkManager -ArgumentList $argLine -RedirectStandardInput $yesFile `
    -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -Wait -PassThru
  foreach ($f in @($out, $err)) {
    if (Test-Path $f) {
      Get-Content $f | Where-Object { $_ -notmatch '^\s*\[=*\s*\]' -and $_ -notmatch '^\s*$' } | Select-Object -Last 25 | ForEach-Object { Write-Host "  | $_" }
    }
  }
  if ($null -eq $p.ExitCode) { return 0 }   # checked again below by looking for the installed packages
  return $p.ExitCode
}

# Licences accepted for the build: sdkmanager keeps the SHA-1 of each accepted licence text in <sdk>\licenses.
# Written directly (the text from Google's repository index, hashed as sdkmanager does), plus the long-standing
# hashes of the SDK licence, so that no prompt is needed.
$KnownLicences = @{
  'android-sdk-license'         = @('24333f8a63b6825ea9c5514f83c2829b004d1fee', 'd56f5187479451eabf01fb78af6dfcb131a6481e', '8933bad161af4178b1185d1a37fbf41ea5269c55')
  'android-sdk-preview-license' = @('84831b9409646a918e30573bab4c9c91346d8abd', '504667f4c0de7af1a06de9f4b1727b84351f2910')
  'android-sdk-arm-dbt-license' = @('859f317696f67ef3d7f30a50a5560e7834b43903')
}
function Write-Licences($RepoXml) {
  $dir = Join-Path $Sdk 'licenses'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $hashes = @{}
  foreach ($k in $KnownLicences.Keys) { $hashes[$k] = @($KnownLicences[$k]) }
  if ($RepoXml) {
    $sha1 = [Security.Cryptography.SHA1]::Create()
    foreach ($l in $RepoXml.SelectNodes("//*[local-name()='license']")) {
      $id = $l.GetAttribute('id')
      if (-not $id) { continue }
      if (-not $hashes.ContainsKey($id)) { $hashes[$id] = @() }
      foreach ($t in @($l.InnerText, $l.InnerText.Trim())) {
        $h = -join ($sha1.ComputeHash([Text.Encoding]::UTF8.GetBytes($t)) | ForEach-Object { $_.ToString('x2') })
        $hashes[$id] += $h
      }
    }
  }
  foreach ($id in $hashes.Keys) {
    $file = Join-Path $dir $id
    $have = @()
    if (Test-Path $file) { $have = @(Get-Content $file | Where-Object { $_ -match '^[0-9a-f]{40}$' }) }
    $all = @($have + $hashes[$id] | Select-Object -Unique)
    [IO.File]::WriteAllText($file, ("`n" + ($all -join "`n")), [Text.Encoding]::ASCII)
  }
  Write-Host "  licences recorded: $(@($hashes.Keys) -join ', ')"
}

function Get-RepoVersions {
  foreach ($repo in @('https://dl.google.com/android/repository/repository2-3.xml', 'https://dl.google.com/android/repository/repository2-1.xml')) {
    try {
      [xml]$x = (Invoke-WebRequest -UseBasicParsing -Uri $repo -TimeoutSec 120).Content
      $stable = @{}
      foreach ($c in $x.SelectNodes("//*[local-name()='channel']")) { if ($c.InnerText.Trim() -eq 'stable') { $stable[$c.GetAttribute('id')] = $true } }
      $ndk = @(); $bt = @(); $plat = @()
      foreach ($p in $x.SelectNodes("//*[local-name()='remotePackage']")) {
        if ($p.GetAttribute('obsolete') -eq 'true') { continue }
        $ch = $p.SelectSingleNode("./*[local-name()='channelRef']")
        if ($ch -and $stable.Count -and -not $stable.ContainsKey($ch.GetAttribute('ref'))) { continue }
        $path = $p.GetAttribute('path')
        if ($path -match '^ndk;([0-9]+(\.[0-9]+){1,3})$') { try { $ndk += [version]$Matches[1] } catch { } }
        elseif ($path -match '^build-tools;([0-9]+(\.[0-9]+){1,3})$') { try { $bt += [version]$Matches[1] } catch { } }
        elseif ($path -match '^platforms;android-([0-9]+(\.[0-9]+)?)$') { $plat += $Matches[1] }
      }
      if ($ndk.Count -and $bt.Count) {
        Write-Host "  repository index: $repo"
        return @{ ndk = ($ndk | Sort-Object -Descending | Select-Object -First 1).ToString(); bt = ($bt | Sort-Object -Descending | Select-Object -First 1).ToString(); plat = $plat; xml = $x }
      }
    } catch { Write-Host "  could not read $repo : $($_.Exception.Message)" }
  }
  return $null
}

$found = Get-RepoVersions
$platforms = @()
Write-Licences $(if ($found) { $found.xml } else { $null })
Invoke-SdkManager @('--licenses') | Out-Null
if ($found) {
  $ndkV = $found.ndk; $btV = $found.bt; $platforms = $found.plat
} else {
  $list = Invoke-Native { & $SdkManager "--sdk_root=$Sdk" --list 2>&1 | ForEach-Object { "$_" } }
  function Newest([string]$prefix) {
    $vs = @()
    foreach ($line in $list) {
      if ($line -match ('^\s*' + [regex]::Escape($prefix) + '([0-9][0-9.]*)\s*\|')) { try { $vs += [version]$Matches[1] } catch { } }
    }
    if (-not $vs.Count) { return $null }
    ($vs | Sort-Object -Descending | Select-Object -First 1).ToString()
  }
  $ndkV = Newest 'ndk;'
  $btV = Newest 'build-tools;'
  foreach ($line in $list) { if ($line -match '^\s*platforms;android-([0-9]+(\.[0-9]+)?)\s*\|') { $platforms += $Matches[1] } }
  if (-not $ndkV -or -not $btV) {
    $list | Select-Object -First 40 | ForEach-Object { Write-Host "  | $_" }
    throw 'could not find the NDK and build tools versions (repository index and sdkmanager --list both failed; network?)'
  }
}
# SDK platform 37 (the compileSdk of the Tauri 2.12 Android template); otherwise the newest stable one
$platform = $null
foreach ($want in @('37', '37.0')) { if ($platforms -contains $want) { $platform = "platforms;android-$want"; break } }
if (-not $platform) {
  $best = $platforms | Sort-Object { [double]$_ } -Descending | Select-Object -First 1
  $platform = $(if ($best) { "platforms;android-$best" } else { 'platforms;android-37' })
}
$pkgs = @('platform-tools', $platform, "build-tools;$btV", "ndk;$ndkV")
Write-Host "  installing: $($pkgs -join ', ')"
$code = Invoke-SdkManager $pkgs
if ($code -ne 0) { throw "sdkmanager failed (exit code $code)" }
$Ndk = Join-Path $Sdk "ndk\$ndkV"
if (-not (Test-Path (Join-Path $Ndk 'source.properties'))) { throw "NDK not found at $Ndk" }
if (-not (Test-Path (Join-Path $Sdk "build-tools\$btV\apksigner.bat"))) { throw "build tools $btV not found" }

# 4. Rust Android targets
Write-Host '[4/5] Rust Android targets'
Invoke-Native { & rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android }
if ($LASTEXITCODE -ne 0) { throw 'rustup target add failed' }

# 5. Paths for build-apk.ps1
Write-Host '[5/5] environment'
$envFile = Join-Path $Repo '.cache\android-env.ps1'
New-Item -ItemType Directory -Force -Path (Split-Path $envFile) | Out-Null
@(
  "# Written by scripts\android\setup-android.ps1 $(Get-Date -Format s)"
  "`$env:JAVA_HOME = '$Jdk'"
  "`$env:ANDROID_HOME = '$Sdk'"
  "`$env:ANDROID_SDK_ROOT = '$Sdk'"
  "`$env:NDK_HOME = '$Ndk'"
  "`$env:VELOPHI_BUILD_TOOLS = '$(Join-Path $Sdk "build-tools\$btV")'"
  "`$env:Path = '$(Join-Path $Jdk 'bin');$(Join-Path $Sdk 'platform-tools');' + `$env:Path"
) | Set-Content -Encoding ASCII $envFile
Write-Host "ANDROID SETUP OK (JDK $Jdk, SDK $Sdk, NDK $ndkV, build tools $btV)"
