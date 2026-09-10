import { runWorkload } from "../ai/gateway.js";
import type { LLMMessage, ToolSpec } from "../ai/types.js";
import { ProductIdentitySchema, requireProductIdentity, type ProductIdentity } from "../schema.js";

const STRONG_SIGNAL_CONFIDENCE_FLOOR = 0.7;

const PRODUCT_TOOL: ToolSpec = {
  name: "report_product",
  description: "Identify one specific commercial product so it can be researched for a buying decision.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Full, canonical product name (brand + model + key variant)" },
      brand: { type: ["string", "null"] },
      category: { type: "string", description: "e.g. smartphone, wireless earbuds, air fryer" },
      model: { type: ["string", "null"] },
      confidence: {
        type: "number",
        description: "0-1. >=0.7 when the input clearly points to one product; <0.45 when it is vague or names a whole category.",
      },
      searchTerm: { type: "string", description: "Best web search query for this exact product" },
    },
    required: ["name", "category", "confidence", "searchTerm"],
  },
};

function normalizeProductIdentity(raw: unknown): unknown {
  const o = { brand: null, model: null, ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const search = typeof o.searchTerm === "string" ? o.searchTerm.trim() : "";
  if (!name && search) o.name = search;
  if (!search && name) o.searchTerm = name;
  if (typeof o.category !== "string" || !o.category.trim()) o.category = "general";
  return o;
}

async function identify(workload: "identify_url" | "identify_text", prompt: string, retryHint?: (d: ProductIdentity) => string | null) {
  const messages: LLMMessage[] = [{ role: "user", content: prompt }];
  const result = await runWorkload<ProductIdentity>({
    workload,
    schema: ProductIdentitySchema,
    tool: PRODUCT_TOOL,
    messages,
    maxTokens: 512,
    maxAttempts: 3,
    normalize: normalizeProductIdentity,
    retryHint: (data) =>
      !data.name?.trim() ? "Product name was empty. Call report_product again with a non-empty name." : retryHint?.(data) ?? null,
  });
  return requireProductIdentity(result.data);
}

/** Product page the user shared → product identity. */
export async function callToolIdentifyFromText(ctx: {
  url: string;
  title: string | null;
  brand: string | null;
  markdownSnippet: string | null;
  description: string | null;
  gtin: string | null;
}): Promise<ProductIdentity> {
  const prompt = [
    `URL: ${ctx.url}`,
    ctx.title ? `Title: ${ctx.title}` : null,
    ctx.brand ? `Brand: ${ctx.brand}` : null,
    ctx.gtin ? `GTIN: ${ctx.gtin}` : null,
    ctx.description ? `Description: ${ctx.description.slice(0, 500)}` : null,
    ctx.markdownSnippet ? `Page excerpt:\n${ctx.markdownSnippet.slice(0, 2500)}` : null,
    "Identify the product on this page.",
    "A title together with a GTIN/SKU or brand is strong evidence - reflect that with confidence >=0.7.",
  ]
    .filter(Boolean)
    .join("\n");

  return identify("identify_url", prompt, (data) => {
    if (data.confidence >= STRONG_SIGNAL_CONFIDENCE_FLOOR || (!ctx.gtin && !ctx.brand)) return null;
    const evidence = [ctx.gtin ? `a GTIN (${ctx.gtin})` : null, ctx.brand ? `a brand (${ctx.brand})` : null]
      .filter(Boolean)
      .join(" and ");
    return `You reported "${data.name}" with confidence ${data.confidence.toFixed(2)}, but the page also has ${evidence}. Reconsider whether that raises your confidence above 0.7.`;
  });
}

/** What the user typed ("sony xm5", "pixel 9 pro 256") → canonical product identity. */
export async function callToolIdentifyFromQuery(query: string): Promise<ProductIdentity> {
  const prompt = [
    `A shopper typed: "${query.slice(0, 200)}"`,
    "Work out the single product they most likely mean and return its full canonical name, brand, model and category.",
    "Expand shorthand (e.g. 'xm5' -> 'Sony WH-1000XM5'). Keep variants the shopper stated (storage, size, colour).",
    "If the query names a whole category ('best earbuds'), return the category as the name with confidence below 0.45.",
    "Never invent specifications the shopper didn't mention.",
  ].join("\n");
  return identify("identify_text", prompt);
}

/** OCR text from a screenshot or product photo → the product it shows. */
export async function callToolIdentifyFromScreenshot(ocrText: string): Promise<ProductIdentity> {
  const prompt = [
    "This is text read (OCR) from a phone screenshot or a photo of a product. It may include app chrome, prices, reviews and ads.",
    "Identify the ONE main product the person is looking at (usually the largest title / product name).",
    "Ignore recommendations, sponsored items and navigation text.",
    "If the text does not clearly show a single product, return your best guess with confidence below 0.45.",
    "",
    ocrText.slice(0, 3500),
  ].join("\n");
  return identify("identify_text", prompt);
}
