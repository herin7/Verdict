import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { ProductIdentitySchema, type ProductIdentity } from "../schema.js";
import { coerceToSchema } from "../coerce.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/** Lightweight text-only identify when URL metadata is incomplete. */
export async function callToolIdentifyFromText(ctx: {
  url: string;
  title: string | null;
  brand: string | null;
  markdownSnippet: string | null;
  description: string | null;
  gtin: string | null;
}): Promise<ProductIdentity> {
  const tool: Anthropic.Tool = {
    name: "report_product",
    description: "Identify the product from marketplace page signals.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        brand: { type: ["string", "null"] },
        category: { type: "string" },
        model: { type: ["string", "null"] },
        confidence: { type: "number" },
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
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 512,
    tools: [tool],
    tool_choice: { type: "tool", name: "report_product", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });

  const toolBlock = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolBlock) throw new Error("LLM identify-from-url returned no tool call");

  const normalized = {
    brand: null,
    model: null,
    ...(toolBlock.input as Record<string, unknown>),
  };
  const coerced = coerceToSchema(ProductIdentitySchema, normalized);
  return ProductIdentitySchema.parse(coerced);
}

/** Identify a product from raw accessibility-extracted screen text (no URL). */
export async function callToolIdentifyFromScreenText(ctx: {
  text: string;
  packageName: string;
  asin?: string | null;
  priceHint?: string | null;
}): Promise<ProductIdentity> {
  const tool: Anthropic.Tool = {
    name: "report_product",
    description:
      "Identify the single shoppable product the user is viewing on a marketplace PDP.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full product name / title" },
        brand: { type: ["string", "null"] },
        category: { type: "string" },
        model: { type: ["string", "null"] },
        confidence: {
          type: "number",
          description:
            "0-1. Use >=0.7 when a clear product title is present. Use <0.45 only for home/search/multi-product feeds.",
        },
        searchTerm: {
          type: "string",
          description: "Best web search query for this exact product (brand + model + key attrs)",
        },
      },
      required: ["name", "category", "confidence", "searchTerm"],
    },
  };

  const appHint = ctx.packageName.includes("amazon")
    ? "Amazon"
    : ctx.packageName.includes("flipkart")
      ? "Flipkart"
      : ctx.packageName.includes("myntra")
        ? "Myntra"
        : ctx.packageName;

  const prompt = [
    `User is inside the ${appHint} shopping app on what is likely a product detail page.`,
    `Package: ${ctx.packageName}`,
    ctx.asin ? `Detected ASIN: ${ctx.asin}` : null,
    ctx.priceHint ? `Detected price fragment: ${ctx.priceHint}` : null,
    `Cleaned on-screen text (nav chrome already removed; longest lines are usually the title):`,
    ctx.text.slice(0, 3000),
    "",
    "Rules:",
    "- Pick the ONE primary product being viewed (not recommendations).",
    "- name = the product title as sold; searchTerm = brand + model/variant for web research.",
    "- If a clear product title exists (even with noisy extras), confidence MUST be >= 0.7.",
    "- Only set confidence < 0.45 for home feeds, category grids, or search result lists with many products.",
    "- Never invent a product that is not supported by the text.",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 512,
    tools: [tool],
    tool_choice: { type: "tool", name: "report_product", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });

  const toolBlock = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolBlock) throw new Error("LLM identify-from-screen-text returned no tool call");

  const normalized = {
    brand: null,
    model: null,
    ...(toolBlock.input as Record<string, unknown>),
  };
  const coerced = coerceToSchema(ProductIdentitySchema, normalized);
  return ProductIdentitySchema.parse(coerced);
}
