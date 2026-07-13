package expo.modules.verdictaccessibility

/**
 * Zero-token PDP detect from a11y text. Hardcoded marketplace signals only.
 * Keep in sync with app/src/detectProductPage.ts + overlay ProductPageHeuristic.
 *
 * Native shopping apps often hide "Add to Cart" as image buttons, so Amazon /
 * Flipkart packages use a looser rule: price-like signal + title-sized line.
 */
internal object ScreenProductHeuristic {
  private val ASIN = Regex("""\bB0[A-Z0-9]{8}\b""", RegexOption.IGNORE_CASE)
  private val FLIPKART_P = Regex("""/p/[a-z0-9]+""", RegexOption.IGNORE_CASE)
  private val PRICE = Regex(
    """(?:₹|Rs\.?\s*|INR\s*)\s*[\d,]+(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b""",
    RegexOption.IGNORE_CASE
  )
  private val BUY_CTA = Regex(
    """\b(add to cart|buy now|add to bag|add to basket|go to cart|buy with|थैले में डालें|कार्ट में)\b""",
    RegexOption.IGNORE_CASE
  )
  private val RATING = Regex("""\b\d+(\.\d+)?\s*(out of 5|stars?|/5)\b""", RegexOption.IGNORE_CASE)
  private val NOT_PDP = Regex(
    """\b(search results|results for|showing \d+|filter by|sort by|your orders)\b""",
    RegexOption.IGNORE_CASE
  )

  fun isProductPage(text: String?, packageName: String?): Boolean {
    if (text.isNullOrBlank() || text.length < 24) return false
    val flat = text.replace('\n', ' ')
    if (NOT_PDP.containsMatchIn(flat) && !BUY_CTA.containsMatchIn(flat) && !ASIN.containsMatchIn(flat)) {
      return false
    }

    val pkg = packageName.orEmpty().lowercase()
    if (pkg.contains("amazon") && ASIN.containsMatchIn(flat)) return true
    if (pkg.contains("flipkart") && FLIPKART_P.containsMatchIn(flat)) return true

    val hasPrice = PRICE.containsMatchIn(flat)
    val hasCta = BUY_CTA.containsMatchIn(flat)
    val hasRating = RATING.containsMatchIn(flat)
    val hasTitle = hasTitleSignal(text)

    // Watched marketplace apps: price + (title OR rating) is enough.
    // CTAs are frequently icon-only on Amazon/Flipkart native.
    if (isWatchedMarket(pkg) && hasPrice && (hasTitle || hasRating || hasCta)) return true

    return hasPrice && hasCta && hasTitle
  }

  private fun isWatchedMarket(pkg: String): Boolean {
    return pkg.contains("amazon") ||
      pkg.contains("flipkart") ||
      pkg.contains("myntra") ||
      pkg.contains("ajio") ||
      pkg.contains("meesho") ||
      pkg.contains("nykaa") ||
      pkg.contains("snapdeal")
  }

  private fun hasTitleSignal(text: String): Boolean {
    val lines = if (text.contains('\n')) {
      text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
    } else {
      listOf(text.trim())
    }
    return lines.any { t ->
      val letters = t.count { it.isLetter() }
      (t.length in 24..280 && letters > 10) || letters > 35
    }
  }
}
