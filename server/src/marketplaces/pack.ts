export type NormalizedPack = {
  amount: number;
  unit: "g" | "ml";
  count: number;
};

const UNIT = "(kg|g|gm|gms|l|ltr|litre|litres|ml)";
const VALUE = "(\\d+(?:\\.\\d+)?)";

function normalize(value: string, unit: string, count: string | undefined): NormalizedPack {
  const n = Number(value);
  const u = unit.toLowerCase();
  const base =
    u === "kg"
      ? { amount: n * 1000, unit: "g" as const }
      : u === "l" || u === "ltr" || u === "litre" || u === "litres"
        ? { amount: n * 1000, unit: "ml" as const }
        : { amount: n, unit: u === "ml" ? ("ml" as const) : ("g" as const) };
  return { ...base, count: count ? Number(count) : 1 };
}

/** First explicit mass/volume pack, preserving multipack count. */
export function extractPack(text: string | null | undefined): NormalizedPack | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(/,/g, " ");
  const countFirst = new RegExp(`(?:pack\\s+of\\s+)?(\\d+)\\s*[x×]\\s*${VALUE}\\s*${UNIT}\\b`, "i").exec(s);
  if (countFirst) return normalize(countFirst[2]!, countFirst[3]!, countFirst[1]);
  const amountFirst = new RegExp(`${VALUE}\\s*${UNIT}\\s*(?:[x×]|pack\\s+of)\\s*(\\d+)\\b`, "i").exec(s);
  if (amountFirst) return normalize(amountFirst[1]!, amountFirst[2]!, amountFirst[3]);
  const packOf = new RegExp(`pack\\s+of\\s+(\\d+)\\D{0,16}${VALUE}\\s*${UNIT}\\b`, "i").exec(s);
  if (packOf) return normalize(packOf[2]!, packOf[3]!, packOf[1]);
  const single = new RegExp(`${VALUE}\\s*${UNIT}\\b`, "i").exec(s);
  return single ? normalize(single[1]!, single[2]!, undefined) : null;
}

export function packMatch(
  expectedText: string | null | undefined,
  candidateText: string | null | undefined
): "exact" | "mismatch" | "unknown" {
  const expected = extractPack(expectedText);
  const candidate = extractPack(candidateText);
  if (!expected || !candidate) return "unknown";
  return expected.unit === candidate.unit &&
    expected.amount === candidate.amount &&
    expected.count === candidate.count
    ? "exact"
    : "mismatch";
}
