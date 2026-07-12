import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import {
  ConsensusReportSchema,
  ProductIdentitySchema,
  type ConsensusReport,
  type ProductIdentity,
} from "./schema.js";
import type { ScrapedPage } from "./anakin.js";
import { coerceToSchema } from "./coerce.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

type Base64Media = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function parseImage(input: string): { media: Base64Media; data: string } {
  const match = input.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
  if (match) {
    return { media: match[1] as Base64Media, data: match[2] };
  }
  return { media: "image/jpeg", data: input };
}

function extractToolInput(msg: Anthropic.Message): unknown {
  if (msg.stop_reason === "max_tokens") {
    throw new Error(
      "Claude response truncated by max_tokens before finishing the tool call - increase max_tokens or shrink the input corpus"
    );
  }
  for (const block of msg.content) {
    if (block.type === "tool_use") return block.input;
  }
  throw new Error("Claude returned no tool_use block");
}

export async function identifyProduct(imageBase64: string): Promise<ProductIdentity> {
  const { media, data } = parseImage(imageBase64);
  const msg = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 512,
    tools: [
      {
        name: "report_product",
        description: "Report the single most prominent commercial product in the image.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Specific product name" },
            brand: { type: ["string", "null"] },
            category: { type: "string", description: "e.g. smartphone, running shoe, book" },
            model: { type: ["string", "null"] },
            confidence: { type: "number", description: "0-1 identification confidence" },
            searchTerm: {
              type: "string",
              description: "Best query string to research this product online",
            },
          },
          required: ["name", "category", "confidence", "searchTerm"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "report_product" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: media, data },
          },
          {
            type: "text",
            text: "Identify the main product in this photo so it can be researched for a buying decision.",
          },
        ],
      },
    ],
  });
  const raw = extractToolInput(msg) as Record<string, unknown>;
  const coerced = coerceToSchema(ProductIdentitySchema, {
    brand: null,
    model: null,
    ...raw,
  });
  return ProductIdentitySchema.parse(coerced);
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "consensus_report",
  description: "Produce the internet-consensus buying report for the product.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["buy", "wait", "avoid", "mixed"] },
      verdictLine: { type: "string" },
      score: {
        type: "integer",
        description: "Overall buy confidence, an integer 0-100 (100 = perfect buy). Not out of 10 or 5.",
      },
      consensus: { type: "string" },
      pros: {
        type: "array",
        items: { type: "string" },
        description: "Always a JSON array of strings, even if there is only one item.",
      },
      complaints: {
        type: "array",
        items: { type: "string" },
        description: "Always a JSON array of strings, even if there is only one item.",
      },
      longTermIssues: {
        type: "array",
        items: { type: "string" },
        description: "Always a JSON array of strings, even if there is only one item.",
      },
      commonFailures: {
        type: "array",
        items: { type: "string" },
        description: "Always a JSON array of strings, even if there is only one item.",
      },
      fakeReviewSignal: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["low", "medium", "high", "unknown"] },
          note: { type: "string" },
        },
        required: ["level", "note"],
      },
      priceAnalysis: {
        type: "object",
        properties: {
          summary: { type: "string" },
          trend: { type: "string", enum: ["rising", "falling", "stable", "unknown"] },
          shouldWaitForSale: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["summary", "trend", "shouldWaitForSale", "reason"],
      },
      alternatives: {
        type: "array",
        description: "Always a JSON array of objects, even if there is only one alternative.",
        items: {
          type: "object",
          properties: { name: { type: "string" }, why: { type: "string" } },
          required: ["name", "why"],
        },
      },
      buyingAdvice: { type: "string" },
      sources: {
        type: "array",
        description: "Always a JSON array of objects, one per source actually used.",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            type: { type: "string" },
          },
          required: ["title", "url", "type"],
        },
      },
    },
    required: [
      "verdict",
      "verdictLine",
      "score",
      "consensus",
      "pros",
      "complaints",
      "longTermIssues",
      "commonFailures",
      "fakeReviewSignal",
      "priceAnalysis",
      "alternatives",
      "buyingAdvice",
      "sources",
    ],
  },
};

export async function synthesizeReport(
  product: ProductIdentity,
  pages: ScrapedPage[]
): Promise<ConsensusReport> {
  const corpus = pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url} ---\n${p.markdown.slice(0, 6000)}`)
    .join("\n\n")
    .slice(0, 90000);

  const msg = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "consensus_report" },
    system:
      "You are a purchase-decision analyst. From scraped web sources (Reddit, retailers, YouTube, blogs, forums, news), extract the INTERNET CONSENSUS, not a list of reviews. Identify recurring themes, filter marketing noise and suspicious reviews, and be honest about uncertainty. Base every claim on the provided sources; do not invent facts. Cite the sources you actually used. Keep each list item to one concise sentence and be economical with tokens so the full report fits the output budget - always finish every required field, including verdict, verdictLine and sources.",
    messages: [
      {
        role: "user",
        content: `Product: ${product.name} (${product.brand ?? "unknown brand"}, ${product.category}).\n\nProduce the consensus buying report from these sources:\n\n${corpus}`,
      },
    ],
  });

  const raw = extractToolInput(msg);
  const coerced = coerceToSchema(ConsensusReportSchema, raw);
  return ConsensusReportSchema.parse(coerced);
}
