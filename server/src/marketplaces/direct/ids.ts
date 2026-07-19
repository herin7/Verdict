/**
 * ASIN / Flipkart item-id / FSN extraction from a11y dumps and URLs.
 * Direct fetch needs these IDs; search alone often leaves hasAsin:false.
 */

/** Classic Amazon ASIN (B0……). */
const ASIN_TOKEN_RE = /\b(B0[A-Z0-9]{8})\b/i;
/** URL / labeled forms — 10-char product id. */
const ASIN_LABELED_RE = /\basin[\s:=\-_/#]+([A-Z0-9]{10})\b/i;
const ASIN_URL_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i;

/** Flipkart /p/itm… product id in URLs. */
const FK_ITEM_RE = /\/p\/(itm[a-z0-9]{6,})\b/i;
/** Labeled FSN / product id on screen. */
const FSN_LABELED_RE = /\b(?:fsn|product\s*id|pid)[\s:=\-_#]+([A-Z0-9]{10,20})\b/i;
/** Flipkart SKU-ish tokens (e.g. MOBGTAGPTB3VS24W) near electronics dumps. */
const FSN_SKU_RE = /\b((?:MOB|ACCE|FOOT|TOPP|SARI|WATCH|BAGS|STROL)[A-Z0-9]{10,16})\b/i;

export function extractAsin(text: string | null | undefined): string | null {
  if (!text) return null;
  const url = text.match(ASIN_URL_RE)?.[1];
  if (url) return url.toUpperCase();
  const labeled = text.match(ASIN_LABELED_RE)?.[1];
  if (labeled) return labeled.toUpperCase();
  const token = text.match(ASIN_TOKEN_RE)?.[1];
  return token ? token.toUpperCase() : null;
}

export function extractFlipkartItemId(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(FK_ITEM_RE);
  return m?.[1]?.toLowerCase() ?? null;
}

export function extractFsn(text: string | null | undefined): string | null {
  if (!text) return null;
  const labeled = text.match(FSN_LABELED_RE)?.[1];
  if (labeled) return labeled.toUpperCase();
  const sku = text.match(FSN_SKU_RE)?.[1];
  return sku ? sku.toUpperCase() : null;
}

export function amazonInUrl(asin: string): string {
  return `https://www.amazon.in/dp/${asin.toUpperCase()}`;
}

export function flipkartItemUrl(itemId: string): string {
  return `https://www.flipkart.com/product/p/${itemId.toLowerCase()}`;
}

/** Prefer pid=FSN search URL when we only have FSN (no /p/itm). */
export function flipkartFsnUrl(fsn: string): string {
  return `https://www.flipkart.com/search?q=${encodeURIComponent(fsn)}`;
}

export type ProductMarketplaceIds = {
  asin: string | null;
  fsn: string | null;
  flipkartItemId: string | null;
};

export function extractProductIds(...blobs: Array<string | null | undefined>): ProductMarketplaceIds {
  const joined = blobs.filter(Boolean).join("\n");
  return {
    asin: extractAsin(joined),
    fsn: extractFsn(joined),
    flipkartItemId: extractFlipkartItemId(joined),
  };
}

export function idsFromProductUrl(url: string): ProductMarketplaceIds {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host.includes("amazon.") || host.includes("amzn.")) {
      return { asin: extractAsin(url), fsn: null, flipkartItemId: null };
    }
    if (host.includes("flipkart.")) {
      return {
        asin: null,
        fsn: extractFsn(url) ?? u.searchParams.get("pid")?.toUpperCase() ?? null,
        flipkartItemId: extractFlipkartItemId(url),
      };
    }
  } catch {
    /* ignore */
  }
  return { asin: null, fsn: null, flipkartItemId: null };
}
