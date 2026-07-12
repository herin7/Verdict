import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { config } from "./config.js";
import {
  ConsensusReportSchema,
  ProductIdentitySchema,
  LongTermScoreSchema,
  VersionHistorySchema,
  ScamDetectorSchema,
  BestInCategorySchema,
  type ConsensusReport,
  type ProductIdentity,
  type LongTermScore,
  type VersionHistory,
  type ScamDetector,
  type BestInCategory,
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

/**
 * Forces Claude to call `tool` and validates the result against `schema`. Claude
 * occasionally emits a tool call missing required fields (non-contiguously, not
 * just truncation) or with the wrong shape - rather than failing the whole
 * request, this feeds the exact validation errors back to Claude as a rejected
 * tool_result and asks it to re-call the tool with everything filled in.
 */
async function callToolWithValidation<T>(
  schema: z.ZodType<T>,
  tool: Anthropic.Tool,
  initialMessages: Anthropic.MessageParam[],
  opts: {
    maxTokens: number;
    system?: string;
    maxAttempts?: number;
    /** Applied to the raw tool input before coercion/validation, e.g. to fill in optional-field defaults. */
    normalize?: (raw: unknown) => unknown;
  }
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let messages: Anthropic.MessageParam[] = [...initialMessages];
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const msg = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: opts.maxTokens,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      system: opts.system,
      messages,
    });

    if (msg.stop_reason === "max_tokens") {
      lastError = "response was cut off before finishing (max_tokens)";
      messages = [
        ...messages,
        { role: "assistant", content: msg.content },
        {
          role: "user",
          content:
            "Your previous response was cut off before it finished. Call the tool again, but keep every field noticeably shorter so the entire call fits within the token budget.",
        },
      ];
      continue;
    }

    const toolBlock = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolBlock) {
      lastError = "no tool_use block in response";
      messages = [
        ...messages,
        { role: "assistant", content: msg.content },
        { role: "user", content: `You must call the ${tool.name} tool with its full arguments.` },
      ];
      continue;
    }

    const normalized = opts.normalize ? opts.normalize(toolBlock.input) : toolBlock.input;
    const coerced = coerceToSchema(schema, normalized);
    const result = schema.safeParse(coerced);
    if (result.success) return result.data;

    lastError = result.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");

    if (attempt === maxAttempts) break;

    console.warn(`[claude] ${tool.name} attempt ${attempt} failed validation, retrying:\n${lastError}`);

    messages = [
      ...messages,
      { role: "assistant", content: msg.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolBlock.id,
            is_error: true,
            content: `Your call to ${tool.name} was rejected - these fields were missing or the wrong type:\n${lastError}\n\nCall ${tool.name} again with a complete, valid set of arguments. Do not omit any required field.`,
          },
        ],
      },
    ];
  }

  throw new Error(
    `Claude failed to produce a valid ${tool.name} call after ${maxAttempts} attempts:\n${lastError}`
  );
}

export async function identifyProduct(imageBase64: string): Promise<ProductIdentity> {
  const { media, data } = parseImage(imageBase64);
  const tool: Anthropic.Tool = {
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
  };

  return callToolWithValidation(
    ProductIdentitySchema,
    tool,
    [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: media, data } },
          {
            type: "text",
            text: "Identify the main product in this photo so it can be researched for a buying decision.",
          },
        ],
      },
    ],
    {
      maxTokens: 512,
      maxAttempts: 2,
      normalize: (raw) => ({ brand: null, model: null, ...(raw as Record<string, unknown>) }),
    }
  );
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
        description: "Required object - never omit this field.",
        properties: {
          level: { type: "string", enum: ["low", "medium", "high", "unknown"] },
          note: { type: "string" },
        },
        required: ["level", "note"],
      },
      priceAnalysis: {
        type: "object",
        description: "Required object - never omit this field.",
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
      buyingAdvice: { type: "string", description: "Required - never omit this field." },
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

  return callToolWithValidation(
    ConsensusReportSchema,
    REPORT_TOOL,
    [
      {
        role: "user",
        content: `Product: ${product.name} (${product.brand ?? "unknown brand"}, ${product.category}).\n\nProduce the consensus buying report from these sources:\n\n${corpus}`,
      },
    ],
    {
      maxTokens: 4096,
      maxAttempts: 3,
      system:
        "You are a purchase-decision analyst. From scraped web sources (Reddit, retailers, YouTube, blogs, forums, news), extract the INTERNET CONSENSUS, not a list of reviews. Identify recurring themes, filter marketing noise and suspicious reviews, and be honest about uncertainty. Base every claim on the provided sources; do not invent facts. Cite the sources you actually used. Keep each list item to one concise sentence and be economical with tokens. Every field in the tool schema is required - never omit fakeReviewSignal, priceAnalysis, or buyingAdvice.",
    }
  );
}

function buildCorpus(pages: ScrapedPage[], perPageChars = 5000, totalChars = 40000): string {
  return pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url} ---\n${p.markdown.slice(0, perPageChars)}`)
    .join("\n\n")
    .slice(0, totalChars);
}

function productLine(product: ProductIdentity): string {
  return `Product: ${product.name} (${product.brand ?? "unknown brand"}, ${product.category}).`;
}

const LONG_TERM_TOOL: Anthropic.Tool = {
  name: "long_term_score",
  description: "Report how owner sentiment shifts over weeks/months/years of real-world use.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", description: "0-100 long-term satisfaction score, not out of 10 or 5." },
      trend: { type: "string", enum: ["improving", "declining", "stable", "mixed"] },
      timeline: {
        type: "array",
        description: "2-4 entries, one per ownership period actually discussed in the sources.",
        items: {
          type: "object",
          properties: {
            period: { type: "string", description: "e.g. '1 month', '6 months', '1-2 years'" },
            sentiment: { type: "string", enum: ["positive", "negative", "mixed"] },
            note: { type: "string" },
          },
          required: ["period", "sentiment", "note"],
        },
      },
      summary: { type: "string" },
    },
    required: ["score", "trend", "timeline", "summary"],
  },
};

export async function synthesizeLongTermScore(
  product: ProductIdentity,
  pages: ScrapedPage[]
): Promise<LongTermScore> {
  return callToolWithValidation(
    LongTermScoreSchema,
    LONG_TERM_TOOL,
    [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, report how opinions change the longer people own it:\n\n${buildCorpus(pages)}`,
      },
    ],
    {
      maxTokens: 1024,
      maxAttempts: 2,
      system:
        "You analyze long-term ownership sentiment. Focus only on how satisfaction changes over time (early impressions vs. months/years later) - not a general review. If sources don't discuss long-term use, say so honestly in the summary and keep the timeline short. Every field is required.",
    }
  );
}

const VERSION_HISTORY_TOOL: Anthropic.Tool = {
  name: "version_history",
  description: "Compare this product to its previous version/generation and whether upgrading is worth it.",
  input_schema: {
    type: "object",
    properties: {
      hasPreviousVersion: { type: "boolean" },
      previousVersion: { type: ["string", "null"], description: "Name of the prior version, or null if none/unknown." },
      changes: {
        type: "array",
        description: "Always a JSON array, even if empty when there is no previous version.",
        items: {
          type: "object",
          properties: {
            aspect: { type: "string", description: "e.g. battery life, build quality, price" },
            verdict: { type: "string", enum: ["better", "worse", "same"] },
            note: { type: "string" },
          },
          required: ["aspect", "verdict", "note"],
        },
      },
      worthUpgrading: { type: "string", enum: ["yes", "no", "not_applicable"] },
      summary: { type: "string" },
    },
    required: ["hasPreviousVersion", "previousVersion", "changes", "worthUpgrading", "summary"],
  },
};

export async function synthesizeVersionHistory(
  product: ProductIdentity,
  pages: ScrapedPage[]
): Promise<VersionHistory> {
  return callToolWithValidation(
    VersionHistorySchema,
    VERSION_HISTORY_TOOL,
    [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, compare it against its previous version/generation:\n\n${buildCorpus(pages)}`,
      },
    ],
    {
      maxTokens: 1024,
      maxAttempts: 2,
      normalize: (raw) => ({ changes: [], previousVersion: null, ...(raw as Record<string, unknown>) }),
      system:
        "You track product version history. If the sources don't clearly identify a previous version, set hasPreviousVersion to false, worthUpgrading to 'not_applicable', and say so plainly in the summary rather than guessing. Never invent a comparison that isn't grounded in the sources. Every field is required.",
    }
  );
}

const SCAM_DETECTOR_TOOL: Anthropic.Tool = {
  name: "scam_detector",
  description: "Assess fake-review, counterfeit, and suspicious-seller risk for this product.",
  input_schema: {
    type: "object",
    properties: {
      riskLevel: { type: "string", enum: ["low", "medium", "high"], description: "Overall combined risk." },
      fakeReviewEstimatePercent: {
        type: ["number", "null"],
        description: "0-100 rough estimate of reviews suspected fake, or null if there is no basis to estimate.",
      },
      counterfeitRisk: { type: "string", enum: ["low", "medium", "high"] },
      redFlags: {
        type: "array",
        items: { type: "string" },
        description: "Always a JSON array of short strings, even if there is only one flag or none.",
      },
      summary: { type: "string" },
    },
    required: ["riskLevel", "fakeReviewEstimatePercent", "counterfeitRisk", "redFlags", "summary"],
  },
};

export async function synthesizeScamDetector(
  product: ProductIdentity,
  pages: ScrapedPage[]
): Promise<ScamDetector> {
  return callToolWithValidation(
    ScamDetectorSchema,
    SCAM_DETECTOR_TOOL,
    [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, assess fake review, counterfeit, and suspicious-seller risk:\n\n${buildCorpus(pages)}`,
      },
    ],
    {
      maxTokens: 900,
      maxAttempts: 2,
      normalize: (raw) => ({ redFlags: [], fakeReviewEstimatePercent: null, ...(raw as Record<string, unknown>) }),
      system:
        "You are a fraud/authenticity analyst for online purchases. Be evidence-based: if sources show no scam/counterfeit signal, riskLevel should be 'low' and redFlags can be empty - do not manufacture risk. Never invent a percentage; use null when there is no basis. Every field is required.",
    }
  );
}

const BEST_IN_CATEGORY_TOOL: Anthropic.Tool = {
  name: "best_in_category",
  description: "Rank this product against its direct competitors in the same category.",
  input_schema: {
    type: "object",
    properties: {
      rank: { type: "string", description: "e.g. 'Top 3 of ~8 compared', 'Mid-pack', '#1 in its price tier'." },
      categoryScore: { type: "integer", description: "0-100 how it stacks up in-category, not out of 10 or 5." },
      competitors: {
        type: "array",
        description: "Always a JSON array of objects, even if there is only one competitor.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            comparison: { type: "string", enum: ["better", "worse", "similar"] },
            note: { type: "string" },
          },
          required: ["name", "comparison", "note"],
        },
      },
      summary: { type: "string" },
    },
    required: ["rank", "categoryScore", "competitors", "summary"],
  },
};

export async function synthesizeBestInCategory(
  product: ProductIdentity,
  pages: ScrapedPage[]
): Promise<BestInCategory> {
  return callToolWithValidation(
    BestInCategorySchema,
    BEST_IN_CATEGORY_TOOL,
    [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, rank it against direct competitors in the ${product.category} category:\n\n${buildCorpus(pages)}`,
      },
    ],
    {
      maxTokens: 1024,
      maxAttempts: 2,
      normalize: (raw) => ({ competitors: [], ...(raw as Record<string, unknown>) }),
      system:
        "You rank products against category competitors using only what the sources actually compare it to. Do not invent competitor names that aren't grounded in the sources. Every field is required.",
    }
  );
}
