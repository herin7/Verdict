package expo.modules.verdictaccessibility

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Read-only text extraction, gated to a caller-supplied watchlist of shopping
 * app package names. No performAction / gestures / global actions, and no
 * text is ever collected for packages outside the watchlist - so personal
 * apps (messaging, banking, gallery, etc.) are never read, by construction.
 */
class VerdictAccessibilityService : AccessibilityService() {
  companion object {
    @Volatile var enabled = false
    @Volatile var lastText: String? = null
    @Volatile var lastPackage: String? = null
    @Volatile var watchlist: Set<String> = emptySet()
    @Volatile private var lastEmittedTextHash: Int = 0
    @Volatile private var wasInWatchedApp = false
  }

  override fun onServiceConnected() {
    enabled = true
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName) return

    if (watchlist.isEmpty() || !watchlist.contains(pkg)) {
      if (wasInWatchedApp) {
        wasInWatchedApp = false
        VerdictAccessibilityBridge.emit("onLeftShoppingApp", emptyMap())
      }
      return
    }

    val root = rootInActiveWindow ?: return
    val sb = StringBuilder()
    collectText(root, sb, 0)
    val text = sb.toString().trim()
    if (text.length < 8) return

    lastText = text.take(4000)
    lastPackage = pkg
    wasInWatchedApp = true

    // De-dupe: accessibility fires repeatedly for the same screen (scroll,
    // focus changes, etc). Only emit when the extracted text actually changed.
    val hash = lastText.hashCode()
    if (hash == lastEmittedTextHash) return
    lastEmittedTextHash = hash

    VerdictAccessibilityBridge.emit(
      "onScreenText",
      mapOf("text" to lastText, "packageName" to pkg)
    )
  }

  private fun collectText(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
    if (node == null || depth > 40) return
    val t = node.text?.toString()?.trim()
    if (!t.isNullOrEmpty()) {
      if (out.isNotEmpty()) out.append(' ')
      out.append(t)
    }
    val cd = node.contentDescription?.toString()?.trim()
    if (!cd.isNullOrEmpty() && cd != t) {
      if (out.isNotEmpty()) out.append(' ')
      out.append(cd)
    }
    for (i in 0 until node.childCount) {
      collectText(node.getChild(i), out, depth + 1)
    }
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    enabled = false
    super.onDestroy()
  }
}
