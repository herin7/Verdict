import { runWorkload } from "../ai/gateway.js";
import type { LLMMessage, ToolSpec } from "../ai/types.js";
import { ProductIdentitySchema, type ProductIdentity } from "../schema.js";

/**
 * Below this, a schema-valid confidence is accepted as-is even with strong
 * evidence present - retrying is only worth it when the model landed just
 * under the "this is clearly a PDP" bar MIN_IDENTIFY_CONFIDENCE (0.45) relies
 * on for the caller-facing accept/reject decision.
 */
const STRONG_SIGNAL_CONFIDENCE_FLOOR = 0.7;

const PRODUCT_TOOL: ToolSpec = {
  name: "report_product",
  description: "Identify the single shoppable product the user is viewing on a marketplace PDP.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Full product name / title" },
      brand: { type: ["string", "null"] },
      category: { type: "string" },
      model: { type: ["string", "null"] },
      confidence: {
        type: "number",
        description:
          "0-1. Use >=0.7 when a clear product title is present, especially alongside an ASIN, a Buy Now/Add to Cart button, a price next to the title, or a category breadcrumb. Use <0.45 only for home/search/multi-product feeds.",
      },
      searchTerm: {
        type: "string",
        description: "Best web search query for this exact product (brand + model + key attrs)",
      },
    },
    required: ["name", "category", "confidence", "searchTerm"],
  },
};

function normalizeProductIdentity(raw: unknown): unknown {
  return { brand: null, model: null, ...(raw as Record<string, unknown>) };
}

/**
 * Screen-text identify's retryHint: a schema-valid result is still spent one
 * more attempt on if the model was under-confident despite concrete PDP
 * evidence (ASIN / buy box / breadcrumb / price) already detected by
 * screenText.ts. Exported so the decision logic is unit-testable without
 * a real LLM call.
 */
export function buildScreenTextRetryHint(ctx: {
  asin?: string | null;
  priceHint?: string | null;
  hasBuyBox?: boolean;
  hasBreadcrumb?: boolean;
}): (data: ProductIdentity) => string | null {
  return (data: ProductIdentity): string | null => {
    if (data.confidence >= STRONG_SIGNAL_CONFIDENCE_FLOOR) return null;
    if (!data.name || !data.name.trim()) return null;

    const evidence = [
      ctx.asin ? `an ASIN (${ctx.asin})` : null,
      ctx.hasBuyBox ? "an Add to Cart / Buy Now button" : null,
      ctx.priceHint ? `a price (${ctx.priceHint}) next to the title` : null,
      ctx.hasBreadcrumb ? "a category breadcrumb trail" : null,
    ].filter((x): x is string => Boolean(x));

    if (evidence.length === 0) return null;

    return [
      `You reported "${data.name}" with confidence ${data.confidence.toFixed(2)}, but this screen has strong product-detail-page evidence: ${evidence.join(", ")}.`,
      "Look again at the text for the product title, brand, and these signals together, then call report_product again with a confidence that reflects how certain this evidence makes you (>=0.7 if the title and evidence clearly match one product).",
    ].join(" ");
  };
}

/** Lightweight text-only identify when URL metadata is incomplete. */
export async function callToolIdentifyFromText(ctx: {
  url: string;
  title: string | null;
  brand: string | null;
  markdownSnippet: string | null;
  description: string | null;
  gtin: string | null;
}): Promise<ProductIdentity> {
  const tool: ToolSpec = {
    name: "report_product",
    description: "Identify the product from marketplace page signals.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        brand: { type: ["string", "null"] },
        category: { type: "string" },
        model: { type: ["string", "null"] },
        confidence: {
          type: "number",
          description:
            "0-1. Use >=0.7 when the title is clear and backed by a GTIN/SKU or a brand match. Use <0.45 if the page excerpt doesn't clearly describe one product.",
        },
        searchTerm: { type: "string" },
      },
      required: ["name", "category", "confidence", "searchTerm"],
    },
  };

  const prompt = [
    `URL: ${ctx.url}`,
    ctx.title ? `Title: ${ctx.title}` : null,
    ctx.brand ? `Brand: ${ctx.brand}` : null,
    ctx.gtin ? `GTIN: ${ctx.gtin}` : null,
    ctx.description ? `Description: ${ctx.description.slice(0, 500)}` : null,
    ctx.markdownSnippet ? `Page excerpt:\n${ctx.markdownSnippet.slice(0, 2500)}` : null,
    "Identify the commercial product so it can be researched for a buying decision.",
    "A title present together with a GTIN/SKU or brand is strong evidence of a real product page - reflect that with confidence >=0.7.",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: LLMMessage[] = [{ role: "user", content: prompt }];

  const retryHint = (data: ProductIdentity): string | null => {
    if (data.confidence >= STRONG_SIGNAL_CONFIDENCE_FLOOR) return null;
    if (!data.name || !data.name.trim()) return null;
    if (!ctx.gtin && !ctx.brand) return null;
    const evidence = [ctx.gtin ? `a GTIN (${ctx.gtin})` : null, ctx.brand ? `a brand (${ctx.brand})` : null]
      .filter((x): x is string => Boolean(x))
      .join(" and ");
    return `You reported "${data.name}" with confidence ${data.confidence.toFixed(2)}, but the page also has ${evidence}. Reconsider whether that raises your confidence above 0.7.`;
  };

  const result = await runWorkload<ProductIdentity>({
    workload: "identify_url",
    schema: ProductIdentitySchema,
    tool,
    messages,
    maxTokens: 512,
    maxAttempts: 3,
    normalize: normalizeProductIdentity,
    retryHint,
  });
  return result.data;
}

/** Identify a product from raw accessibility-extracted screen text (no URL). */
export async function callToolIdentifyFromScreenText(ctx: {
  text: string;
  packageName: string;
  asin?: string | null;
  priceHint?: string | null;
  hasBuyBox?: boolean;
  hasBreadcrumb?: boolean;
}): Promise<ProductIdentity> {
  const appHint = ctx.packageName.includes("amazon")
    ? "Amazon"
    : ctx.packageName.includes("flipkart")
      ? "Flipkart"
      : ctx.packageName.includes("myntra")
        ? "Myntra"
        : ctx.packageName;

  const signals = [
    ctx.asin ? `Detected ASIN: ${ctx.asin}` : null,
    ctx.priceHint ? `Detected price fragment: ${ctx.priceHint}` : null,
    ctx.hasBuyBox ? "Detected an Add to Cart / Buy Now button on screen" : null,
    ctx.hasBreadcrumb ? "Detected a category breadcrumb trail on screen" : null,
  ].filter(Boolean);

  const prompt = [
    `User is inside the ${appHint} shopping app on what is likely a product detail page.`,
    `Package: ${ctx.packageName}`,
    ...signals,
    `Cleaned on-screen text (nav chrome already removed; longest lines are usually the title):`,
    ctx.text.slice(0, 3000),
    "",
    "Rules:",
    "- Pick the ONE primary product being viewed (not recommendations).",
    "- name = the product title as sold; searchTerm = brand + model/variant for web research.",
    "- Strong PDP evidence - an ASIN, a Buy Now/Add to Cart button, a price next to a title, or a category breadcrumb - combined with a clear title means confidence MUST be >= 0.7.",
    "- Only set confidence < 0.45 for home feeds, category grids, or search result lists with many products and none of that evidence.",
    "- Never invent a product that is not supported by the text.",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: LLMMessage[] = [{ role: "user", content: prompt }];

  const result = await runWorkload<ProductIdentity>({
    workload: "identify_screen",
    schema: ProductIdentitySchema,
    tool: PRODUCT_TOOL,
    messages,
    maxTokens: 512,
    maxAttempts: 3,
    normalize: normalizeProductIdentity,
    retryHint: buildScreenTextRetryHint(ctx),
  });
  return result.data;
}
