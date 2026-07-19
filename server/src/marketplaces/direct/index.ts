/**
 * Direct marketplace offers (Amazon.in + Flipkart) before Firecrawl extract.
 */

import type { ProductIdentity } from "../../schema.js";
import { fetchAmazonInOffer, parseAmazonInHtml } from "./amazonIn.js";
import { fetchFlipkartOffer, parseFlipkartHtml } from "./flipkart.js";
import { extractProductIds, idsFromProductUrl, type ProductMarketplaceIds } from "./ids.js";
import { fetchHtml } from "./http.js";
import type { DirectOffer } from "./types.js";

export type { DirectOffer } from "./types.js";
export {
  extractAsin,
  extractFsn,
  extractFlipkartItemId,
  extractProductIds,
  idsFromProductUrl,
  amazonInUrl,
  flipkartItemUrl,
} from "./ids.js";
export { parseAmazonInHtml, fetchAmazonInOffer } from "./amazonIn.js";
export { parseFlipkartHtml, fetchFlipkartOffer } from "./flipkart.js";

export type DirectFetchOpts = {
  asin?: string | null;
  fsn?: string | null;
  flipkartItemId?: string | null;
  productUrl?: string | null;
  timeoutMs?: number;
};

function mergeIds(
  product: ProductIdentity,
  opts: DirectFetchOpts
): ProductMarketplaceIds & { productUrl: string | null } {
  const fromText = extractProductIds(product.name, product.searchTerm, product.model);
  const fromUrl = opts.productUrl ? idsFromProductUrl(opts.productUrl) : null;
  return {
    asin: opts.asin ?? fromUrl?.asin ?? fromText.asin,
    fsn: opts.fsn ?? fromUrl?.fsn ?? fromText.fsn,
    flipkartItemId: opts.flipkartItemId ?? fromUrl?.flipkartItemId ?? fromText.flipkartItemId,
    productUrl: opts.productUrl ?? null,
  };
}

/** Parallel Amazon.in + Flipkart fetches when IDs known. ~5s timeout each. */
export async function fetchDirectOffers(
  product: ProductIdentity,
  opts: DirectFetchOpts = {}
): Promise<DirectOffer[]> {
  const ids = mergeIds(product, opts);
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const tasks: Promise<DirectOffer | null>[] = [];

  if (ids.asin) {
    tasks.push(fetchAmazonInOffer(ids.asin, { timeoutMs }));
  } else if (ids.productUrl && /amazon\./i.test(ids.productUrl)) {
    tasks.push(
      (async () => {
        const res = await fetchHtml(ids.productUrl!, { timeoutMs });
        if (!res.ok) return null;
        const asin = idsFromProductUrl(res.finalUrl).asin ?? "UNKNOWN";
        return parseAmazonInHtml(res.html, { asin, url: res.finalUrl });
      })()
    );
  }

  if (ids.flipkartItemId || ids.fsn || (ids.productUrl && /flipkart\./i.test(ids.productUrl))) {
    tasks.push(
      fetchFlipkartOffer({
        itemId: ids.flipkartItemId,
        fsn: ids.fsn,
        url: ids.productUrl && /flipkart\./i.test(ids.productUrl) ? ids.productUrl : null,
        timeoutMs,
      })
    );
  }

  if (!tasks.length) return [];
  const settled = await Promise.all(tasks);
  return settled.filter((o): o is DirectOffer => Boolean(o?.priceRaw));
}

/**
 * Direct-parse a known product URL (search hit). Returns null on failure —
 * caller keeps Firecrawl extract as fallback.
 */
export async function fetchDirectOfferFromUrl(
  url: string,
  opts: { timeoutMs?: number } = {}
): Promise<DirectOffer | null> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const ids = idsFromProductUrl(url);
  if (ids.asin || /amazon\./i.test(url)) {
    if (ids.asin) return fetchAmazonInOffer(ids.asin, { timeoutMs });
    const res = await fetchHtml(url, { timeoutMs });
    if (!res.ok) return null;
    const asin = idsFromProductUrl(res.finalUrl).asin ?? "UNKNOWN";
    return parseAmazonInHtml(res.html, { asin, url: res.finalUrl });
  }
  if (ids.flipkartItemId || ids.fsn || /flipkart\./i.test(url)) {
    return fetchFlipkartOffer({
      itemId: ids.flipkartItemId,
      fsn: ids.fsn,
      url,
      timeoutMs,
    });
  }
  return null;
}

export function isDirectCapableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.includes("amazon.") || host.includes("amzn.") || host.includes("flipkart.");
  } catch {
    return false;
  }
}
