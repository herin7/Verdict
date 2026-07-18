package expo.modules.verdictaccessibility

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VerdictAccessibilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VerdictAccessibility")

    Events("onScreenText", "onLeftShoppingApp", "onAppOpened")

    OnCreate {
      VerdictAccessibilityBridge.emitter = { name, body ->
        try {
          this@VerdictAccessibilityModule.sendEvent(name, body)
        } catch (_: Exception) {
        }
      }
    }

    // Keep Function bodies expression-only. Labeled return@Function breaks Expo's
    // reified Function DSL (UnsupportedOperationException at module init).
    Function("isServiceEnabled") {
      isAccessibilityEnabled(appContext.reactContext)
    }

    Function("openAccessibilitySettings") {
      openA11ySettings(appContext.reactContext)
      null
    }

    Function("getLastScreenText") {
      VerdictAccessibilityService.lastText
    }

    Function("getLastPackageName") {
      VerdictAccessibilityService.lastPackage
    }

    Function("captureNow") {
      VerdictAccessibilityService.captureNow()
    }

    Function("setWatchlist") { packages: List<String> ->
      VerdictAccessibilityService.watchlist = packages.toSet()
      null
    }
  }

  private fun isAccessibilityEnabled(ctx: Context?): Boolean {
    if (VerdictAccessibilityService.enabled) return true
    if (ctx == null) return false
    val enabled = Settings.Secure.getString(
      ctx.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    val expectedShort = "${ctx.packageName}/.VerdictAccessibilityService"
    val expectedFull =
      "${ctx.packageName}/${VerdictAccessibilityService::class.java.name}"
    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabled)
    while (splitter.hasNext()) {
      val component = splitter.next()
      if (component.equals(expectedShort, ignoreCase = true) ||
        component.equals(expectedFull, ignoreCase = true) ||
        component.contains("VerdictAccessibilityService")
      ) {
        return true
      }
    }
    return false
  }

  private fun openA11ySettings(ctx: Context?) {
    if (ctx == null) return
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
  }
}

object VerdictAccessibilityBridge {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null
  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    emitter?.invoke(name, body)
  }
}
