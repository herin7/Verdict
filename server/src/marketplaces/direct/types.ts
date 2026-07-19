import type { PriceSource } from "../normalize.js";

/** Raw offer from direct HTML/JSON parse — run through normalizeOffer. */
export type DirectOffer = {
  retailerId: "amazon_in" | "flipkart";
  retailer: string;
  url: string;
  title: string;
  priceRaw: string;
  currency: string;
  inStock: boolean | null;
  seller: string | null;
  priceContext: string;
  fieldPath: string;
  priceSource: PriceSource;
  /** ASIN / FSN / item id when known. */
  productId?: string | null;
};
