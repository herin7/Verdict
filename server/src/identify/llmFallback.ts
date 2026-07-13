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
}): Promise<ProductIdentity> {
  const tool: Anthropic.Tool = {
    name: "report_product",
    description: "Identify the shoppable product from on-screen text extracted from a shopping app.",
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
    `Source app package: ${ctx.packageName}`,
    `On-screen text (accessibility extraction, may be noisy/out of order):`,
    ctx.text.slice(0, 3000),
    "Identify the single commercial product being viewed so it can be researched for a buying decision.",
    "If no clear product is present, set confidence below 0.4.",
  ].join("\n");

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
