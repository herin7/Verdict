package expo.modules.verdictoverlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VerdictOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VerdictOverlay")

    Events("onBubbleTap")

    OnCreate {
      VerdictOverlayBridge.emitter = { name, body ->
        try {
          this@VerdictOverlayModule.sendEvent(name, body)
        } catch (_: Exception) {
        }
      }
    }

    Function("canDrawOverlays") {
      val ctx = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(ctx)
      } else true
    }

    Function("requestOverlayPermission") {
      val ctx = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:${ctx.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
      }
      null
    }

    Function("showBubble") {
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
        action = VerdictOverlayService.ACTION_SHOW
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      null
    }

    Function("hideBubble") {
      val ctx = appContext.reactContext ?: return@Function null
      val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
        action = VerdictOverlayService.ACTION_HIDE
      }
      ctx.startService(intent)
      null
    }

    Function("isBubbleVisible") {
      VerdictOverlayService.isRunning
    }
  }
}

object VerdictOverlayBridge {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null

  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    emitter?.invoke(name, body)
  }
}
