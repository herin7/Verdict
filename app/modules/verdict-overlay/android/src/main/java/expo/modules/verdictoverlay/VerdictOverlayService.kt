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
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import kotlin.math.abs

class VerdictOverlayService : Service() {
  companion object {
    const val ACTION_SHOW = "verdict.overlay.SHOW"
    const val ACTION_HIDE = "verdict.overlay.HIDE"
    const val CHANNEL_ID = "verdict_overlay"
    const val NOTIF_ID = 7741
    @Volatile var isRunning = false
  }

  private var windowManager: WindowManager? = null
  private var bubble: View? = null
  private var params: WindowManager.LayoutParams? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_HIDE -> {
        removeBubble()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        isRunning = false
      }
      else -> {
        startAsForeground()
        showBubble()
        isRunning = true
      }
    }
    return START_STICKY
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
    if (bubble != null) return
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    val size = (56 * resources.displayMetrics.density).toInt()
    val tv = TextView(this).apply {
      text = "V"
      textSize = 20f
      setTextColor(Color.parseColor("#171106"))
      gravity = Gravity.CENTER
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.parseColor("#FFD76D"))
      background = bg
    }
    val container = FrameLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(size, size)
      addView(tv, FrameLayout.LayoutParams(size, size))
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    params = WindowManager.LayoutParams(
      size, size, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 40
      y = 300
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
          windowManager?.updateViewLayout(container, params)
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            VerdictOverlayBridge.emit("onBubbleTap")
          } else {
            // edge snap
            val dm = resources.displayMetrics
            val mid = dm.widthPixels / 2
            params!!.x = if (params!!.x + size / 2 < mid) 16 else dm.widthPixels - size - 16
            windowManager?.updateViewLayout(container, params)
          }
          true
        }
        else -> false
      }
    }

    bubble = container
    windowManager?.addView(container, params)
  }

  private fun removeBubble() {
    bubble?.let {
      try { windowManager?.removeView(it) } catch (_: Exception) {}
    }
    bubble = null
  }

  override fun onDestroy() {
    removeBubble()
    isRunning = false
    super.onDestroy()
  }
}
