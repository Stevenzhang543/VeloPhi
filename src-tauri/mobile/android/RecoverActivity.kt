// VeloPhi 26.59 fix 3 (D192): copied into the generated Android project by scripts\android\build-apk.ps1.
// Runs in its own process (":recover", declared in AndroidManifest.xml by the same script): makes sure the old app
// process is gone, then opens VeloPhi again in a fresh process and exits. No layout, no Tauri, no WebView.
package app.velophi.physics

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

class RecoverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pid = intent.getIntExtra(EXTRA_PID, -1)
    if (pid > 0 && pid != Process.myPid()) Process.killProcess(pid)
    val launch = Intent(this, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
      .putExtra(EXTRA_RECOVERED, true)
    startActivity(launch)
    finish()
    Runtime.getRuntime().exit(0)
  }

  companion object {
    const val EXTRA_PID = "app.velophi.physics.RECOVER_PID"
    const val EXTRA_RECOVERED = "app.velophi.physics.RECOVERED"
  }
}
