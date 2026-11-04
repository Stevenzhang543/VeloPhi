# VeloPhi 26.59 (D176, D177): builds the signed Android APK. Run from the repository root after setup-android.ps1
# (build-apk.cmd runs both):
#   powershell -ExecutionPolicy Bypass -File scripts\android\build-apk.ps1 [-Targets aarch64,armv7]
#
# 1. Checks that Windows allows symbolic links (the Tauri Android build links the native library into the project;
#    this needs Developer Mode, or running as administrator).
# 2. Release signing key: created once in %USERPROFILE%\.velophi-android (velophi-release.p12 + keystore.properties
#    with a random password), outside the repository and the release packages. BACK THIS FOLDER UP: every later
#    version must be signed with the same key, or phones refuse the update.
# 3. Generates the Android project (src-tauri\gen\android, not committed) when missing, copies the launcher icons and
#    adds the signing configuration to app\build.gradle.kts (it reads the key file from the home folder).
#    26.59 fix 3 (D192): copies VeloPhi's own Android code (src-tauri\mobile\android: renderer recovery, the adb
#    devtools switch) over the template and declares RecoverActivity in AndroidManifest.xml.
# 4. tauri android build --apk (arm64 + armv7 in one universal APK), checks the signature with apksigner and copies
#    the APK to .cache\android-26.60\ for package-release.ps1, with the certificate fingerprint as evidence.
#    -Test builds for the MuMu emulator (-Targets x86_64) go to .cache\android-test\ instead and leave the release
#    APK alone.
param([string[]]$Targets = @('aarch64', 'armv7'), [switch]$Test)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Version = '26.60'
$Repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $Repo 'src-tauri\tauri.conf.json'))) { throw 'run this from the repository root' }
$Out = Join-Path $Repo $(if ($Test) { '.cache\android-test' } else { ".cache\android-$Version" })
New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Invoke-Native([scriptblock]$Block) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Block } finally { $ErrorActionPreference = $old }
}

# Tool paths written by setup-android.ps1
$envFile = Join-Path $Repo '.cache\android-env.ps1'
if (-not (Test-Path $envFile)) { throw 'run scripts\android\setup-android.ps1 first' }
. $envFile
foreach ($v in @('JAVA_HOME', 'ANDROID_HOME', 'NDK_HOME')) { if (-not (Test-Path (Get-Item "env:$v").Value)) { throw "$v does not exist; run setup-android.ps1 again" } }

# 1. Symbolic links
Write-Host '[1/5] symbolic links'
$probe = Join-Path $Out 'symlink-probe'
Remove-Item -Force -ErrorAction SilentlyContinue "$probe.lnk", "$probe.txt"
Set-Content -Path "$probe.txt" -Value 'probe'
# cmd's mklink (like the Rust standard library used by the Tauri CLI) asks for an unprivileged link, which Developer
# Mode allows; New-Item -ItemType SymbolicLink in Windows PowerShell 5.1 does not, and would need administrator rights.
$canLink = $false
$linkOut = Invoke-Native { & cmd.exe /d /c mklink "$probe.lnk" "$probe.txt" 2>&1 | ForEach-Object { "$_" } }
if ($LASTEXITCODE -eq 0 -and (Test-Path "$probe.lnk")) { $canLink = $true }
Remove-Item -Force -ErrorAction SilentlyContinue "$probe.lnk", "$probe.txt"
if (-not $canLink) {
  Write-Host ''
  Write-Host "Windows refused to create a symbolic link in $Out ($($linkOut -join ' '))."
  Write-Host 'The Android build needs symbolic links: turn on Developer Mode (Settings > System > For developers >'
  Write-Host 'Developer Mode) or run build-apk.cmd as administrator. The repository drive must be NTFS (not exFAT/FAT32).'
  Start-Process 'ms-settings:developers' -ErrorAction SilentlyContinue
  exit 2
}

# 2. Release signing key (created once; the password never appears in a log)
Write-Host '[2/5] signing key'
$KeyDir = Join-Path $env:USERPROFILE '.velophi-android'
$Props = Join-Path $KeyDir 'keystore.properties'
$Store = Join-Path $KeyDir 'velophi-release.p12'
if (-not (Test-Path $Props)) {
  if (Test-Path $Store) { throw "$Store exists but $Props is missing; restore keystore.properties from your backup" }
  New-Item -ItemType Directory -Force -Path $KeyDir | Out-Null
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
  $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
  Invoke-Native { & $keytool -genkeypair -keystore $Store -storetype PKCS12 -alias velophi -keyalg RSA -keysize 4096 -validity 10000 `
      -dname 'CN=VeloPhi, OU=whitelists.top, O=VeloPhi' -storepass $pw -keypass $pw 2>&1 | Out-Null }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Store)) { throw 'keytool could not create the signing key' }
  @(
    '# VeloPhi Android release signing key (created by scripts\android\build-apk.ps1). Keep this folder secret and backed up.'
    "storeFile=$($Store -replace '\\', '/')"
    "storePassword=$pw"
    'keyAlias=velophi'
    "keyPassword=$pw"
  ) | Set-Content -Encoding ASCII $Props
  @(
    'VeloPhi Android signing key'
    ''
    'velophi-release.p12 and keystore.properties in this folder sign every VeloPhi APK.'
    'Back up the whole folder (for example to an encrypted USB drive or a password manager).'
    'If it is lost, phones that have VeloPhi installed cannot update to a new version: they would have to uninstall first.'
    'Never put these files into the repository or a release package.'
  ) | Set-Content -Encoding ASCII (Join-Path $KeyDir 'README.txt')
  $pw = $null
  Write-Host "  NEW signing key created in $KeyDir - back up this folder."
} else { Write-Host "  using the signing key in $KeyDir" }

# 3. Android project, icons, signing configuration
Write-Host '[3/5] Android project'
$Gen = Join-Path $Repo 'src-tauri\gen\android'
$Gradle = Join-Path $Gen 'app\build.gradle.kts'
if (-not (Test-Path $Gradle)) {
  Invoke-Native { & npx tauri android init --ci }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Gradle)) { throw 'tauri android init failed' }
}
# No Gradle or Kotlin daemons: they would outlive the build and keep the build logs open (release.cmd appends to
# its log after this step).
$GradleProps = Join-Path $Gen 'gradle.properties'
$gp = $(if (Test-Path $GradleProps) { Get-Content -Raw $GradleProps } else { '' })
if ($null -eq $gp) { $gp = '' }
$add = @()
if ($gp -notmatch '(?m)^org\.gradle\.daemon=') { $add += 'org.gradle.daemon=false' }
if ($gp -notmatch '(?m)^kotlin\.compiler\.execution\.strategy=') { $add += 'kotlin.compiler.execution.strategy=in-process' }
if ($add.Count) {
  [IO.File]::AppendAllText($GradleProps, ("`n# VeloPhi 26.59: no build daemons`n" + ($add -join "`n") + "`n"), [Text.Encoding]::ASCII)
  Write-Host "  gradle.properties: $($add -join ', ')"
}
$res = Join-Path $Gen 'app\src\main\res'
Copy-Item -Recurse -Force (Join-Path $Repo 'src-tauri\icons\android\res\*') $res
# VeloPhi's own Android code over the template (D192)
$Kt = Join-Path $Gen 'app\src\main\java\app\velophi\physics'
if (-not (Test-Path (Join-Path $Kt 'MainActivity.kt'))) { throw "unexpected layout of $Gen (no MainActivity.kt)" }
Copy-Item -Force (Join-Path $Repo 'src-tauri\mobile\android\*.kt') $Kt
$Manifest = Join-Path $Gen 'app\src\main\AndroidManifest.xml'
$m = [IO.File]::ReadAllText($Manifest)
if ($m -notmatch 'RecoverActivity') {
  $rec = '        <activity android:name=".RecoverActivity" android:process=":recover" android:exported="false" android:excludeFromRecents="true" android:noHistory="true" android:theme="@android:style/Theme.Translucent.NoTitleBar" />' + "`n"
  $k = $m.IndexOf('        <provider')
  if ($k -lt 0) { $k = $m.IndexOf('    </application>') }
  if ($k -lt 0) { throw "unexpected layout of $Manifest; declare RecoverActivity by hand" }
  $m = $m.Substring(0, $k) + $rec + $m.Substring($k)
  [IO.File]::WriteAllText($Manifest, $m, (New-Object Text.UTF8Encoding $false))
  Write-Host '  RecoverActivity declared in AndroidManifest.xml'
}
Write-Host "  Android code: $((Get-ChildItem (Join-Path $Repo 'src-tauri\mobile\android\*.kt')).Name -join ', ')"
$g = Get-Content -Raw -Encoding UTF8 $Gradle
# In build.gradle.kts the name "java" is Gradle's java extension, so java.util.* / java.io.* cannot be written out:
# use the imported Properties and Project.file (also repairs a file patched by the first 26.59 script).
if ($g.Contains('java.util.Properties().apply') -or $g.Contains('val f = java.io.File(')) {
  $g = $g.Replace('val velophiKeystore = java.util.Properties().apply', 'val velophiKeystore = Properties().apply').Replace('val f = java.io.File(', 'val f = file(')
  [IO.File]::WriteAllText($Gradle, $g, (New-Object Text.UTF8Encoding $false))
  Write-Host '  signing configuration repaired in app\build.gradle.kts'
}
if ($g -notmatch '(?m)^import java\.util\.Properties') {
  $g = "import java.util.Properties`n" + $g
  [IO.File]::WriteAllText($Gradle, $g, (New-Object Text.UTF8Encoding $false))
}
if ($g -notmatch 'velophiRelease') {
  $head = @'
// VeloPhi release signing (26.59, D177): the key file stays in the user's home folder, outside the repository.
val velophiKeystore = Properties().apply {
    val f = file(System.getenv("VELOPHI_KEYSTORE_PROPERTIES") ?: (System.getProperty("user.home") + "/.velophi-android/keystore.properties"))
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    signingConfigs {
        if (velophiKeystore.getProperty("storeFile") != null) {
            create("velophiRelease") {
                storeFile = file(velophiKeystore.getProperty("storeFile"))
                storePassword = velophiKeystore.getProperty("storePassword")
                keyAlias = velophiKeystore.getProperty("keyAlias")
                keyPassword = velophiKeystore.getProperty("keyPassword")
            }
        }
    }
'@
  $rel = "getByName(`"release`") {`n            signingConfigs.findByName(`"velophiRelease`")?.let { signingConfig = it }"
  $i = $g.IndexOf("`nandroid {")
  $j = $g.IndexOf('getByName("release") {')
  if ($i -lt 0 -or $j -lt 0) { throw "unexpected layout of $Gradle; add the signing configuration by hand" }
  $g = $g.Substring(0, $i + 1) + $head.Replace("`r`n", "`n") + $g.Substring($i + "`nandroid {".Length)
  $g = $g.Replace('getByName("release") {', $rel)
  [IO.File]::WriteAllText($Gradle, $g, (New-Object Text.UTF8Encoding $false))
  Write-Host '  signing configuration added to app\build.gradle.kts'
}

# 4. Build
Write-Host "[4/5] tauri android build --apk --target $($Targets -join ' ')"
Invoke-Native { & npx tauri android build --apk --ci --target @Targets }
if ($LASTEXITCODE -ne 0) { throw 'tauri android build failed' }
$apk = Get-ChildItem (Join-Path $Gen 'app\build\outputs\apk') -Recurse -Filter '*-release*.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { throw 'no release APK found' }
if ($apk.Name -match 'unsigned') { throw "the APK is unsigned ($($apk.Name)); check $Props" }

# 5. Signature check and copy
Write-Host '[5/5] signature'
$apksigner = Join-Path $env:VELOPHI_BUILD_TOOLS 'apksigner.bat'
$certs = Invoke-Native { & $apksigner verify --verbose --print-certs $apk.FullName 2>&1 | ForEach-Object { "$_" } }
if ($LASTEXITCODE -ne 0) { $certs | Write-Host; throw 'apksigner verify failed' }
$certs | Set-Content -Encoding UTF8 (Join-Path $Out 'apk-signature.txt')
$name = $(if ($Test) { "VeloPhi-v$Version-test-$($Targets -join '-').apk" } else { "VeloPhi-v$Version-android.apk" })
$dest = Join-Path $Out $name
Copy-Item -Force $apk.FullName $dest
$hash = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
"$hash  $name" | Set-Content -Encoding ASCII (Join-Path $Out 'apk.sha256')
Write-Host "  $($apk.FullName)"
Write-Host "  -> $dest ($([math]::Round((Get-Item $dest).Length / 1MB, 1)) MB, sha256 $hash)"
($certs | Select-String 'SHA-256 digest') | ForEach-Object { Write-Host "  certificate $($_.Line.Trim())" }
Write-Host 'APK OK'
