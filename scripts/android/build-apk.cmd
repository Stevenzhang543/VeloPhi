@echo off
rem VeloPhi 26.62 Android APK (Windows). Double-click to run, or called by scripts\release.cmd.
rem Installs the Android tools when missing (scripts\android\setup-android.ps1), then builds and signs the APK
rem (scripts\android\build-apk.ps1). Log: .cache\android-26.62.log. No Git write operations of any kind.
setlocal
chcp 65001 >nul
cd /d "%~dp0\..\.."
if not exist .cache mkdir .cache
set "ALOG=%CD%\.cache\android-26.62.log"
rem A Gradle or Kotlin daemon left by an earlier build keeps its log open: stop the Gradle daemons first,
rem and if the log is still locked, write to a new log file.
if not defined JAVA_HOME if exist "%LOCALAPPDATA%\VeloPhi-Android\jdk\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\VeloPhi-Android\jdk"
if exist src-tauri\gen\android\gradlew.bat (
  pushd src-tauri\gen\android
  call gradlew.bat --stop >nul 2>&1
  popd
)
(echo VeloPhi 26.62 Android build started %date% %time%) > "%ALOG%" 2>nul || set "ALOG=%CD%\.cache\android-26.62-%RANDOM%.log"
if not "%ALOG%"=="%CD%\.cache\android-26.62.log" (echo VeloPhi 26.62 Android build started %date% %time%) > "%ALOG%"
echo Log: %ALOG%
echo [android 1/2] tools (JDK, Android SDK and NDK, Rust targets)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\android\setup-android.ps1 >> "%ALOG%" 2>&1 || goto fail
echo [android 2/2] signed APK
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\android\build-apk.ps1 >> "%ALOG%" 2>&1
if errorlevel 2 if not errorlevel 3 goto symlink
if errorlevel 1 goto fail
type "%ALOG%" | findstr /C:"APK OK" /C:"certificate" /C:"NEW signing key" /C:"->"
echo ANDROID OK
if not defined NOPAUSE if "%~1"=="" pause
exit /b 0
:symlink
echo.
echo Windows needs Developer Mode for the Android build (Settings ^> System ^> For developers).
echo Turn it on, then run this again (or run it as administrator).
if not defined NOPAUSE if "%~1"=="" pause
exit /b 1
:fail
echo ANDROID BUILD FAILED - see %ALOG%
if not defined NOPAUSE if "%~1"=="" pause
exit /b 1
