/**
 * Zero-token on-device PDP detection from accessibility text.
 * Keep in sync with native ScreenProductHeuristic / ProductPageHeuristic.
 */

const ASIN = /\bB0[A-Z0-9]{8}\b/i;
const FLIPKART_P = /\/p\/[a-z0-9]+/i;
const PRICE =
  /(?:₹|Rs\.?\s*|INR\s*)\s*[\d,]+(?:\.\d{1,2})?|\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b/i;
const BUY_CTA =
  /\b(add to cart|buy now|add to bag|add to basket|go to cart|buy with)\b/i;
const RATING = /\b\d+(\.\d+)?\s*(out of 5|stars?|\/5)\b/i;
const NOT_PDP =
  /\b(search results|results for|showing \d+|filter by|sort by|your orders)\b/i;

function isWatchedMarket(pkg: string): boolean {
  return /amazon|flipkart|myntra|ajio|meesho|nykaa|snapdeal/i.test(pkg);
}

function hasTitleSignal(text: string): boolean {
  const lines = text.includes("\n")
    ? text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    : [text.trim()];
  return lines.some((t) => {
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    return (t.length >= 24 && t.length <= 280 && letters > 10) || letters > 35;
  });
}

export function detectProductPage(text: string, packageName: string): boolean {
  if (!text || text.trim().length < 24) return false;
  const flat = text.replace(/\n/g, " ");
  if (NOT_PDP.test(flat) && !BUY_CTA.test(flat) && !ASIN.test(flat)) return false;

  const pkg = packageName.toLowerCase();
  if (pkg.includes("amazon") && ASIN.test(flat)) return true;
  if (pkg.includes("flipkart") && FLIPKART_P.test(flat)) return true;

  const hasPrice = PRICE.test(flat);
  const hasCta = BUY_CTA.test(flat);
  const hasRating = RATING.test(flat);
  const hasTitle = hasTitleSignal(text);

  if (isWatchedMarket(pkg) && hasPrice && (hasTitle || hasRating || hasCta)) return true;
  return hasPrice && hasCta && hasTitle;
}
