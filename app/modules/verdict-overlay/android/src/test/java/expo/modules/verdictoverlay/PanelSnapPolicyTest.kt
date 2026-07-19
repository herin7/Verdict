package expo.modules.verdictoverlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PanelSnapPolicyTest {
  @Test
  fun weakReleaseUsesHysteresisTowardStart() {
    val snap = PanelSnapPolicy.resolveSnap(0.56, 0.58, 0f)
    assertEquals(0.56, snap, 0.001)
  }

  @Test
  fun flingUpAdvancesOneStop() {
    val snap = PanelSnapPolicy.resolveSnap(0.56, 0.60, -2000f)
    assertEquals(PanelSnapPolicy.EXPANDED, snap, 0.001)
  }

  @Test
  fun flingDownFromDefaultGoesToPeek() {
    val snap = PanelSnapPolicy.resolveSnap(0.56, 0.50, 2000f)
    assertEquals(PanelSnapPolicy.PEEK, snap, 0.001)
  }

  @Test
  fun flingDownFromPeekDismisses() {
    val snap = PanelSnapPolicy.resolveSnap(0.24, 0.20, 2000f)
    assertEquals(PanelSnapPolicy.DISMISS, snap, 0.001)
  }

  @Test
  fun pullBelowPeekDismisses() {
    val snap = PanelSnapPolicy.resolveSnap(0.24, 0.12, 0f)
    assertEquals(PanelSnapPolicy.DISMISS, snap, 0.001)
  }

  @Test
  fun resistanceBeyondExpanded() {
    val r = PanelSnapPolicy.resist(0.95)
    assertTrue(r < 0.95)
    assertTrue(r > PanelSnapPolicy.EXPANDED)
  }

  @Test
  fun nearestStop() {
    assertEquals(0.56, PanelSnapPolicy.nearestStop(0.50), 0.001)
    assertEquals(0.24, PanelSnapPolicy.nearestStop(0.30), 0.001)
    assertEquals(0.88, PanelSnapPolicy.nearestStop(0.80), 0.001)
  }
}
