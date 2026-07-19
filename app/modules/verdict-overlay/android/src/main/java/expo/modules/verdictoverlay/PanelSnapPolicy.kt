package expo.modules.verdictoverlay

/**
 * Pure snap/dismiss policy for the overlay panel. Unit-testable without Android runtime.
 * Stops: 24% (peek), 56% (default), 88% (expanded). Downward from peek dismisses.
 */
object PanelSnapPolicy {
  const val PEEK = 0.24
  const val DEFAULT = 0.56
  const val EXPANDED = 0.88
  const val DISMISS = 0.0

  /** px/s — above this, fling advances one stop in fling direction */
  const val FLING_VELOCITY = 1200f

  /** Hysteresis band around midpoints for weak releases */
  const val HYSTERESIS = 0.06

  fun stops(): DoubleArray = doubleArrayOf(PEEK, DEFAULT, EXPANDED)

  fun nearestStop(fraction: Double): Double {
    val s = stops()
    var best = s[0]
    var bestDist = kotlin.math.abs(fraction - best)
    for (i in 1 until s.size) {
      val d = kotlin.math.abs(fraction - s[i])
      if (d < bestDist) {
        bestDist = d
        best = s[i]
      }
    }
    return best
  }

  /**
   * @param startFraction height when gesture began
   * @param currentFraction live height fraction
   * @param velocityY px/s; positive = finger moving down (panel shrinking)
   * @param dismissEnabled whether peek can dismiss
   */
  fun resolveSnap(
    startFraction: Double,
    currentFraction: Double,
    velocityY: Float,
    dismissEnabled: Boolean = true
  ): Double {
    val flingDown = velocityY > FLING_VELOCITY
    val flingUp = velocityY < -FLING_VELOCITY
    val s = stops()

    if (flingUp) {
      val next = s.firstOrNull { it > startFraction + 0.01 } ?: EXPANDED
      return next
    }
    if (flingDown) {
      val prev = s.lastOrNull { it < startFraction - 0.01 }
      if (prev != null) return prev
      if (dismissEnabled && startFraction <= PEEK + HYSTERESIS) return DISMISS
      return PEEK
    }

    // Weak release: hysteresis toward start, else nearest
    val nearest = nearestStop(currentFraction)
    if (kotlin.math.abs(currentFraction - startFraction) < HYSTERESIS) {
      return nearestStop(startFraction)
    }
    if (dismissEnabled && currentFraction < PEEK - HYSTERESIS * 0.5) {
      return DISMISS
    }
    return nearest
  }

  /** Elastic resistance beyond [PEEK, EXPANDED]. */
  fun resist(fraction: Double): Double {
    if (fraction in PEEK..EXPANDED) return fraction
    if (fraction > EXPANDED) {
      val over = fraction - EXPANDED
      return EXPANDED + over * 0.35
    }
    // below peek
    val under = PEEK - fraction
    return PEEK - under * 0.35
  }

  fun clampLive(fraction: Double): Double = resist(fraction).coerceIn(0.08, 0.95)
}
