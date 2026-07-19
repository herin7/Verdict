/**
 * Amazon.in product HTML → price/stock.
 * Endpoint: GET https://www.amazon.in/dp/{ASIN} (mobile UA).
 * # ponytail: buy-box DOM (#apex_desktop / a-offscreen) is fragile; JSON-LD preferred when present. Upgrade: a2z-offers widget if DOM drifts.
 */

import { inferStockStatus, pickBestPayableFromText } from "../normalize.js";
import { amazonInUrl } from "./ids.js";
import { fetchHtml } from "./http.js";
import type { DirectOffer } from "./types.js";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function titleFromHtml(html: string): string | null {
  const t =
    html.match(/id=["']productTitle["'][^>]*>([\s\S]{0,1000}?)<\/span>/i)?.[1] ||
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/content="([^"]+)"\s+property="og:title"/i)?.[1];
  return t ? decodeHtml(t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim() : null;
}

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const t = rec["@type"];
        const types = Array.isArray(t) ? t : [t];
        if (types.some((x) => String(x).toLowerCase().includes("product"))) out.push(rec);
        const graph = rec["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) {
            if (!g || typeof g !== "object") continue;
            const gt = (g as { "@type"?: unknown })["@type"];
            const gtypes = Array.isArray(gt) ? gt : [gt];
            if (gtypes.some((x) => String(x).toLowerCase().includes("product"))) {
              out.push(g as Record<string, unknown>);
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

function priceFromJsonLd(html: string): {
  priceRaw: string;
  currency: string;
  inStock: boolean | null;
  title: string | null;
  fieldPath: string;
} | null {
  for (const block of jsonLdBlocks(html)) {
    const title = typeof block.name === "string" ? block.name : null;
    const offers = block.offers;
    const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
    for (const o of list) {
      if (!o || typeof o !== "object") continue;
      const rec = o as Record<string, unknown>;
      const price = rec.price ?? rec.lowPrice;
      if (price == null) continue;
      const currency = typeof rec.priceCurrency === "string" ? rec.priceCurrency : "INR";
      const avail = String(rec.availability ?? "");
      const inStock = /instock/i.test(avail) ? true : /outofstock|soldout/i.test(avail) ? false : null;
      return {
        priceRaw: String(price),
        currency,
        inStock,
        title,
        fieldPath: "json_ld.offers.price",
      };
    }
  }
  return null;
}

function priceFromBuyBox(html: string): { priceRaw: string; fieldPath: string; context: string } | null {
  // ponytail: Amazon DOM classes drift. Restrict to explicitly payable containers;
  // broad a-offscreen/a-price scans selected basis-price MRP in live July 2026 tests.
  const payableRegion =
    html.match(/(?:priceToPay|dealPrice|priceblock_(?:dealprice|ourprice))[\s\S]{0,1800}/i)?.[0] ??
    null;
  if (payableRegion) {
    const best = pickBestPayableFromText(payableRegion.replace(/<[^>]+>/g, " "), {
      source: "product_format",
      defaultCurrency: "INR",
      declaredCurrency: "INR",
    });
    if (best?.raw) {
      return { priceRaw: best.raw, fieldPath: "buybox.priceToPay", context: payableRegion };
    }
  }
  const meta =
    html.match(/property="product:price:amount"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/content="([^"]+)"\s+property="product:price:amount"/i)?.[1];
  if (meta && /\d/.test(meta)) {
    return { priceRaw: meta, fieldPath: "meta.product:price:amount", context: meta };
  }
  return null;
}

function stockFromHtml(html: string): boolean | null {
  const avail = html.match(/id="availability"[\s\S]{0,800}/i)?.[0] ?? "";
  return inferStockStatus(avail || html.slice(0, 50_000), null);
}

export function parseAmazonInHtml(
  html: string,
  opts: { asin: string; url?: string }
): DirectOffer | null {
  const url = opts.url ?? amazonInUrl(opts.asin);
  const fromLd = priceFromJsonLd(html);
  const fromBox = priceFromBuyBox(html);
  const priceRaw = fromLd?.priceRaw ?? fromBox?.priceRaw ?? null;
  if (!priceRaw) return null;

  const title = fromLd?.title ?? titleFromHtml(html) ?? `Amazon ${opts.asin}`;
  const currency = fromLd?.currency ?? "INR";
  const inStock = fromLd?.inStock ?? stockFromHtml(html);
  const fieldPath = fromLd?.fieldPath ?? fromBox?.fieldPath ?? "amazon_in";
  const context = fromBox?.context ?? priceRaw;

  return {
    retailerId: "amazon_in",
    retailer: "Amazon",
    url,
    title,
    priceRaw,
    currency,
    inStock,
    seller: null,
    priceContext: context,
    fieldPath,
    priceSource: fromLd ? "json_ld" : fromBox?.fieldPath.startsWith("meta") ? "meta" : "product_format",
    productId: opts.asin.toUpperCase(),
  };
}

export async function fetchAmazonInOffer(
  asin: string,
  opts: { timeoutMs?: number } = {}
): Promise<DirectOffer | null> {
  const url = amazonInUrl(asin);
  const res = await fetchHtml(url, { timeoutMs: opts.timeoutMs ?? 5_000 });
  if (!res.ok) {
    console.warn(`[direct/amazon_in] ${asin} ${res.error}`);
    return null;
  }
  return parseAmazonInHtml(res.html, { asin, url: res.finalUrl || url });
}
