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
//  - 26.60 r2: a renderer that dies while the app is in the background is replaced when the user comes back (Android
//    does not let a background app start an activity, so restarting at once closed the app); restarts are counted —
//    the third within two minutes opens the page in safe mode (window.__velophiSafe), the fifth stops trying; the
//    system properties are read once; an uncaught exception is noted for the page (window.VeloPhiAndroid.lastIssue).
//  - 26.60 r2: when the screen turns, the page is told before the WebView gets its new size
//    (window.__velophiRotate, src/app/rotateGuard.ts): it takes the interface out of layout and lays it out again
//    once the size has settled. On the MuMu WebView the renderer crashed (SIGSEGV in CrRendererMain) relaying the
//    interface out from one size to the other; a fresh layout at the new size does not crash. Diagnosis switch
//    "norotguard" turns this off.
package app.velophi.physics

import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
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
  /** The renderer died while the app was in the background: restart when it is shown again. */
  private var pendingRestart = false
  private var resumed = false
  private val props = HashMap<String, String>()
  private var webViewRef: WebView? = null
  private var lastOrientation = Configuration.ORIENTATION_UNDEFINED

  override fun onCreate(savedInstanceState: Bundle?) {
    noteUncaught()
    // "noedge" (diagnosis): keep the classic window with system bars outside the app
    if (!compatHas("noedge")) enableEdgeToEdge()
    applyOrientation(savedOrientation())
    super.onCreate(savedInstanceState)
    lastOrientation = resources.configuration.orientation
  }

  /** The screen turned: tell the page before the WebView is resized (see the note at the top). */
  override fun onConfigurationChanged(newConfig: Configuration) {
    if (newConfig.orientation != lastOrientation) {
      lastOrientation = newConfig.orientation
      if (!compatHas("norotguard")) {
        try { webViewRef?.evaluateJavascript("window.__velophiRotate&&window.__velophiRotate()", null) } catch (e: Throwable) { Log.w(TAG, "rotate guard: $e") }
      }
    }
    super.onConfigurationChanged(newConfig)
  }

  override fun onResume() {
    super.onResume()
    resumed = true
    if (pendingRestart) {
      pendingRestart = false
      relaunch(false)
    }
  }

  override fun onPause() {
    resumed = false
    super.onPause()
  }

  /** Note an uncaught exception for the next start (the default handler still ends the process). */
  private fun noteUncaught() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    if (previous is IssueHandler) return
    Thread.setDefaultUncaughtExceptionHandler(IssueHandler(previous))
  }

  private inner class IssueHandler(private val previous: Thread.UncaughtExceptionHandler?) : Thread.UncaughtExceptionHandler {
    override fun uncaughtException(t: Thread, e: Throwable) {
      try {
        val text = Log.getStackTraceString(e).take(3000)
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastIssue", "exception|${System.currentTimeMillis()}|${t.name}|$text").commit()
      } catch (ignored: Throwable) {}
      previous?.uncaughtException(t, e)
    }
  }

  /** Restarts within the last two minutes (oldest first), this one not included. */
  private fun recentRestarts(now: Long): List<Long> {
    val raw = getSharedPreferences(PREFS, MODE_PRIVATE).getString("restarts", "") ?: ""
    return raw.split(',').mapNotNull { it.toLongOrNull() }.filter { now - it in 0..RESTART_WINDOW_MS }
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

    /** What ended the last session abnormally ("" when nothing): "kind|time|detail"; read once. */
    @JavascriptInterface
    fun lastIssue(): String {
      val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
      val v = prefs.getString("lastIssue", "") ?: ""
      if (v.isNotEmpty()) prefs.edit().remove("lastIssue").apply()
      return v
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    webView.addJavascriptInterface(Bridge(), "VeloPhiAndroid")
    if (prop("debug.velophi.devtools") == "1") WebView.setWebContentsDebuggingEnabled(true)
    val script = StringBuilder()
    if (intent?.getBooleanExtra(RecoverActivity.EXTRA_RECOVERED, false) == true) {
      script.append("window.__velophiRecovered = true;")
      val why = intent?.getStringExtra(RecoverActivity.EXTRA_REASON) ?: "crash"
      script.append("window.__velophiRecoverReason = '").append(if (why == "killed") "killed" else "crash").append("';")
    }
    // Safe mode: asked by the restart, or several restarts happened shortly before this start
    if (intent?.getBooleanExtra(RecoverActivity.EXTRA_SAFE, false) == true || recentRestarts(System.currentTimeMillis()).size >= 2) script.append("window.__velophiSafe = true;")
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

  /**
   * The renderer is gone: drop the dead WebView and start the app again from a separate process — at once when the
   * app is in front, else when the user comes back to it.
   */
  private fun restart(view: WebView, crashed: Boolean) {
    if (restarting || pendingRestart) return
    Log.e(TAG, "WebView renderer gone (crashed=$crashed, resumed=$resumed); restarting VeloPhi")
    try {
      getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("lastIssue", "renderer|${System.currentTimeMillis()}|${if (crashed) "crashed" else "killed"}").commit()
    } catch (ignored: Throwable) {}
    if (webViewRef === view) webViewRef = null
    try {
      (view.parent as? ViewGroup)?.removeView(view)
      view.destroy()
    } catch (e: Throwable) { Log.w(TAG, "destroy: $e") }
    if (!resumed) {
      pendingRestart = true
      killedInBackground = !crashed
      return
    }
    relaunch(!crashed)
  }

  private var killedInBackground = false

  /** Start the app again (RecoverActivity), in safe mode after repeated restarts; give up after too many. */
  private fun relaunch(killed: Boolean) {
    if (restarting) return
    restarting = true
    val now = System.currentTimeMillis()
    val recent = recentRestarts(now)
    try {
      getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("restarts", (recent + now).joinToString(",")).commit()
    } catch (ignored: Throwable) {}
    if (recent.size >= 4) {
      // Five restarts within two minutes: the WebView cannot run VeloPhi now; the next start opens in safe mode
      Log.e(TAG, "too many restarts; not restarting")
      finishAffinity()
      Runtime.getRuntime().exit(0)
      return
    }
    try {
      startActivity(
        Intent(this, RecoverActivity::class.java)
          .putExtra(RecoverActivity.EXTRA_PID, Process.myPid())
          .putExtra(RecoverActivity.EXTRA_SAFE, recent.size >= 2)
          .putExtra(RecoverActivity.EXTRA_REASON, if (killed || killedInBackground) "killed" else "crash")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (e: Throwable) { Log.e(TAG, "recover: $e") }
    finishAffinity()
    Runtime.getRuntime().exit(0)
  }

  /** A system property (empty when unset or unreadable); each is read once (a process start per read). */
  private fun prop(name: String): String = props.getOrPut(name) {
    try {
      val p = Runtime.getRuntime().exec(arrayOf("getprop", name))
      p.inputStream.bufferedReader().use { it.readText().trim() }
    } catch (e: Throwable) { "" }
  }

  companion object {
    const val TAG = "VeloPhi"
    const val PREFS = "velophi"
    const val RESTART_WINDOW_MS = 120_000L
  }
}
