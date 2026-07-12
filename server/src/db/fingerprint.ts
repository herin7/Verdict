import { createHash } from "node:crypto";

/** Normalize brand|model|name into a stable cache key. */
export function productFingerprint(input: {
  name: string;
  brand?: string | null;
  model?: string | null;
  searchTerm?: string;
}): string {
  const parts = [input.brand, input.model, input.name]
    .map((p) => (p ?? "").toLowerCase().trim().replace(/\s+/g, " "))
    .filter(Boolean);

  const raw = parts.length > 0 ? parts.join("|") : (input.searchTerm ?? input.name).toLowerCase().trim();
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
