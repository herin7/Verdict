import { search, scrapeHtml, AnakinCreditError } from "./anakin.js";
import { firecrawlEnabled, firecrawlSearch, firecrawlOgImage } from "./firecrawl.js";
import { withTimeout, hostname } from "./webResearch.js";
import type { ProductIdentity } from "./schema.js";

const SKIP_HOSTS = ["reddit.com", "youtube.com", "youtu.be", "quora.com", "pinterest.com"];

function isGoodCandidate(url: string): boolean {
  const host = hostname(url);
  if (!host || host === url) return false;
  return !SKIP_HOSTS.some((h) => host.includes(h));
}

const OG_IMAGE_RE = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
];

function extractOgImage(html: string): string | null {
  for (const re of OG_IMAGE_RE) {
    const m = re.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * One cheap search + one scrape to find a real product photo (og:image) from a
 * retailer/manufacturer page. Anakin first, Firecrawl fallback - same precedence
 * as the rest of the app. Returns null (never throws for "not found") so callers
 * can fall back to the user's own captured photo.
 */
export async function findProductImage(product: ProductIdentity): Promise<string | null> {
  const term = product.searchTerm || product.name;
  const prompt = `${term} official product photo`;

  let results: { url: string }[] = [];
  try {
    results = await withTimeout(search(prompt, 5), 8000, []);
  } catch (err) {
    if (!(err instanceof AnakinCreditError)) {
      console.warn(`[productImage] anakin search failed: ${(err as Error).message}`);
    }
  }
  if (results.length === 0 && firecrawlEnabled()) {
    try {
      results = await withTimeout(firecrawlSearch(prompt, 5), 8000, []);
    } catch (err) {
      console.warn(`[productImage] firecrawl search failed: ${(err as Error).message}`);
    }
  }

  const candidate = results.find((r) => isGoodCandidate(r.url));
  if (!candidate) return null;

  try {
    const html = await withTimeout(scrapeHtml(candidate.url), 9000, null);
    const image = html ? extractOgImage(html) : null;
    if (image) return image;
  } catch (err) {
    if (!(err instanceof AnakinCreditError)) {
      console.warn(`[productImage] anakin scrape failed: ${(err as Error).message}`);
    }
  }

  if (firecrawlEnabled()) {
    try {
      return await withTimeout(firecrawlOgImage(candidate.url), 9000, null);
    } catch (err) {
      console.warn(`[productImage] firecrawl og:image failed: ${(err as Error).message}`);
    }
  }

  return null;
}
