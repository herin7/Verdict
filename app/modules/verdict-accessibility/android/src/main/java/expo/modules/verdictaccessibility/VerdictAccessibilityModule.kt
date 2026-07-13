package expo.modules.verdictaccessibility

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VerdictAccessibilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VerdictAccessibility")

    Events("onScreenText", "onLeftShoppingApp")

    OnCreate {
      VerdictAccessibilityBridge.emitter = { name, body ->
        try {
          this@VerdictAccessibilityModule.sendEvent(name, body)
        } catch (_: Exception) {
        }
      }
    }

    Function("isServiceEnabled") {
      VerdictAccessibilityService.enabled
    }

    Function("openAccessibilitySettings") {
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      null
    }

    Function("getLastScreenText") {
      VerdictAccessibilityService.lastText
    }

    Function("getLastPackageName") {
      VerdictAccessibilityService.lastPackage
    }

    Function("setWatchlist") { packages: List<String> ->
      VerdictAccessibilityService.watchlist = packages.toSet()
      null
    }
  }
}

object VerdictAccessibilityBridge {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null
  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    emitter?.invoke(name, body)
  }
}
