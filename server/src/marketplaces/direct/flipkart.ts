/**
 * Flipkart product HTML → price/stock.
 * Endpoints: GET product /p/itm… page, or search?q=FSN.
 * # ponytail: prefers id="jsonLD" Offer.price (stable 2026). __INITIAL_STATE__ pricing is A/B and often not inlined — skip unless easy.
 */

import { inferStockStatus } from "../normalize.js";
import { flipkartFsnUrl, flipkartItemUrl } from "./ids.js";
import { fetchHtml } from "./http.js";
import type { DirectOffer } from "./types.js";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseJsonLd(html: string): {
  title: string | null;
  priceRaw: string;
  currency: string;
  inStock: boolean | null;
  sku: string | null;
} | null {
  const m =
    html.match(/id="jsonLD"[^>]*>([\s\S]*?)<\/script>/i) ||
    html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const t = rec["@type"];
      const types = Array.isArray(t) ? t : [t];
      if (!types.some((x) => String(x).toLowerCase().includes("product"))) continue;
      const offers = rec.offers;
      const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const o of list) {
        if (!o || typeof o !== "object") continue;
        const off = o as Record<string, unknown>;
        if (off.price == null || Number(off.price) <= 0) continue;
        const avail = String(off.availability ?? "");
        const inStock = /instock/i.test(avail)
          ? true
          : /outofstock|soldout/i.test(avail)
            ? false
            : null;
        return {
          title: typeof rec.name === "string" ? decodeHtml(rec.name) : null,
          priceRaw: String(off.price),
          currency: typeof off.priceCurrency === "string" ? off.priceCurrency : "INR",
          inStock,
          sku: typeof rec.sku === "string" ? rec.sku : null,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Fallback when jsonLD missing: explicit payable field only. */
function priceFromEmbedded(html: string): { priceRaw: string; fieldPath: string } | null {
  // ponytail: generic "price" and first-rupee scans hit MRP/recommendations and
  // returned ₹0 for unavailable products in live tests. Add fields only after
  // observing Flipkart rename them.
  const m = html.match(/"(?:sellingPrice|finalPrice|specialPrice)"\s*:\s*(\d{1,7}(?:\.\d{1,2})?)\b/i);
  if (m?.[1] && Number(m[1]) > 0) {
    return { priceRaw: m[1], fieldPath: "embedded.payablePrice" };
  }
  return null;
}

function titleFromHtml(html: string): string | null {
  const og =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1];
  return og ? decodeHtml(og).trim() : null;
}

function firstProductHref(html: string): string | null {
  const m = html.match(/href="(\/[^"]+\/p\/itm[a-z0-9]+[^"]*)"/i);
  if (!m?.[1]) return null;
  return `https://www.flipkart.com${m[1].split("?")[0]}`;
}

export function parseFlipkartHtml(
  html: string,
  opts: { url: string; productId?: string | null }
): DirectOffer | null {
  const fromLd = parseJsonLd(html);
  const embedded = fromLd ? null : priceFromEmbedded(html);
  const priceRaw = fromLd?.priceRaw ?? embedded?.priceRaw ?? null;
  if (!priceRaw) return null;

  const title = fromLd?.title ?? titleFromHtml(html) ?? "Flipkart product";
  const inStock =
    fromLd?.inStock ??
    inferStockStatus(html.slice(0, 40_000), null);

  return {
    retailerId: "flipkart",
    retailer: "Flipkart",
    url: opts.url,
    title,
    priceRaw,
    currency: fromLd?.currency ?? "INR",
    inStock,
    seller: null,
    priceContext: priceRaw,
    fieldPath: fromLd ? "json_ld.offers.price" : embedded!.fieldPath,
    priceSource: fromLd ? "json_ld" : "product_format",
    productId: opts.productId ?? fromLd?.sku ?? null,
  };
}

export async function fetchFlipkartOffer(opts: {
  itemId?: string | null;
  fsn?: string | null;
  url?: string | null;
  timeoutMs?: number;
}): Promise<DirectOffer | null> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  let url = opts.url ?? null;
  if (!url && opts.itemId) url = flipkartItemUrl(opts.itemId);
  if (!url && opts.fsn) url = flipkartFsnUrl(opts.fsn);
  if (!url) return null;

  const res = await fetchHtml(url, { timeoutMs });
  if (!res.ok) {
    console.warn(`[direct/flipkart] ${url} ${res.error}`);
    return null;
  }

  // Search page: follow first /p/itm link once.
  let html = res.html;
  let finalUrl = res.finalUrl || url;
  if (!/id="jsonLD"|application\/ld\+json/i.test(html) && /\/search\?/i.test(finalUrl)) {
    const href = firstProductHref(html);
    if (href) {
      const second = await fetchHtml(href, { timeoutMs });
      if (second.ok) {
        html = second.html;
        finalUrl = second.finalUrl || href;
      }
    }
  }

  return parseFlipkartHtml(html, {
    url: finalUrl,
    productId: opts.fsn ?? opts.itemId ?? null,
  });
}
