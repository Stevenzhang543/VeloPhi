// VeloPhi 26.64: copied into the generated Android project by scripts\android\build-apk.ps1, which also declares it in
// AndroidManifest.xml (authority "<application id>.update", not exported, paths res/xml/velophi_update_paths.xml).
// It can hand out exactly one folder — cacheDir/update, where src-tauri/src/update.rs puts a downloaded APK once its
// SHA-256 matches the release's checksum file — and only to the app MainActivity.installUpdate grants read access to
// (the system installer). A class of its own, so the Tauri template's FileProvider and its paths stay as they are.
package app.velophi.physics

import androidx.core.content.FileProvider

class UpdateFileProvider : FileProvider()
