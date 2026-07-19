/**
 * Clean noisy accessibility dumps from shopping apps before LLM identify.
 * Keeps product-signal strings, drops chrome/nav chrome.
 * Price hint uses context-ranked evidence, never first regex hit alone.
 */

import { normalizeCountry, priceRegexFor, type Country } from "../marketplaces/registry.js";
import {
  buildPriceCandidate,
  payableFromEvidence,
  pickBestPayableCandidate,
  type PriceCandidate,
} from "../marketplaces/normalize.js";
import { extractAsin, extractFsn, extractFlipkartItemId } from "../marketplaces/direct/ids.js";

const CHROME = [
  /^search amazon/i,
  /^search flipkart/i,
  /^deliver to/i,
  /^hello,?/i,
  /^sign in/i,
  /^account/i,
  /^cart$/i,
  /^your orders$/i,
  /^returns? (&|and) orders$/i,
  /^skip to/i,
  /^menu$/i,
  /^home$/i,
  /^back$/i,
  /^close$/i,
  /^filter$/i,
  /^sort by/i,
  /^sponsored$/i,
  /^ad$/i,
  /^see all$/i,
  /^view all$/i,
  /^shop now$/i,
  /^buy now$/i,
  /^add to cart$/i,
  /^add to wishlist$/i,
  /^share$/i,
  /^save for later$/i,
  /^customers who/i,
  /^frequently bought/i,
  /^compare with/i,
  /^related products?$/i,
  /^inspired by/i,
  /^top picks/i,
  /^best sellers?$/i,
  /^today'?s deals?$/i,
  /^prime$/i,
  /^join prime/i,
  /^free delivery/i,
  /^get it by/i,
  /^in stock$/i,
  /^out of stock$/i,
  /^only \d+ left/i,
  /^\d+(\.\d+)? out of 5/i,
  /^\d+(\.\d+)? stars?$/i,
  /^rating$/i,
  /^reviews?$/i,
  /^\d+(\+)? ratings?$/i,
  /^\d+(\+)? reviews?$/i,
  /^qty$/i,
  /^quantity$/i,
  /^size$/i,
  /^colour$/i,
  /^color$/i,
  /^select$/i,
  /^continue$/i,
  /^proceed to/i,
  /^checkout$/i,
  /^pay with/i,
  /^emi/i,
  /^₹\s*$/,
  /^rs\.?\s*$/i,
  /^\$\s*$/,
];

const ASIN_RE = /\b(B0[A-Z0-9]{8})\b/i;
const BUY_BOX_RE = /\b(add to cart|buy now|buy it now|proceed to buy|place order|add to bag)\b/i;
const BREADCRUMB_RE = /(?:^|\n)\s*[\w][\w &'/-]{1,30}(?:\s*[>›]\s*[\w][\w &'/-]{1,30}){1,5}/;
/** Prefix currency forms only for glyphs — avoids "P. ₹" from M.R.P. bridging. */
const CURRENCY_NUM_RE =
  /(?:₹|Rs\.?\s*|INR\b|Rupees?\s*|\$|USD\b)\s*[\d,.]+|[\d,.]+\s*(?:USD\b|INR\b|Rs\.?\b)/gi;

function isChrome(token: string): boolean {
  const t = token.trim();
  if (t.length < 2) return true;
  if (t.length > 280) return false;
  return CHROME.some((re) => re.test(t));
}

/**
 * Native a11y often emits currency glyph and digits as sibling nodes
 * ("₹" then "29,990"). Rejoin before ranking so marker-gated parsers fire.
 */
export function rejoinSplitCurrency(raw: string): string {
  return raw
    .replace(/(₹|Rs\.?|INR|Rupees?|\$|USD)\s*[\n\r|•·]+\s*([\d,.]+)/gi, "$1$2")
    .replace(/(₹|Rs\.?|INR|Rupees?|\$|USD)\s{1,}([\d,.]+)/gi, "$1$2");
}

/**
 * Collect every currency-marked number, rank payable sale/current near
 * title/buy-box, return null when ambiguous.
 */
export function extractScreenPriceHint(
  raw: string,
  country: Country | string = "IN"
): { priceHint: string | null; candidates: PriceCandidate[] } {
  const c = normalizeCountry(country);
  const defaultCurrency = c === "US" ? "USD" : "INR";
  const joined = rejoinSplitCurrency(raw);
  const lines = joined
    .split(/[\n\r|•·]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const candidates: PriceCandidate[] = [];
  const buyBoxIdx = lines.findIndex((l) => BUY_BOX_RE.test(l));
  const titleIdx = lines.findIndex((l) => l.length > 25 && /^[A-Z]/.test(l) && !CURRENCY_NUM_RE.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matches = line.match(CURRENCY_NUM_RE);
    if (!matches) continue;
    // Only glue a previous label line like "M.R.P.:" — never pull "12,483 ratings"
    // onto a clean sale amount on the next node.
    const prev = i > 0 ? lines[i - 1]! : "";
    const labelPrev =
      /^(m\.?r\.?p\.?|list\s*price|was|original|sale(?:\s*price)?|deal(?:\s*price)?|limited\s*time\s*deal|now|selling\s*price|special\s*price|offer\s*price)[:.\s]*$/i.test(
        prev.trim()
      );
    const next = i + 1 < lines.length ? lines[i + 1]! : "";
    const taxNext = /^inclusive\s+of\s+all\s+taxes/i.test(next.trim());
    const context = [labelPrev ? prev : null, line, taxNext ? next : null].filter(Boolean).join(" ");
    for (const rawMatch of matches) {
      if (!/\d/.test(rawMatch) || /^\d[\d,.]*\s*[₹$]\s*$/.test(rawMatch.trim())) continue;
      candidates.push(
        buildPriceCandidate({
          raw: rawMatch,
          context,
          source: "screen_text",
          declaredCurrency: defaultCurrency,
          defaultCurrency,
          allowBareNumeric: false,
        })
      );
    }
  }

  // ponytail: ceiling = sibling-node ₹ split still leaves bare grouped digits.
  // Upgrade: richer a11y node pairing on native. Fallback only when no markers.
  if (!candidates.some((cand) => payableFromEvidence(cand))) {
    const hasMarker = (s: string) =>
      /(?:₹|Rs\.?\s*|INR\b|Rupees?\s*|\$|USD\b)\s*[\d,.]+|[\d,.]+\s*(?:₹|Rs\.?|INR\b|\$|USD\b)/i.test(s);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (hasMarker(line)) continue;
      const bareRe = /\b(\d{1,2},\d{2},\d{3}|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?\b/g;
      let m: RegExpExecArray | null;
      while ((m = bareRe.exec(line)) !== null) {
        const nearBuy = buyBoxIdx >= 0 && Math.abs(i - buyBoxIdx) <= 6;
        const nearTitle = titleIdx >= 0 && Math.abs(i - titleIdx) <= 4;
        if (!nearBuy && !nearTitle && buyBoxIdx < 0) continue;
        candidates.push(
          buildPriceCandidate({
            raw: m[1]!,
            context: line,
            source: "screen_text",
            declaredCurrency: defaultCurrency,
            defaultCurrency,
            allowBareNumeric: true,
            fieldPath: "price",
          })
        );
      }
    }
  }

  const payable = candidates.filter((cand) => payableFromEvidence(cand));
  if (!payable.length) return { priceHint: null, candidates };

  const best = pickBestPayableCandidate(payable, (cand) => {
    let score = 0;
    const lineIdx = lines.findIndex((l) => l.includes(cand.raw));
    if (buyBoxIdx >= 0 && lineIdx >= 0) score += Math.max(0, 40 - Math.abs(lineIdx - buyBoxIdx) * 5);
    if (titleIdx >= 0 && lineIdx >= 0) score += Math.max(0, 25 - Math.abs(lineIdx - titleIdx) * 3);
    if (cand.amount != null && cand.amount > 100) score += 5;
    // Sale usually sits above a split "M.R.P.:" node — boost that pattern
    if (
      lineIdx >= 0 &&
      lines.slice(lineIdx + 1, lineIdx + 3).some((l) => /\bm\.?r\.?p\.?\b/i.test(l))
    ) {
      score += 25;
    }
    // Flipkart-style: unlabeled higher sibling often list; boost lower near buy box
    if (
      lineIdx >= 0 &&
      lines.slice(lineIdx + 1, lineIdx + 3).some((l) => /^inclusive\s+of\s+all\s+taxes/i.test(l.trim()))
    ) {
      score += 15;
    }
    return score;
  });

  return { priceHint: best?.raw ?? null, candidates };
}

/** Split a flat a11y dump into tokens, drop chrome, dedupe, keep signal. */
export function cleanScreenText(
  raw: string,
  country: Country | string = "IN"
): {
  cleaned: string;
  asin: string | null;
  fsn: string | null;
  flipkartItemId: string | null;
  priceHint: string | null;
  hasBuyBox: boolean;
  hasBreadcrumb: boolean;
} {
  const c = normalizeCountry(country);
  const priceRe = priceRegexFor(c);
  const joined = rejoinSplitCurrency(raw);
  const asin = extractAsin(joined);
  const fsn = extractFsn(joined);
  const flipkartItemId = extractFlipkartItemId(joined);
  const { priceHint } = extractScreenPriceHint(joined, c);
  const hasBuyBox = BUY_BOX_RE.test(joined);
  const hasBreadcrumb = BREADCRUMB_RE.test(joined);

  const parts = joined
    .split(/[\n\r|•·]+|(?:\s{2,})/)
    .map((p) => p.trim())
    .filter(Boolean);

  let tokens = parts;
  if (parts.length < 4 && joined.length > 80) {
    tokens = joined
      .split(/(?<=[.!?])\s+|(?<=\) )\s*(?=[A-Z₹$])|\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (tokens.length < 3) {
      tokens = [joined.trim()];
    }
  }

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const tok of tokens) {
    if (isChrome(tok)) continue;
    const key = tok.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(tok);
    if (kept.length >= 80) break;
  }

  const ranked = [...kept].sort((a, b) => {
    const score = (s: string) => {
      let n = Math.min(s.length, 160);
      if (priceRe.test(s)) n += 20;
      if (/^[A-Z]/.test(s) && s.length > 25) n += 30;
      if (ASIN_RE.test(s)) n += 40;
      return n;
    };
    return score(b) - score(a);
  });

  const cleaned = ranked.slice(0, 40).join("\n").slice(0, 3500);
  return {
    cleaned: cleaned || joined.trim().slice(0, 3500),
    asin,
    fsn,
    flipkartItemId,
    priceHint,
    hasBuyBox,
    hasBreadcrumb,
  };
}
