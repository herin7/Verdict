/**
 * Clean noisy accessibility dumps from shopping apps before LLM identify.
 * Keeps product-signal strings, drops chrome/nav chrome.
 */

import { normalizeCountry, priceRegexFor, type Country } from "../marketplaces/registry.js";

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

function isChrome(token: string): boolean {
  const t = token.trim();
  if (t.length < 2) return true;
  if (t.length > 280) return false;
  return CHROME.some((re) => re.test(t));
}

/** Split a flat a11y dump into tokens, drop chrome, dedupe, keep signal. */
export function cleanScreenText(
  raw: string,
  country: Country | string = "IN"
): {
  cleaned: string;
  asin: string | null;
  priceHint: string | null;
} {
  const c = normalizeCountry(country);
  const priceRe = priceRegexFor(c);
  const asin = raw.match(ASIN_RE)?.[1]?.toUpperCase() ?? null;
  const priceHint = raw.match(priceRe)?.[0] ?? null;

  const parts = raw
    .split(/[\n\r|•·]+|(?:\s{2,})/)
    .map((p) => p.trim())
    .filter(Boolean);

  let tokens = parts;
  if (parts.length < 4 && raw.length > 80) {
    tokens = raw
      .split(/(?<=[.!?])\s+|(?<=\) )\s*(?=[A-Z₹$])|\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (tokens.length < 3) {
      tokens = [raw.trim()];
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
  return { cleaned: cleaned || raw.trim().slice(0, 3500), asin, priceHint };
}
