package expo.modules.verdictoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.sin

class VerdictOverlayService : Service() {
  companion object {
    const val ACTION_SHOW = "verdict.overlay.SHOW"
    const val ACTION_HIDE = "verdict.overlay.HIDE"
    const val ACTION_HIDE_BUBBLE = "verdict.overlay.HIDE_BUBBLE"
    const val ACTION_HOT = "verdict.overlay.HOT"
    const val ACTION_IDLE = "verdict.overlay.IDLE"
    const val CHANNEL_ID = "verdict_overlay"
    const val NOTIF_ID = 7741

    const val EXTRA_PANEL = "verdict_panel"
    const val EXTRA_TEXT = "verdict_text"
    const val EXTRA_PKG = "verdict_pkg"

    @Volatile var isRunning = false
    @Volatile var isHot = false
    @Volatile var bubbleAttached = false
    @Volatile private var instance: VerdictOverlayService? = null

    @JvmStatic
    fun requestHot(hot: Boolean) {
      android.util.Log.i("VerdictOverlay", "requestHot=$hot running=$isRunning")
      val svc = instance
        ?: throw IllegalStateException("overlay service not running")
      svc.setHot(hot)
    }

    @JvmStatic
    fun requestShow() {
      android.util.Log.i("VerdictOverlay", "requestShow running=$isRunning")
      val svc = instance
        ?: throw IllegalStateException("overlay service not running")
      svc.mainHandler.post {
        if (!isRunning) {
          svc.startAsForeground()
          isRunning = true
        }
        svc.showBubble()
      }
    }

    @JvmStatic
    fun requestHide() {
      android.util.Log.i("VerdictOverlay", "requestHide")
      val svc = instance
        ?: throw IllegalStateException("overlay service not running")
      svc.mainHandler.post {
        svc.detachBubbleOnly()
      }
    }
  }

  private var windowManager: WindowManager? = null
  private var bubble: FrameLayout? = null
  private var ring: View? = null
  private var halo: View? = null
  private var badge: TextView? = null
  private var params: WindowManager.LayoutParams? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var pulseRunnable: Runnable? = null
  private var floatRunnable: Runnable? = null
  private var baseY = 300
  private var floatPhase = 0f

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    android.util.Log.i("VerdictOverlay", "onStartCommand action=${intent?.action}")
    when (intent?.action) {
      ACTION_HIDE -> {
        setHot(false)
        detachBubbleOnly()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        isRunning = false
      }
      ACTION_HIDE_BUBBLE -> {
        setHot(false)
        detachBubbleOnly()
      }
      ACTION_HOT -> {
        ensureRunning()
        setHot(true)
      }
      ACTION_IDLE -> {
        setHot(false)
      }
      else -> {
        // SHOW / default
        ensureRunning()
      }
    }
    return START_STICKY
  }

  private fun ensureRunning() {
    if (!isRunning) {
      startAsForeground()
      isRunning = true
    }
    showBubble()
  }

  private fun startAsForeground() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(NotificationManager::class.java)
      val channel = NotificationChannel(CHANNEL_ID, "Verdict bubble", NotificationManager.IMPORTANCE_LOW)
      mgr.createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(
      this, 0, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
        .setContentTitle("Verdict is ready")
        .setContentText("Tap the bubble to research the product on screen")
        .setSmallIcon(android.R.drawable.ic_menu_search)
        .setContentIntent(pi)
        .setOngoing(true)
        .build()
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
        .setContentTitle("Verdict is ready")
        .setContentText("Tap the bubble to research the product on screen")
        .setSmallIcon(android.R.drawable.ic_menu_search)
        .setContentIntent(pi)
        .setOngoing(true)
        .build()
    }
    startForeground(NOTIF_ID, notif)
  }

  private fun showBubble() {
    if (bubble != null) {
      bubbleAttached = true
      return
    }
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    val density = resources.displayMetrics.density
    val size = (56 * density).toInt()
    val pad = (24 * density).toInt()
    val total = size + pad * 2

    val haloView = View(this).apply {
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.parseColor("#66FFD76D"))
      background = bg
      alpha = 0f
    }
    halo = haloView

    val ringView = View(this).apply {
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.TRANSPARENT)
      bg.setStroke((3f * density).toInt(), Color.parseColor("#FFD76D"))
      background = bg
      alpha = 0f
      scaleX = 0.9f
      scaleY = 0.9f
    }
    ring = ringView

    val tv = TextView(this).apply {
      text = "V"
      textSize = 20f
      setTextColor(Color.parseColor("#171106"))
      gravity = Gravity.CENTER
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.parseColor("#FFD76D"))
      background = bg
      elevation = 10f * density
      scaleX = 0.2f
      scaleY = 0.2f
      alpha = 0f
    }
    badge = tv

    val container = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(total, total)
      addView(haloView, FrameLayout.LayoutParams(total, total).apply { gravity = Gravity.CENTER })
      addView(ringView, FrameLayout.LayoutParams(total, total).apply { gravity = Gravity.CENTER })
      addView(tv, FrameLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER })
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    baseY = 300
    params = WindowManager.LayoutParams(
      total, total, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 40
      y = baseY
    }

    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var moved = false

    container.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = params!!.x
          startY = params!!.y
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downX).toInt()
          val dy = (event.rawY - downY).toInt()
          if (abs(dx) > 8 || abs(dy) > 8) moved = true
          params!!.x = startX + dx
          params!!.y = startY + dy
          baseY = params!!.y
          windowManager?.updateViewLayout(container, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            openProductPanel()
          } else {
            val dm = resources.displayMetrics
            val mid = dm.widthPixels / 2
            params!!.x = if (params!!.x + total / 2 < mid) 16 else dm.widthPixels - total - 16
            baseY = params!!.y
            windowManager?.updateViewLayout(container, params)
          }
          true
        }
        else -> false
      }
    }

    bubble = container
    windowManager?.addView(container, params)
    bubbleAttached = true

    // Spring entrance
    tv.animate()
      .scaleX(1f).scaleY(1f).alpha(1f)
      .setDuration(420)
      .setInterpolator(OvershootInterpolator(1.6f))
      .start()

    if (isHot) startPulse() else startIdleFloat()
  }

  private fun openProductPanel() {
    // Fresh a11y capture before launching.
    var text: String? = null
    var pkg: String? = null
    try {
      val clazz = Class.forName("expo.modules.verdictaccessibility.VerdictAccessibilityService")
      @Suppress("UNCHECKED_CAST")
      val snap = clazz.getMethod("captureNow").invoke(null) as? Map<String, Any?>
      text = snap?.get("text") as? String
      pkg = snap?.get("packageName") as? String
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "captureNow failed: ${e.message}")
    }

    try {
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      if (launch != null) {
        launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
        launch.putExtra(EXTRA_PANEL, true)
        if (!text.isNullOrBlank()) launch.putExtra(EXTRA_TEXT, text)
        if (!pkg.isNullOrBlank()) launch.putExtra(EXTRA_PKG, pkg)
        startActivity(launch)
      }
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "launch failed: ${e.message}")
    }

    VerdictOverlayBridge.emit(
      "onBubbleTap",
      mapOf(
        "text" to text,
        "packageName" to pkg,
        "panel" to true,
      )
    )
  }

  fun setHot(hot: Boolean) {
    mainHandler.post {
      android.util.Log.i("VerdictOverlay", "setHot=$hot bubble=${bubble != null}")
      if (isHot == hot && bubble != null) {
        if (hot && pulseRunnable == null) {
          stopIdleFloat()
          startPulse()
        }
        if (!hot && pulseRunnable != null) {
          stopPulse()
          startIdleFloat()
        }
        return@post
      }
      isHot = hot
      if (bubble == null) return@post
      if (hot) {
        stopIdleFloat()
        startPulse()
      } else {
        stopPulse()
        startIdleFloat()
      }
    }
  }

  private fun startIdleFloat() {
    stopIdleFloat()
    if (isHot) return
    floatPhase = 0f
    val r = object : Runnable {
      override fun run() {
        if (isHot || bubble == null || params == null) return
        floatPhase += 0.08f
        val offset = (sin(floatPhase.toDouble()) * 6).toInt()
        params!!.y = baseY + offset
        try {
          windowManager?.updateViewLayout(bubble, params)
        } catch (_: Exception) {
        }
        badge?.alpha = 0.92f + 0.08f * sin(floatPhase.toDouble()).toFloat()
        mainHandler.postDelayed(this, 32)
      }
    }
    floatRunnable = r
    mainHandler.post(r)
  }

  private fun stopIdleFloat() {
    floatRunnable?.let { mainHandler.removeCallbacks(it) }
    floatRunnable = null
    badge?.alpha = 1f
    if (params != null && bubble != null) {
      params!!.y = baseY
      try {
        windowManager?.updateViewLayout(bubble, params)
      } catch (_: Exception) {
      }
    }
  }

  private fun startPulse() {
    stopPulse()
    val r = ring ?: return
    val h = halo ?: return
    val b = badge ?: return
    android.util.Log.i("VerdictOverlay", "startPulse")

    h.alpha = 0.55f
    h.scaleX = 1f
    h.scaleY = 1f
    r.alpha = 1f
    r.scaleX = 0.95f
    r.scaleY = 0.95f
    b.animate().scaleX(1.08f).scaleY(1.08f).setDuration(200)
      .setInterpolator(OvershootInterpolator(1.2f)).start()

    val pulse = object : Runnable {
      override fun run() {
        if (!isHot || ring == null || halo == null) return
        h.animate()
          .scaleX(1.6f).scaleY(1.6f).alpha(0f)
          .setDuration(1100)
          .setInterpolator(AccelerateDecelerateInterpolator())
          .start()
        r.animate()
          .scaleX(1.5f).scaleY(1.5f).alpha(0f)
          .setDuration(1100)
          .setInterpolator(AccelerateDecelerateInterpolator())
          .withEndAction {
            if (!isHot || ring == null || halo == null) return@withEndAction
            h.scaleX = 1f
            h.scaleY = 1f
            h.alpha = 0.55f
            r.scaleX = 0.95f
            r.scaleY = 0.95f
            r.alpha = 1f
            b.animate()
              .scaleX(1.12f).scaleY(1.12f)
              .setDuration(300)
              .withEndAction {
                if (!isHot) return@withEndAction
                b.animate().scaleX(1.05f).scaleY(1.05f).setDuration(300).start()
              }
              .start()
            mainHandler.postDelayed(this, 180)
          }
          .start()
      }
    }
    pulseRunnable = pulse
    mainHandler.post(pulse)
  }

  private fun stopPulse() {
    pulseRunnable?.let { mainHandler.removeCallbacks(it) }
    pulseRunnable = null
    ring?.animate()?.cancel()
    halo?.animate()?.cancel()
    badge?.animate()?.cancel()
    ring?.alpha = 0f
    ring?.scaleX = 0.9f
    ring?.scaleY = 0.9f
    halo?.alpha = 0f
    halo?.scaleX = 1f
    halo?.scaleY = 1f
    badge?.scaleX = 1f
    badge?.scaleY = 1f
  }

  /** Hide bubble window but keep foreground service alive. */
  private fun detachBubbleOnly() {
    stopPulse()
    stopIdleFloat()
    bubble?.let {
      try { windowManager?.removeView(it) } catch (_: Exception) {}
    }
    bubble = null
    ring = null
    halo = null
    badge = null
    bubbleAttached = false
  }

  override fun onDestroy() {
    detachBubbleOnly()
    isRunning = false
    isHot = false
    if (instance === this) instance = null
    super.onDestroy()
  }
}
