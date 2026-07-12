import type { IdentifyResult, ProductIdentity, RejectReason } from "../schema.js";
import { isAllowedMarketplaceUrl } from "../marketplaces/registry.js";

export const MIN_IDENTIFY_CONFIDENCE = 0.45;

export class ValidationError extends Error {
  status: number;
  code: string;
  rejectReason?: RejectReason | "low_confidence" | "invalid_url" | "not_allowlisted";

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      rejectReason?: ValidationError["rejectReason"];
    } = {}
  ) {
    super(message);
    this.name = "ValidationError";
    this.status = opts.status ?? 400;
    this.code = opts.code ?? "validation_failed";
    this.rejectReason = opts.rejectReason;
  }
}

/**
 * Gate after vision identify. Rejects non-products / low confidence before
 * any research spend. Returns clean ProductIdentity on success.
 */
export function validateProductImage(result: IdentifyResult): ProductIdentity {
  if (!result.isProduct) {
    throw new ValidationError("Image is not a shoppable product", {
      rejectReason: result.rejectReason ?? "not_a_product",
      code: "not_a_product",
    });
  }
  if (result.confidence < MIN_IDENTIFY_CONFIDENCE) {
    throw new ValidationError("Product identification confidence too low", {
      rejectReason: "low_confidence",
      code: "low_confidence",
    });
  }
  return {
    name: result.name,
    brand: result.brand,
    category: result.category,
    model: result.model,
    confidence: result.confidence,
    searchTerm: result.searchTerm,
  };
}

/** Pure URL allowlist check - no network. */
export function validateProductUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError("Invalid URL", {
      rejectReason: "invalid_url",
      code: "invalid_url",
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("URL must be http(s)", {
      rejectReason: "invalid_url",
      code: "invalid_url",
    });
  }
  if (!isAllowedMarketplaceUrl(url.toString())) {
    throw new ValidationError("URL is not from a supported marketplace", {
      rejectReason: "not_allowlisted",
      code: "not_allowlisted",
    });
  }
  return url.toString();
}
