package expo.modules.verdictoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.animation.ValueAnimator
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import com.facebook.react.ReactApplication
import com.facebook.react.interfaces.fabric.ReactSurface
import kotlin.math.abs

class VerdictOverlayService : Service() {
  companion object {
    const val ACTION_SHOW = "verdict.overlay.SHOW"
    const val ACTION_HIDE = "verdict.overlay.HIDE"
    const val ACTION_HIDE_BUBBLE = "verdict.overlay.HIDE_BUBBLE"
    const val ACTION_HOT = "verdict.overlay.HOT"
    const val ACTION_IDLE = "verdict.overlay.IDLE"
    const val ACTION_CLOSE_PANEL = "verdict.overlay.CLOSE_PANEL"
    const val CHANNEL_ID = "verdict_overlay"
    const val NOTIF_ID = 7741
    const val PANEL_SURFACE_MODULE = "VerdictPanel"

    // Fraction of screen height the panel occupies. Default was 0.78 (felt
    // like a near-full-screen takeover); this keeps the sheet compact by
    // default while still leaving room to drag it larger. Bounds keep it from
    // ever collapsing to nothing or eating the whole screen (some of the
    // shopping app underneath should always stay visible/reachable).
    const val PANEL_MIN_HEIGHT_FRACTION = 0.24
    const val PANEL_MAX_HEIGHT_FRACTION = 0.88
    const val PANEL_DEFAULT_HEIGHT_FRACTION = 0.56

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

    /**
     * Kept for diagnostics only. Live drag is fully native (drag strip).
     * JS must not call this during gesture.
     */
    @JvmStatic
    fun resizePanel(fraction: Double) {
      val svc = instance ?: return
      svc.pendingPanelFraction = fraction
      svc.pendingPanelAnimate = false
      svc.schedulePanelResizeFrame()
    }

    @JvmStatic
    fun snapPanel(fraction: Double) {
      val svc = instance ?: return
      if (fraction <= 0.01) {
        svc.mainHandler.post { svc.hidePanel() }
        return
      }
      svc.pendingPanelFraction = fraction
      svc.pendingPanelAnimate = true
      svc.schedulePanelResizeFrame()
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
  private var idlePulseRunnable: Runnable? = null
  private var baseY = 300
  private var pendingPanelFraction: Double? = null
  private var pendingPanelAnimate = false
  private var panelResizePosted = false
  private var panelHeightAnimator: ValueAnimator? = null
  private var dockAnimator: ValueAnimator? = null

  private val panelResizeCallback = Choreographer.FrameCallback {
    panelResizePosted = false
    val fraction = pendingPanelFraction ?: return@FrameCallback
    val animate = pendingPanelAnimate
    pendingPanelFraction = null
    pendingPanelAnimate = false
    applyPanelHeightImmediate(fraction, animate)
  }

  private fun schedulePanelResizeFrame() {
    if (panelResizePosted) return
    panelResizePosted = true
    Choreographer.getInstance().postFrameCallback(panelResizeCallback)
  }

  private fun animatorDurationScale(): Float {
    return try {
      Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    } catch (_: Exception) {
      1f
    }
  }

  private fun motionEnabled(): Boolean = animatorDurationScale() > 0f

  private fun scaledDuration(ms: Long): Long {
    val scale = animatorDurationScale()
    if (scale <= 0f) return 0L
    return (ms * scale).toLong().coerceAtLeast(1L)
  }

  // The product panel is a SEPARATE ReactSurface (own JS root, "VerdictPanel"),
  // hosted directly in its own overlay window - never an Activity launch - so
  // whatever app is in the foreground underneath keeps running and stays
  // touchable everywhere outside the sheet's bounds. See showPanel/hidePanel.
  private var panelView: View? = null
  private var panelSurface: ReactSurface? = null
  private var panelLayoutParams: WindowManager.LayoutParams? = null
  private var panelDragStartY = 0f
  private var panelDragStartFraction = PANEL_DEFAULT_HEIGHT_FRACTION
  private var panelVelocityTracker: VelocityTracker? = null
  private var panelDragLiveFraction = PANEL_DEFAULT_HEIGHT_FRACTION
  private var panelDragPosted = false
  private val panelDragCallback = Choreographer.FrameCallback {
    panelDragPosted = false
    applyPanelHeightImmediate(panelDragLiveFraction, animate = false)
  }

  /**
   * Safety net: a WindowManager overlay window is not an Activity, so it has
   * no lifecycle tie to the screen locking - if the panel is ever left open
   * (whether from a real bug or just the user locking the phone mid-flow),
   * it would otherwise still be sitting there, still eating touches, the
   * next time the screen turns on. Screen-off is a hard reset point: always
   * tear the panel down there regardless of how it got left open.
   */
  private val screenOffReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (panelView != null) {
        android.util.Log.i("VerdictOverlay", "screen off - closing stuck panel")
        hidePanel()
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    // Android 13+ requires runtime-registered receivers to declare
    // RECEIVER_EXPORTED/RECEIVER_NOT_EXPORTED or registerReceiver throws
    // SecurityException outright - ACTION_SCREEN_OFF is a protected system
    // broadcast (only the system can send it) so it's arguably exempt, but
    // that exemption isn't worth trusting when being explicit costs nothing
    // and removes any doubt. The 3-arg overload doesn't exist below API 33.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))
    }
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
      ACTION_CLOSE_PANEL -> {
        hidePanel()
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
    // 56dp badge + 24dp pad each side = 104dp overlay window.
    val size = (56 * density).toInt()
    val pad = (24 * density).toInt()
    val total = size + pad * 2
    // Pulse ring fits inside the 104dp window so scale-up cannot clip.
    val ringSize = (64 * density).toInt()

    val haloView = View(this).apply {
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.parseColor("#66FFD76D"))
      background = bg
      alpha = 0f
      scaleX = 1f
      scaleY = 1f
    }
    halo = haloView

    val ringView = View(this).apply {
      val bg = GradientDrawable()
      bg.shape = GradientDrawable.OVAL
      bg.setColor(Color.TRANSPARENT)
      bg.setStroke((2.5f * density).toInt(), Color.parseColor("#FFD76D"))
      background = bg
      alpha = 0f
      scaleX = 0.95f
      scaleY = 0.95f
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
      addView(haloView, FrameLayout.LayoutParams(ringSize, ringSize).apply { gravity = Gravity.CENTER })
      addView(ringView, FrameLayout.LayoutParams(ringSize, ringSize).apply { gravity = Gravity.CENTER })
      addView(tv, FrameLayout.LayoutParams(size, size).apply { gravity = Gravity.CENTER })
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    baseY = 300
    params = WindowManager.LayoutParams(
      total, total, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
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
          // Cancel idle motion while finger is down so drag feels locked.
          stopIdleFloat()
          stopIdleBadgePulse()
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
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (event.action == MotionEvent.ACTION_UP && !moved) {
            openProductPanel()
          } else if (moved) {
            val dm = resources.displayMetrics
            val mid = dm.widthPixels / 2
            val targetX = if (params!!.x + total / 2 < mid) 16 else dm.widthPixels - total - 16
            animateDockTo(targetX)
          }
          if (!isHot && bubble != null) {
            startIdleFloat()
            startIdleBadgePulse()
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
    val enterMs = if (motionEnabled()) scaledDuration(420) else 0L
    tv.animate()
      .scaleX(1f).scaleY(1f).alpha(1f)
      .setDuration(enterMs)
      .setInterpolator(OvershootInterpolator(1.6f))
      .start()

    if (isHot) startPulse() else {
      startIdleFloat()
      startIdleBadgePulse()
    }
  }

  private fun animateDockTo(targetX: Int) {
    val lp = params ?: return
    val view = bubble ?: return
    val wm = windowManager ?: return
    dockAnimator?.cancel()
    val startX = lp.x
    if (startX == targetX || !motionEnabled()) {
      lp.x = targetX
      try { wm.updateViewLayout(view, lp) } catch (_: Exception) {}
      return
    }
    val anim = ValueAnimator.ofInt(startX, targetX).apply {
      duration = scaledDuration(220)
      interpolator = DecelerateInterpolator()
      addUpdateListener { a ->
        lp.x = a.animatedValue as Int
        try { wm.updateViewLayout(view, lp) } catch (_: Exception) {}
      }
    }
    dockAnimator = anim
    anim.start()
  }

  private fun openProductPanel() {
    // Open the panel window IMMEDIATELY - no a11y capture here. captureNow()
    // walks the accessibility tree with retry sleeps (up to ~3*35ms) and used
    // to run synchronously on this touch-listener callback (the UI thread)
    // before the window was ever added, so the sheet visibly didn't appear
    // until that finished - the "stubborn"/laggy tap-to-open feeling. The
    // panel's own JS (ProductPanelScreen) now does that same capture itself
    // via getCurrentScreenText() right after mounting, while its "Identifying
    // product..." loading state is already visible - capture cost is still
    // there, but it's now hidden behind an already-animating sheet instead of
    // blocking the sheet from appearing at all.
    showPanel(null, null)
  }

  /**
   * Hosts the "VerdictPanel" JS root as its own ReactSurface in a
   * WindowManager overlay window sized to exactly the sheet's footprint
   * (bottom-anchored, PANEL_DEFAULT_HEIGHT_FRACTION of screen height by
   * default, user-resizable within [PANEL_MIN_HEIGHT_FRACTION,
   * PANEL_MAX_HEIGHT_FRACTION] via applyPanelHeight). Everything outside that
   * rectangle is untouched by this window, so touches there still reach
   * whatever app is underneath - this is what makes "both apps usable at
   * once" possible; an Activity launch (the old approach) cannot do this,
   * because Android pauses the previous foreground Activity the instant a
   * new one is brought forward, regardless of translucency.
   */
  /**
   * Was createSurface()+start() from scratch on EVERY tap - a brand new
   * Fabric surface, JS mount, and initial commit before anything appeared,
   * which is real wall-clock cost (not instant, however fast the JS itself
   * runs). hidePanel() no longer tears the surface down, so the common case
   * here is now "reattach the already-running surface's view" - createSurface
   * only ever runs once per service lifetime unless something genuinely killed it.
   */
  private fun showPanel(text: String?, packageName: String?) {
    // Hide the bubble while the panel is up so the two overlay windows
    // don't overlap; the FGS itself stays alive (detachBubbleOnly only
    // removes the bubble's window).
    detachBubbleOnly()

    val existing = panelSurface
    if (existing != null && existing.isRunning) {
      reattachExistingPanel(existing, text, packageName)
      return
    }
    createFreshPanel(text, packageName)
  }

  private fun reactHostOrNull() = (applicationContext as? ReactApplication)?.reactHost

  /**
   * Reuses an already-started surface from an earlier open instead of paying
   * createSurface+start()'s full JS-mount cost again. Its view is otherwise
   * unchanged/stale from that last open, so this tells JS a reopen just
   * happened (VerdictPanelRoot listens for onPanelReopen and remounts the
   * panel with a fresh capture) before reattaching the view to a window.
   */
  private fun reattachExistingPanel(surface: ReactSurface, text: String?, packageName: String?) {
    val view = surface.view
    if (view == null) {
      android.util.Log.w("VerdictOverlay", "reattachExistingPanel: view is null, creating fresh instead")
      panelSurface = null
      createFreshPanel(text, packageName)
      return
    }
    try {
      reactHostOrNull()?.onHostResume(null)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "reactHost.onHostResume failed: ${e.message}")
    }
    VerdictOverlayBridge.emit(
      "onPanelReopen",
      mapOf("text" to (text ?: ""), "packageName" to (packageName ?: ""))
    )
    try {
      attachPanelWindow(view, surface)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "reattachExistingPanel failed: ${e.message}")
    }
  }

  private fun createFreshPanel(text: String?, packageName: String?) {
    try {
      val reactHost = reactHostOrNull()
      if (reactHost == null) {
        android.util.Log.w("VerdictOverlay", "showPanel: no ReactHost on Application")
        return
      }

      val props = Bundle().apply {
        putString("text", text)
        putString("packageName", packageName)
      }
      val surface = reactHost.createSurface(applicationContext, PANEL_SURFACE_MODULE, props)
      val view = surface.view
      if (view == null) {
        android.util.Log.w("VerdictOverlay", "showPanel: surface.view is null")
        return
      }

      // Must start the surface BEFORE the view is ever attached to a window -
      // ReactActivityDelegate.loadApp() (the only code path RN itself exercises
      // for this) does createSurface+start() fully, THEN setContentView. Doing
      // it the other way around (as this used to) races the window's first
      // measure/layout pass against Fabric's async mount, and can win: the
      // window ends up on screen, sized and touch-intercepting, before any
      // content has mounted into it - a real but empty window that swallows
      // touches while rendering nothing.
      //
      // start() returns a TaskInterface<Void> that completes ASYNCHRONOUSLY on
      // a background executor (ReactHostImpl.startSurface) - it was previously
      // discarded outright, so any failure/fault in mounting this surface was
      // completely silent (no crash, no log - matching exactly "blank +
      // touch-eating, no visible error"). Log its outcome without blocking
      // this thread, so a real failure shows up in logcat instead of nothing.
      val startTask = surface.start()
      Thread {
        try {
          startTask.waitForCompletion(5, java.util.concurrent.TimeUnit.SECONDS)
          if (startTask.isFaulted()) {
            android.util.Log.e("VerdictOverlay", "surface.start() FAULTED: ${startTask.getError()}", startTask.getError())
          } else if (!startTask.isCompleted()) {
            android.util.Log.w("VerdictOverlay", "surface.start() did not complete within 5s")
          } else {
            android.util.Log.i("VerdictOverlay", "surface.start() completed ok")
          }
        } catch (e: Exception) {
          android.util.Log.w("VerdictOverlay", "surface.start() wait failed: ${e.message}")
        }
      }.start()

      // This ReactHost is shared with the main app's own Activity/surface -
      // MainActivity calls onHostPause on it the instant the shopping app
      // (backed by a totally separate process/task) comes to the foreground.
      // Per ReactHost.kt's own doc comment this must be called for a surface
      // to be considered "resumed" - without it, this second surface may
      // never leave whatever pre-resume state a background-started host is
      // in. Safe to call with a null Activity per the API's own signature.
      // Isolated in its own try/catch - a failure here shouldn't prevent the
      // window itself from at least being attempted below.
      try {
        reactHost.onHostResume(null)
      } catch (e: Exception) {
        android.util.Log.w("VerdictOverlay", "reactHost.onHostResume failed: ${e.message}")
      }

      attachPanelWindow(view, surface)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "showPanel failed: ${e.message}")
    }
  }

  /** Shared by both the fresh-create and warm-reattach paths. */
  private fun attachPanelWindow(view: View, surface: ReactSurface) {
    val wm = windowManager ?: (getSystemService(WINDOW_SERVICE) as WindowManager).also { windowManager = it }
    val dm = resources.displayMetrics
    val height = (dm.heightPixels * PANEL_DEFAULT_HEIGHT_FRACTION).toInt()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    val layoutParams = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      height,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.BOTTOM
    }

    val root = FrameLayout(this)
    (view.parent as? android.view.ViewGroup)?.removeView(view)
    root.addView(
      view,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    )

    val stripH = (48f * dm.density).toInt()
    val dragStrip = View(this).apply {
      // Transparent hit target over the visible handle; content stays clickable below.
      setBackgroundColor(Color.TRANSPARENT)
      isClickable = true
      setOnTouchListener { _, event -> handlePanelDrag(event) }
    }
    root.addView(
      dragStrip,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, stripH, Gravity.TOP)
    )

    try {
      wm.addView(root, layoutParams)
    } catch (e: Exception) {
      try { surface.stop() } catch (_: Exception) {}
      try { surface.detach() } catch (_: Exception) {}
      if (panelSurface === surface) panelSurface = null
      throw e
    }
    panelView = root
    panelSurface = surface
    panelLayoutParams = layoutParams
    panelDragLiveFraction = PANEL_DEFAULT_HEIGHT_FRACTION
  }

  private fun handlePanelDrag(event: MotionEvent): Boolean {
    val screenH = resources.displayMetrics.heightPixels.toFloat().coerceAtLeast(1f)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        panelHeightAnimator?.cancel()
        panelHeightAnimator = null
        val lp = panelLayoutParams
        panelDragStartFraction =
          if (lp != null) lp.height.toDouble() / screenH.toDouble() else PANEL_DEFAULT_HEIGHT_FRACTION
        panelDragStartY = event.rawY
        panelDragLiveFraction = panelDragStartFraction
        panelVelocityTracker?.recycle()
        panelVelocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        panelVelocityTracker?.addMovement(event)
        val dy = event.rawY - panelDragStartY
        // Finger down shrinks panel (bottom-anchored)
        val next = PanelSnapPolicy.clampLive(panelDragStartFraction - dy / screenH)
        panelDragLiveFraction = next
        if (!panelDragPosted) {
          panelDragPosted = true
          Choreographer.getInstance().postFrameCallback(panelDragCallback)
        }
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        panelVelocityTracker?.addMovement(event)
        panelVelocityTracker?.computeCurrentVelocity(1000)
        val vy = panelVelocityTracker?.yVelocity ?: 0f
        panelVelocityTracker?.recycle()
        panelVelocityTracker = null
        val snap = PanelSnapPolicy.resolveSnap(
          panelDragStartFraction,
          panelDragLiveFraction,
          vy,
          dismissEnabled = true
        )
        if (snap <= 0.01) {
          hidePanel()
        } else {
          applyPanelHeightImmediate(snap, animate = true)
          panelDragLiveFraction = snap
        }
        return true
      }
    }
    return false
  }

  /** Live-resizes the open panel window in place - see companion resizePanel(). */
  private fun applyPanelHeightImmediate(fraction: Double, animate: Boolean) {
    if (fraction <= 0.01) {
      hidePanel()
      return
    }
    val view = panelView ?: return
    val lp = panelLayoutParams ?: return
    val wm = windowManager ?: return
    val target = if (animate) {
      fraction.coerceIn(PanelSnapPolicy.PEEK, PanelSnapPolicy.EXPANDED)
    } else {
      PanelSnapPolicy.clampLive(fraction)
    }
    val newHeight = (resources.displayMetrics.heightPixels * target).toInt()
    if (lp.height == newHeight) return

    if (animate && motionEnabled()) {
      panelHeightAnimator?.cancel()
      val from = lp.height
      val anim = ValueAnimator.ofInt(from, newHeight).apply {
        duration = scaledDuration(180)
        interpolator = DecelerateInterpolator()
        addUpdateListener { a ->
          lp.height = a.animatedValue as Int
          try { wm.updateViewLayout(view, lp) } catch (_: Exception) {}
        }
      }
      panelHeightAnimator = anim
      anim.start()
      return
    }

    panelHeightAnimator?.cancel()
    lp.height = newHeight
    try {
      wm.updateViewLayout(view, lp)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "applyPanelHeight failed: ${e.message}")
    }
  }

  private fun hidePanel() {
    panelHeightAnimator?.cancel()
    panelHeightAnimator = null
    pendingPanelFraction = null
    if (panelResizePosted) {
      Choreographer.getInstance().removeFrameCallback(panelResizeCallback)
      panelResizePosted = false
    }
    val view = panelView
    panelView = null
    panelLayoutParams = null
    try {
      if (view != null) windowManager?.removeView(view)
    } catch (e: Exception) {
      android.util.Log.w("VerdictOverlay", "hidePanel removeView failed: ${e.message}")
    }
    // Deliberately NOT stopping/detaching panelSurface anymore - it's kept
    // alive (and NOT nulled) so the next showPanel can reattach the same
    // already-running surface instantly (see reattachExistingPanel) instead
    // of paying createSurface+start()'s full JS-mount cost on every open.
    // Only onDestroy (service actually dying) does a real teardown.
    ensureRunning()
  }

  fun setHot(hot: Boolean) {
    mainHandler.post {
      android.util.Log.i("VerdictOverlay", "setHot=$hot bubble=${bubble != null}")
      if (isHot == hot && bubble != null) {
        if (hot && pulseRunnable == null) {
          stopIdleFloat()
          stopIdleBadgePulse()
          startPulse()
        }
        if (!hot && pulseRunnable != null) {
          stopPulse()
          startIdleFloat()
          startIdleBadgePulse()
        }
        return@post
      }
      isHot = hot
      if (bubble == null) return@post
      if (hot) {
        stopIdleFloat()
        stopIdleBadgePulse()
        startPulse()
      } else {
        stopPulse()
        startIdleFloat()
        startIdleBadgePulse()
      }
    }
  }

  /**
   * Idle float amplitude capped near 2dp via density. ViewPropertyAnimator
   * translateY - GPU transform, not WindowManager thrash.
   */
  private fun startIdleFloat() {
    stopIdleFloat()
    if (isHot || !motionEnabled()) return
    val b = bubble ?: return
    val amp = 2f * resources.displayMetrics.density
    val dur = scaledDuration(1400)
    val r = object : Runnable {
      override fun run() {
        val current = bubble
        if (isHot || current == null) return
        current.animate()
          .translationY(-amp)
          .alpha(1f)
          .setDuration(dur)
          .setInterpolator(AccelerateDecelerateInterpolator())
          .withEndAction {
            val c = bubble
            if (isHot || c == null) return@withEndAction
            c.animate()
              .translationY(amp)
              .setDuration(dur)
              .setInterpolator(AccelerateDecelerateInterpolator())
              .withEndAction { if (!isHot && bubble != null) mainHandler.post(this) }
              .start()
          }
          .start()
      }
    }
    floatRunnable = r
    mainHandler.post(r)
  }

  private fun stopIdleFloat() {
    floatRunnable?.let { mainHandler.removeCallbacks(it) }
    floatRunnable = null
    bubble?.animate()?.cancel()
    bubble?.translationY = 0f
  }

  /** Restrained idle badge scale 1.0 → 1.035 plus soft halo breathe. */
  private fun startIdleBadgePulse() {
    stopIdleBadgePulse()
    if (isHot || !motionEnabled()) return
    val b = badge ?: return
    val h = halo ?: return
    h.alpha = 0.22f
    h.scaleX = 1f
    h.scaleY = 1f
    val dur = scaledDuration(1600)
    val r = object : Runnable {
      override fun run() {
        if (isHot || badge == null) return
        b.animate()
          .scaleX(1.035f).scaleY(1.035f)
          .setDuration(dur)
          .setInterpolator(AccelerateDecelerateInterpolator())
          .withEndAction {
            if (isHot || badge == null) return@withEndAction
            b.animate()
              .scaleX(1f).scaleY(1f)
              .setDuration(dur)
              .setInterpolator(AccelerateDecelerateInterpolator())
              .withEndAction { if (!isHot && badge != null) mainHandler.post(this) }
              .start()
          }
          .start()
        h.animate()
          .alpha(0.38f).scaleX(1.08f).scaleY(1.08f)
          .setDuration(dur)
          .setInterpolator(AccelerateDecelerateInterpolator())
          .withEndAction {
            if (isHot || halo == null) return@withEndAction
            h.animate()
              .alpha(0.22f).scaleX(1f).scaleY(1f)
              .setDuration(dur)
              .setInterpolator(AccelerateDecelerateInterpolator())
              .start()
          }
          .start()
      }
    }
    idlePulseRunnable = r
    mainHandler.post(r)
  }

  private fun stopIdleBadgePulse() {
    idlePulseRunnable?.let { mainHandler.removeCallbacks(it) }
    idlePulseRunnable = null
    badge?.animate()?.cancel()
    halo?.animate()?.cancel()
    badge?.scaleX = 1f
    badge?.scaleY = 1f
    badge?.alpha = 1f
    halo?.alpha = 0f
    halo?.scaleX = 1f
    halo?.scaleY = 1f
  }

  /**
   * Hot pulse: single ring scale+fade inside the 64dp ring bounds so it
   * cannot clip the 104dp overlay window.
   */
  private fun startPulse() {
    stopPulse()
    if (!motionEnabled()) {
      ring?.alpha = 0.7f
      halo?.alpha = 0.3f
      return
    }
    val r = ring ?: return
    val h = halo ?: return
    android.util.Log.i("VerdictOverlay", "startPulse")

    h.alpha = 0.35f
    h.scaleX = 1f
    h.scaleY = 1f
    r.alpha = 0.85f
    r.scaleX = 0.95f
    r.scaleY = 0.95f

    val pulse = object : Runnable {
      override fun run() {
        if (!isHot || ring == null) return
        r.animate()
          .scaleX(1.2f).scaleY(1.2f).alpha(0f)
          .setDuration(scaledDuration(1400))
          .setInterpolator(AccelerateDecelerateInterpolator())
          .withEndAction {
            if (!isHot || ring == null) return@withEndAction
            r.scaleX = 0.95f
            r.scaleY = 0.95f
            r.alpha = 0.85f
            mainHandler.postDelayed(this, scaledDuration(220))
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
    stopIdleBadgePulse()
    dockAnimator?.cancel()
    dockAnimator = null
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
    try { unregisterReceiver(screenOffReceiver) } catch (_: Exception) {}
    detachBubbleOnly()
    // Direct teardown, not hidePanel() - that also calls ensureRunning() to
    // bring the bubble back, which would re-add a window right as this
    // service (and its context) is being torn down.
    panelView?.let { v -> try { windowManager?.removeView(v) } catch (_: Exception) {} }
    panelSurface?.let { s ->
      try { s.stop() } catch (_: Exception) {}
      try { s.detach() } catch (_: Exception) {}
    }
    panelView = null
    panelSurface = null
    panelLayoutParams = null
    isRunning = false
    isHot = false
    if (instance === this) instance = null
    super.onDestroy()
  }
}
