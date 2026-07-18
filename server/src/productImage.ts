import { firecrawlEnabled, firecrawlSearch, firecrawlOgImage } from "./firecrawl.js";
import { withTimeout, hostname } from "./webResearch.js";
import { updateProductImage } from "./repositories/products.js";
import type { ProductIdentity } from "./schema.js";

const SKIP_HOSTS = ["reddit.com", "youtube.com", "youtu.be", "quora.com", "pinterest.com"];

function isGoodCandidate(url: string): boolean {
  const host = hostname(url);
  if (!host || host === url) return false;
  return !SKIP_HOSTS.some((h) => host.includes(h));
}

/**
 * One cheap search + one scrape to find a real product photo (og:image) from a
 * retailer/manufacturer page. Returns null (never throws for "not found") so
 * callers can fall back to the user's own captured photo.
 */
export async function findProductImage(product: ProductIdentity): Promise<string | null> {
  if (!firecrawlEnabled()) return null;
  const term = product.searchTerm || product.name;
  const prompt = `${term} official product photo`;

  let results: { url: string }[] = [];
  try {
    results = await withTimeout(firecrawlSearch(prompt, 5), 8000, []);
  } catch (err) {
    console.warn(`[productImage] firecrawl search failed: ${(err as Error).message}`);
  }

  const candidate = results.find((r) => isGoodCandidate(r.url));
  if (!candidate) return null;

  try {
    return await withTimeout(firecrawlOgImage(candidate.url), 9000, null);
  } catch (err) {
    console.warn(`[productImage] firecrawl og:image failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fire-and-forget: looks up a product photo and persists it if the product
 * row doesn't have one yet. `products.imageUrl` was otherwise always NULL -
 * nothing ever called updateProductImage - so every /me/scans and /me/saved
 * row rendered with no photo. Never awaited by callers (that would add
 * search+scrape latency to the user-facing response); errors are swallowed
 * since a missing image is never worth failing the request over.
 */
export function backfillProductImageIfMissing(
  productId: string,
  currentImageUrl: string | null | undefined,
  product: ProductIdentity
): void {
  if (currentImageUrl) return;
  findProductImage(product)
    .then((url) => {
      if (url) return updateProductImage(productId, url);
    })
    .catch((err) => console.warn(`[productImage] backfill failed for ${productId}: ${err.message}`));
}
