package expo.modules.verdictaccessibility

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Read-only text extraction. No performAction / gestures / global actions.
 */
class VerdictAccessibilityService : AccessibilityService() {
  companion object {
    @Volatile var enabled = false
    @Volatile var lastText: String? = null
    @Volatile var lastPackage: String? = null
  }

  override fun onServiceConnected() {
    enabled = true
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val root = rootInActiveWindow ?: return
    val pkg = event.packageName?.toString() ?: ""
    // Skip our own app
    if (pkg == packageName) return
    val sb = StringBuilder()
    collectText(root, sb, 0)
    val text = sb.toString().trim()
    if (text.length < 8) return
    lastText = text.take(4000)
    lastPackage = pkg
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
