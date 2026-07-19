package expo.modules.verdictoverlay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VerdictOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VerdictOverlay")

    // Fired when an already-warm panel surface is reattached to a window
    // instead of recreated from scratch (see VerdictOverlayService.showPanel/
    // reattachExistingPanel) - the surface's view is unchanged/stale from
    // its last open, so JS (VerdictPanelRoot) needs telling to remount with a
    // fresh capture rather than showing whatever it last displayed.
    Events("onPanelReopen")

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

    // Closes the floating product panel (a separate ReactSurface hosted
    // directly by VerdictOverlayService - see showPanel/hidePanel there).
    Function("closePanel") {
      closePanelWindow(appContext.reactContext)
      null
    }

    // The panel never launches MainActivity (that's the whole point - the
    // shopping app underneath stays live). This is the one deliberate,
    // user-initiated exception: "open full report" switches to the full app.
    Function("openMainApp") {
      openMainAppActivity(appContext.reactContext)
      null
    }

    // Called at drag-gesture frequency from the panel's own resize handle -
    // goes straight to VerdictOverlayService's static method (same package,
    // no Intent/startService round trip) since that path is far too much
    // overhead to pay dozens of times a second while dragging.
    Function("resizePanel") { fraction: Double ->
      VerdictOverlayService.resizePanel(fraction)
      null
    }

    Function("snapPanel") { fraction: Double ->
      VerdictOverlayService.snapPanel(fraction)
      null
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

  private fun closePanelWindow(ctx: Context?) {
    if (ctx == null) return
    val intent = Intent(ctx, VerdictOverlayService::class.java).apply {
      action = VerdictOverlayService.ACTION_CLOSE_PANEL
    }
    ctx.startService(intent)
  }

  private fun openMainAppActivity(ctx: Context?) {
    if (ctx == null) return
    try {
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      if (launch != null) {
        launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
        ctx.startActivity(launch)
      }
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "openMainApp failed: ${e.message}")
    }
  }
}

object VerdictOverlayBridge {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null
  fun emit(name: String, body: Map<String, Any?> = emptyMap()) {
    emitter?.invoke(name, body)
  }
}
