// VeloPhi 26.59 fix 3 (D192): copied into the generated Android project by scripts\android\build-apk.ps1.
// Wraps Wry's WebViewClient (asset loading, IPC, navigation): every call goes to it unchanged, and a renderer that
// died is reported to the activity instead of crashing the app (Chromium aborts the app process when no WebView
// handles onRenderProcessGone).
package app.velophi.physics

import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Message
import android.view.KeyEvent
import android.webkit.ClientCertRequest
import android.webkit.HttpAuthHandler
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient

class GuardedWebViewClient(
  private val inner: WebViewClient,
  private val onGone: (WebView, Boolean) -> Unit
) : WebViewClient() {
  override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
    inner.shouldInterceptRequest(view, request)

  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
    inner.shouldOverrideUrlLoading(view, request)

  override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) = inner.onPageStarted(view, url, favicon)
  override fun onPageFinished(view: WebView, url: String) = inner.onPageFinished(view, url)
  override fun onPageCommitVisible(view: WebView, url: String) = inner.onPageCommitVisible(view, url)
  override fun onLoadResource(view: WebView, url: String) = inner.onLoadResource(view, url)

  override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) =
    inner.onReceivedError(view, request, error)

  override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) =
    inner.onReceivedHttpError(view, request, errorResponse)

  override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) =
    inner.onReceivedSslError(view, handler, error)

  override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, host: String, realm: String) =
    inner.onReceivedHttpAuthRequest(view, handler, host, realm)

  override fun onReceivedClientCertRequest(view: WebView, request: ClientCertRequest) =
    inner.onReceivedClientCertRequest(view, request)

  override fun onFormResubmission(view: WebView, dontResend: Message, resend: Message) =
    inner.onFormResubmission(view, dontResend, resend)

  override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) =
    inner.doUpdateVisitedHistory(view, url, isReload)

  override fun shouldOverrideKeyEvent(view: WebView, event: KeyEvent): Boolean = inner.shouldOverrideKeyEvent(view, event)
  override fun onUnhandledKeyEvent(view: WebView, event: KeyEvent) = inner.onUnhandledKeyEvent(view, event)
  override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) = inner.onScaleChanged(view, oldScale, newScale)

  override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
    onGone(view, detail.didCrash())
    return true
  }
}
