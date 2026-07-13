package expo.modules.verdictoverlay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
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
      canDraw(appContext.reactContext)
    }

    Function("requestOverlayPermission") {
      requestOverlay(appContext.reactContext)
      null
    }

    Function("showBubble") {
      startBubble(appContext.reactContext, show = true)
      null
    }

    Function("hideBubble") {
      // Soft hide: detach bubble, keep FGS so return is instant.
      softHide(appContext.reactContext)
      null
    }

    Function("isBubbleVisible") {
      VerdictOverlayService.bubbleAttached
    }

    Function("setBubbleHot") { hot: Boolean ->
      setHot(appContext.reactContext, hot)
      null
    }

    Function("setPanelTranslucent") { translucent: Boolean ->
      setTranslucent(appContext.currentActivity, translucent)
      null
    }

    Function("moveTaskToBack") {
      moveBack(appContext.currentActivity)
      null
    }

    Function("consumePanelIntent") {
      consumePanel(appContext.currentActivity)
    }
  }

  private fun canDraw(ctx: Context?): Boolean {
    if (ctx == null) return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(ctx)
    } else {
      true
    }
  }

  private fun requestOverlay(ctx: Context?) {
    if (ctx == null) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${ctx.packageName}")
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    }
  }

  private fun startBubble(ctx: Context?, show: Boolean) {
    if (ctx == null) return
    val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
      action = if (show) VerdictOverlayService.ACTION_SHOW else VerdictOverlayService.ACTION_HIDE
    }
    if (show && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
  }

  private fun softHide(ctx: Context?) {
    if (ctx == null) return
    val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
      action = VerdictOverlayService.ACTION_HIDE_BUBBLE
    }
    ctx.startService(intent)
  }

  private fun setHot(ctx: Context?, hot: Boolean) {
    if (ctx == null) return
    val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
      action = if (hot) VerdictOverlayService.ACTION_HOT else VerdictOverlayService.ACTION_IDLE
    }
    if (hot && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
  }

  private fun setTranslucent(activity: Activity?, translucent: Boolean) {
    if (activity == null) return
    activity.runOnUiThread {
      try {
        val window = activity.window
        if (translucent) {
          window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
          window.statusBarColor = Color.TRANSPARENT
          window.navigationBarColor = Color.TRANSPARENT
          tryConvertToTranslucent(activity)
        } else {
          window.setBackgroundDrawable(ColorDrawable(Color.parseColor("#0B0B0B")))
          tryConvertFromTranslucent(activity)
        }
      } catch (e: Exception) {
        android.util.Log.w("VerdictOverlay", "setPanelTranslucent failed: ${e.message}")
      }
    }
  }

  private fun tryConvertToTranslucent(activity: Activity) {
    try {
      val listenerClass = Class.forName("android.app.Activity\$TranslucentConversionListener")
      val optionsClass = Class.forName("android.app.ActivityOptions")
      val method = Activity::class.java.getDeclaredMethod(
        "convertToTranslucent",
        listenerClass,
        optionsClass
      )
      method.isAccessible = true
      method.invoke(activity, null, null)
    } catch (_: Exception) {
      try {
        val method = Activity::class.java.getDeclaredMethod("convertToTranslucent")
        method.isAccessible = true
        method.invoke(activity)
      } catch (e: Exception) {
        android.util.Log.w("VerdictOverlay", "convertToTranslucent unavailable: ${e.message}")
      }
    }
  }

  private fun tryConvertFromTranslucent(activity: Activity) {
    try {
      val method = Activity::class.java.getDeclaredMethod("convertFromTranslucent")
      method.isAccessible = true
      method.invoke(activity)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "convertFromTranslucent unavailable: ${e.message}")
    }
  }

  private fun moveBack(activity: Activity?) {
    if (activity == null) return
    activity.runOnUiThread {
      try {
        activity.moveTaskToBack(true)
      } catch (e: Exception) {
        android.util.Log.w("VerdictOverlay", "moveTaskToBack failed: ${e.message}")
      }
    }
  }

  private fun consumePanel(activity: Activity?): Map<String, Any?>? {
    if (activity == null) return null
    val intent = activity.intent ?: return null
    if (!intent.getBooleanExtra(VerdictOverlayService.EXTRA_PANEL, false)) return null
    val text = intent.getStringExtra(VerdictOverlayService.EXTRA_TEXT)
    val pkg = intent.getStringExtra(VerdictOverlayService.EXTRA_PKG)
    intent.removeExtra(VerdictOverlayService.EXTRA_PANEL)
    intent.removeExtra(VerdictOverlayService.EXTRA_TEXT)
    intent.removeExtra(VerdictOverlayService.EXTRA_PKG)
    return mapOf(
      "panel" to true,
      "text" to text,
      "packageName" to pkg,
    )
  }
}

object VerdictOverlayBridge {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null

  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    emitter?.invoke(name, body)
  }
}
