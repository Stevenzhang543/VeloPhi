// VeloPhi 26.59 fix 3 (D192): copied over the Tauri template by scripts\android\build-apk.ps1 (the generated Android
// project is not committed). Two additions to the template:
//  - when the WebView's renderer process dies (an old system WebView crashing in layout while the screen turns, or the
//    system reclaiming its memory), the app restarts itself (RecoverActivity) instead of being taken down by the
//    WebView, and the page is told so it can reopen the scene it had (window.__velophiRecovered);
//  - WebView remote debugging is on only when a developer asks for it over adb
//    (adb shell setprop debug.velophi.devtools 1), for the emulator checks of scripts\android\mumu.ps1;
//  - diagnosis switches set over adb (adb shell setprop debug.velophi.compat nocq,nocv,…) reach the page as
//    window.__velophiCompat (src/app/compat.ts) — DevTools change how the WebView renders, these do not;
//  - 26.59 fix 3 (D199): window.VeloPhiAndroid locks the screen orientation (settings › general, or the button of the
//    recovery notice); the choice is kept here and applied before the page loads.
package app.velophi.physics

import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.os.Process
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : TauriActivity() {
  private var restarting = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // "noedge" (diagnosis): keep the classic window with system bars outside the app
    if (!compatHas("noedge")) enableEdgeToEdge()
    applyOrientation(savedOrientation())
    super.onCreate(savedInstanceState)
  }

  /** The orientation the user chose: "auto", "portrait" or "landscape". */
  private fun savedOrientation(): String = getSharedPreferences(PREFS, MODE_PRIVATE).getString("orientation", "auto") ?: "auto"

  private fun applyOrientation(mode: String) {
    requestedOrientation = when (mode) {
      "portrait" -> ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT
      "landscape" -> ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE
      else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }
  }

  /** window.VeloPhiAndroid: the page's way to lock the orientation (called on a WebView thread). */
  inner class Bridge {
    @JavascriptInterface
    fun setOrientation(mode: String) {
      val m = if (mode == "portrait" || mode == "landscape") mode else "auto"
      // commit, not apply: the choice must be on disk even if the app is closed right away
      getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("orientation", m).commit()
      runOnUiThread { applyOrientation(m) }
    }

    @JavascriptInterface
    fun orientation(): String = savedOrientation()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(Bridge(), "VeloPhiAndroid")
    if (prop("debug.velophi.devtools") == "1") WebView.setWebContentsDebuggingEnabled(true)
    val script = StringBuilder()
    if (intent?.getBooleanExtra(RecoverActivity.EXTRA_RECOVERED, false) == true) script.append("window.__velophiRecovered = true;")
    val compat = prop("debug.velophi.compat").filter { it.isLetterOrDigit() || it == ',' }
    if (compat.isNotEmpty()) script.append("window.__velophiCompat = '").append(compat).append("';")
    if (script.isNotEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      try {
        WebViewCompat.addDocumentStartJavaScript(webView, script.toString(), setOf("*"))
      } catch (e: Throwable) { Log.w(TAG, "page flags: $e") }
    }
    // Wry gives its client to the WebView before handing the WebView over; wrap it once this message is done.
    webView.post { guard(webView) }
    // Diagnosis: "sw" draws the WebView in software; "bare" replaces the app by a bare page after 3 s
    if (compatHas("sw")) webView.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    if (compatHas("bare")) webView.postDelayed({
      (webView as? RustWebView)?.loadHTMLMainThread("<!doctype html><meta name=viewport content='width=device-width'><body style='background:#123;color:#fff'>bare page</body>")
    }, 3000)
  }

  /** A diagnosis switch of debug.velophi.compat (see src/app/compat.ts). */
  private fun compatHas(flag: String): Boolean = prop("debug.velophi.compat").split(',').any { it.trim() == flag }

  private fun guard(webView: WebView) {
    val inner = webView.webViewClient
    if (inner is GuardedWebViewClient) return
    webView.webViewClient = GuardedWebViewClient(inner) { view, crashed -> restart(view, crashed) }
  }

  /** The renderer is gone: drop the dead WebView and start the app again from a separate process. */
  private fun restart(view: WebView, crashed: Boolean) {
    if (restarting) return
    restarting = true
    Log.e(TAG, "WebView renderer gone (crashed=$crashed); restarting VeloPhi")
    try {
      (view.parent as? ViewGroup)?.removeView(view)
      view.destroy()
    } catch (e: Throwable) { Log.w(TAG, "destroy: $e") }
    try {
      startActivity(
        Intent(this, RecoverActivity::class.java)
          .putExtra(RecoverActivity.EXTRA_PID, Process.myPid())
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (e: Throwable) { Log.e(TAG, "recover: $e") }
    finishAffinity()
    Runtime.getRuntime().exit(0)
  }

  /** A system property (empty when unset or unreadable). */
  private fun prop(name: String): String {
    return try {
      val p = Runtime.getRuntime().exec(arrayOf("getprop", name))
      p.inputStream.bufferedReader().use { it.readText().trim() }
    } catch (e: Throwable) { "" }
  }

  companion object {
    const val TAG = "VeloPhi"
    const val PREFS = "velophi"
  }
}
