package expo.modules.verdictaccessibility

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Read-only text extraction, gated to a caller-supplied watchlist of shopping
 * app package names. No performAction / gestures / global actions.
 */
class VerdictAccessibilityService : AccessibilityService() {
  companion object {
    @Volatile var enabled = false
    @Volatile var lastText: String? = null
    @Volatile var lastPackage: String? = null
    @Volatile var watchlist: Set<String> = emptySet()
    @Volatile private var lastEmittedTextHash: Int = 0
    @Volatile private var wasInWatchedApp = false
    @Volatile private var lastHot = false
    @Volatile private var instance: VerdictAccessibilityService? = null

    private const val LEAVE_DEBOUNCE_MS = 1500L

    /**
     * Amazon/Flipkart PDPs fire WINDOW_CONTENT_CHANGED many times per second
     * while a list/image loads. Without a floor here, every event re-walks
     * the tree and re-signals hot/idle, which cancels the pulse animation
     * mid-flight before it can ever play (looked "frozen").
     */
    private const val MIN_CAPTURE_INTERVAL_MS = 200L

    /** Transient packages that should not count as "left shopping". */
    private val IGNORE_LEAVE = setOf(
      "com.android.systemui",
      "com.android.launcher",
      "com.android.launcher3",
      "com.google.android.apps.nexuslauncher",
      "com.oppo.launcher",
      "com.oplus.launcher",
      "net.oneplus.launcher",
      "com.coloros.launcher",
      "com.android.permissioncontroller",
      "com.google.android.permissioncontroller",
      "com.google.android.packageinstaller",
      "com.android.packageinstaller",
      "com.google.android.inputmethod.latin",
      "com.android.inputmethod.latin",
      "com.samsung.android.honeyboard",
      "com.google.android.apps.accessibility.voiceaccess",
      "com.android.settings",
    )

    private val CHROME = listOf(
      "search amazon", "search flipkart", "deliver to", "hello,",
      "sign in", "your orders", "returns & orders", "skip to",
      "add to cart", "buy now", "sponsored", "see all", "view all",
      "today's deals", "best sellers", "join prime",
    )

    private val RECOMMENDATION_SECTIONS = listOf(
      "customers who", "customers also", "frequently bought",
      "related product", "recommended", "you may also like",
      "you might also like", "more like this", "similar product",
      "people also buy", "people also bought", "popular with",
    )

    /**
     * Fresh walk of the active window tree. Used on bubble tap / explicit
     * "identify now" requests. Bypasses the ambient MIN_CAPTURE_INTERVAL_MS
     * throttle entirely (that throttle only applies to the automatic
     * onAccessibilityEvent path below) and forces retried re-reads if the
     * tree is momentarily sparse, so it never hands back a stale/previous
     * product just because the PDP was still laying out at the instant of tap.
     */
    @JvmStatic
    fun captureNow(): Map<String, Any?> {
      val svc = instance ?: return mapOf(
        "text" to lastText,
        "packageName" to lastPackage,
        "isProductPage" to lastHot,
      )
      return svc.doCapture(forceEmit = false, forceFresh = true)
    }
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var leaveRunnable: Runnable? = null
  private var pendingCaptureRunnable: Runnable? = null
  private var pendingCapturePkg: String? = null
  private var lastCaptureAt = 0L

  override fun onServiceConnected() {
    enabled = true
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return
    if (shouldIgnoreLeave(pkg)) return

    if (watchlist.isEmpty() || !watchlist.contains(pkg)) {
      scheduleLeave()
      return
    }

    cancelLeave()
    throttledCapture(pkg)
  }

  /** Leading-edge throttle with a trailing call so bursts collapse to ~1 capture per window. */
  private fun throttledCapture(pkg: String) {
    val now = SystemClock.uptimeMillis()
    val elapsed = now - lastCaptureAt
    if (elapsed >= MIN_CAPTURE_INTERVAL_MS) {
      lastCaptureAt = now
      doCapture(forceEmit = true, eventPkg = pkg)
      return
    }
    pendingCapturePkg = pkg
    if (pendingCaptureRunnable != null) return
    val r = Runnable {
      pendingCaptureRunnable = null
      lastCaptureAt = SystemClock.uptimeMillis()
      doCapture(forceEmit = true, eventPkg = pendingCapturePkg)
    }
    pendingCaptureRunnable = r
    mainHandler.postDelayed(r, MIN_CAPTURE_INTERVAL_MS - elapsed)
  }

  private fun cancelPendingCapture() {
    pendingCaptureRunnable?.let { mainHandler.removeCallbacks(it) }
    pendingCaptureRunnable = null
  }

  private fun shouldIgnoreLeave(pkg: String): Boolean {
    if (IGNORE_LEAVE.contains(pkg)) return true
    if (pkg.endsWith(".inputmethod.latin")) return true
    if (pkg.contains("launcher", ignoreCase = true)) return true
    if (pkg.contains("systemui", ignoreCase = true)) return true
    return false
  }

  private fun scheduleLeave() {
    if (!wasInWatchedApp) return
    if (leaveRunnable != null) return
    val r = Runnable {
      leaveRunnable = null
      if (wasInWatchedApp) {
        wasInWatchedApp = false
        cancelPendingCapture()
        lastHot = false
        signalBubbleHot(false)
        signalBubbleVisible(false)
        VerdictAccessibilityBridge.emit("onLeftShoppingApp", emptyMap())
        android.util.Log.i("VerdictA11y", "left shopping (debounced)")
      }
    }
    leaveRunnable = r
    mainHandler.postDelayed(r, LEAVE_DEBOUNCE_MS)
  }

  private fun cancelLeave() {
    leaveRunnable?.let { mainHandler.removeCallbacks(it) }
    leaveRunnable = null
  }

  private fun doCapture(
    forceEmit: Boolean,
    eventPkg: String? = null,
    forceFresh: Boolean = false,
  ): Map<String, Any?> {
    // For forceFresh (explicit) calls, retry a couple times: right after a
    // window/content transition the a11y tree can briefly report 0-1 nodes
    // before the PDP finishes laying out. Without this, that transient gap
    // used to fall through to the stale-cache branch below and hand back
    // whatever product was last seen - including a DIFFERENT earlier product.
    var activeRoot: AccessibilityNodeInfo? = null
    val tokens = LinkedHashSet<String>()
    val attempts = if (forceFresh) 3 else 1
    for (attempt in 0 until attempts) {
      activeRoot = rootInActiveWindow
      tokens.clear()
      if (activeRoot != null) {
        collectText(activeRoot, tokens, 0)
        if (tokens.size >= 2 || tokens.sumOf { it.length } >= 8) break
      }
      if (attempt < attempts - 1) {
        try {
          Thread.sleep(35L)
        } catch (_: InterruptedException) {
        }
      }
    }

    val root = activeRoot
    val hasEnoughText = tokens.size >= 2 || tokens.sumOf { it.length } >= 8
    if (root == null || !hasEnoughText) {
      val pkgNow = eventPkg ?: root?.packageName?.toString()
      // Never smuggle a DIFFERENT app/page's cached text back as "current" -
      // only reuse the cache if we're plausibly still on the very same page.
      return if (pkgNow == null || pkgNow == lastPackage) {
        mapOf("text" to lastText, "packageName" to lastPackage, "isProductPage" to lastHot)
      } else {
        mapOf("text" to null, "packageName" to pkgNow, "isProductPage" to false)
      }
    }
    val pkg = eventPkg
      ?: root.packageName?.toString()
      ?: lastPackage
      ?: "unknown"

    val recommendationStart = tokens.indexOfFirst { token ->
      val lower = token.lowercase()
      RECOMMENDATION_SECTIONS.any { lower.startsWith(it) }
    }
    val primaryTokens =
      if (recommendationStart >= 3) tokens.take(recommendationStart) else tokens.toList()
    val text = primaryTokens.joinToString("\n").take(4000)
    val enteringFresh = !wasInWatchedApp
    lastText = text
    lastPackage = pkg
    wasInWatchedApp = true

    if (enteringFresh) {
      signalBubbleVisible(true)
      android.util.Log.i("VerdictA11y", "opened watched app pkg=$pkg")
      VerdictAccessibilityBridge.emit("onAppOpened", mapOf("packageName" to pkg))
    }

    val hot = ScreenProductHeuristic.isProductPage(text, pkg)
    android.util.Log.i(
      "VerdictA11y",
      "pdp=$hot pkg=$pkg tokens=${primaryTokens.size} preview=${text.take(120).replace('\n', '|')}"
    )
    // Drive hot signal only on real transitions (not gated on text-hash, so a
    // borderline page that flips to a PDP still pulses) — but never re-fire
    // on every event, or the pulse animation gets cancelled before it plays.
    if (hot != lastHot) {
      lastHot = hot
      signalBubbleHot(hot)
    }

    val hash = text.hashCode()
    if (forceEmit && hash != lastEmittedTextHash) {
      lastEmittedTextHash = hash
      VerdictAccessibilityBridge.emit(
        "onScreenText",
        mapOf(
          "text" to lastText,
          "packageName" to pkg,
          "isProductPage" to hot,
        )
      )
    }

    return mapOf(
      "text" to text,
      "packageName" to pkg,
      "isProductPage" to hot,
    )
  }

  private fun signalBubbleHot(hot: Boolean) {
    android.util.Log.i("VerdictA11y", "signalBubbleHot=$hot pkg=$lastPackage len=${lastText?.length}")
    try {
      val clazz = Class.forName("expo.modules.verdictoverlay.VerdictOverlayService")
      clazz.getMethod("requestHot", java.lang.Boolean.TYPE).invoke(null, hot)
      return
    } catch (e: Exception) {
      android.util.Log.w("VerdictA11y", "requestHot reflect failed: ${e.message}")
    }
    startOverlayAction(if (hot) "verdict.overlay.HOT" else "verdict.overlay.IDLE", preferFgs = hot)
  }

  private fun signalBubbleVisible(show: Boolean) {
    try {
      val clazz = Class.forName("expo.modules.verdictoverlay.VerdictOverlayService")
      if (show) {
        clazz.getMethod("requestShow").invoke(null)
      } else {
        clazz.getMethod("requestHide").invoke(null)
      }
      return
    } catch (e: Exception) {
      android.util.Log.w("VerdictA11y", "requestShow/Hide reflect failed: ${e.message}")
    }
    startOverlayAction(
      if (show) "verdict.overlay.SHOW" else "verdict.overlay.HIDE_BUBBLE",
      preferFgs = show
    )
  }

  private fun startOverlayAction(action: String, preferFgs: Boolean) {
    try {
      val intent = Intent().setClassName(
        packageName,
        "expo.modules.verdictoverlay.VerdictOverlayService"
      )
      intent.action = action
      if (preferFgs && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(intent)
      } else {
        startService(intent)
      }
    } catch (e: Exception) {
      android.util.Log.w("VerdictA11y", "overlay action $action failed: ${e.message}")
    }
  }

  private fun collectText(node: AccessibilityNodeInfo?, out: LinkedHashSet<String>, depth: Int) {
    if (node == null || depth > 45) return
    try {
      addToken(out, node.text?.toString())
      addToken(out, node.contentDescription?.toString())
      if (Build.VERSION.SDK_INT >= 26) {
        addToken(out, node.hintText?.toString())
      }
      if (out.size >= 120) return
      for (i in 0 until node.childCount) {
        if (out.size >= 120) return
        val child = node.getChild(i)
        collectText(child, out, depth + 1)
        try {
          child?.recycle()
        } catch (_: Exception) {
        }
      }
    } catch (_: Exception) {
    }
  }

  private fun addToken(out: LinkedHashSet<String>, raw: String?) {
    val t = raw?.trim() ?: return
    // Keep lone currency markers so server can rejoin with sibling amounts
    // ("₹" + "29,990"). length<2 used to drop ₹ and kill priceHint.
    if (t.matches(Regex("""^(₹|Rs\.?|INR|\$|USD)$""", RegexOption.IGNORE_CASE))) {
      out.add(t)
      return
    }
    if (t.length < 2 || t.length > 300) return
    val lower = t.lowercase()
    if (CHROME.any { lower.startsWith(it) || lower == it }) return
    // Keep Indian/western grouped bare prices (comma amounts)
    if (t.matches(Regex("""^\d{1,3}(,\d{2,3})+(\.\d{1,2})?$"""))) {
      out.add(t)
      return
    }
    if (t.length <= 4 && t.matches(Regex("""^\d+(\.\d+)?$"""))) return
    out.add(t)
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    cancelLeave()
    cancelPendingCapture()
    enabled = false
    if (instance === this) instance = null
    super.onDestroy()
  }
}
