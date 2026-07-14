import { runWorkload } from "./ai/gateway.js";
import type { ImageMediaType, LLMMessage, ToolSpec } from "./ai/types.js";
import {
  ConsensusReportSchema,
  IdentifyResultSchema,
  LongTermScoreSchema,
  VersionHistorySchema,
  ScamDetectorSchema,
  BestInCategorySchema,
  type ConsensusReport,
  type ProductIdentity,
  type IdentifyResult,
  type LongTermScore,
  type VersionHistory,
  type ScamDetector,
  type BestInCategory,
} from "./schema.js";
import type { ScrapedPage } from "./anakin.js";

const STRONG_SIGNAL_CONFIDENCE_FLOOR = 0.7;

/**
 * Post-validation quality gate for identify_image: a schema-valid, isProduct=true
 * result with low confidence is worth one more careful look, since the model
 * often under-rates a genuine PDP screenshot when it hasn't explicitly reasoned
 * about the concrete evidence (ASIN, buy box, price+brand, breadcrumbs) in view.
 */
function identifyImageRetryHint(data: IdentifyResult): string | null {
  if (!data.isProduct) return null;
  if (data.confidence >= STRONG_SIGNAL_CONFIDENCE_FLOOR) return null;
  if (!data.name || !data.name.trim()) return null;
  return [
    `You reported "${data.name}" with confidence ${data.confidence.toFixed(2)}.`,
    "Before finalizing, look again for concrete product-detail-page evidence in the image: an ASIN or product code, a Buy Now / Add to Cart button, a price shown next to the title and brand, or a category breadcrumb trail.",
    "If that evidence is visible and clearly matches one product, raise confidence to reflect it (>=0.7). If you truly cannot find a clear product, keep confidence low.",
  ].join(" ");
}

function parseImage(input: string): { media: ImageMediaType; data: string } {
  const match = input.match(/^data:(image\/[a-zA-Z]+);base64,(.*)$/);
  if (match) {
    return { media: match[1] as ImageMediaType, data: match[2] };
  }
  return { media: "image/jpeg", data: input };
}

export async function identifyProduct(imageBase64: string): Promise<IdentifyResult> {
  const { media, data } = parseImage(imageBase64);
  const tool: ToolSpec = {
    name: "report_product",
    description:
      "Report the single most prominent commercial product in the image, or reject if it is not a shoppable product.",
    inputSchema: {
      type: "object",
      properties: {
        isProduct: {
          type: "boolean",
          description: "True only if the image clearly shows a shoppable commercial product",
        },
        rejectReason: {
          type: ["string", "null"],
          enum: [
            "nudity",
            "person",
            "vehicle",
            "animal",
            "landscape",
            "meme",
            "document",
            "screenshot",
            "not_a_product",
            "other",
            null,
          ],
          description: "Set when isProduct is false; null when isProduct is true",
        },
        name: { type: "string", description: "Specific product name, or empty if not a product" },
        brand: { type: ["string", "null"] },
        category: { type: "string", description: "e.g. smartphone, running shoe, book" },
        model: { type: ["string", "null"] },
        confidence: {
          type: "number",
          description:
            "0-1 identification confidence. Use >=0.7 when a clear product title/packaging is visible together with supporting evidence: an ASIN or product code, a Buy Now/Add to Cart button, a price shown with the title and brand, or a category breadcrumb (i.e. this looks like a marketplace product detail page). Use <0.4 only when the product cannot be clearly identified.",
        },
        searchTerm: {
          type: "string",
          description: "Best query string to research this product online",
        },
      },
      required: ["isProduct", "rejectReason", "name", "category", "confidence", "searchTerm"],
    },
  };

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: [
        { type: "image", mediaType: media, data },
        {
          type: "text",
          text: [
            "Identify the main shoppable product in this photo for a buying-decision research app.",
            "Reject (isProduct=false) if the image is nudity, a person without a clear product,",
            "a vehicle, animal, landscape, meme, document, non-shopping screenshot, or otherwise not a product.",
            "Only set isProduct=true for clear commercial products a shopper would buy.",
            "If this is a screenshot of a marketplace product detail page, treat a product title together with an ASIN/code, a Buy Now/Add to Cart button, a price shown with the brand, or a breadcrumb trail as strong evidence - reflect that with high confidence (>=0.7) rather than hedging.",
          ].join(" "),
        },
      ],
    },
  ];

  const result = await runWorkload<IdentifyResult>({
    workload: "identify_image",
    schema: IdentifyResultSchema,
    tool,
    messages,
    maxTokens: 512,
    maxAttempts: 3,
    normalize: (raw) => ({
      brand: null,
      model: null,
      rejectReason: null,
      isProduct: true,
      ...(raw as Record<string, unknown>),
    }),
    retryHint: identifyImageRetryHint,
  });
  return result.data;
}

const REPORT_TOOL: ToolSpec = {
  name: "consensus_report",
  description: "Produce the internet-consensus buying report for the product.",
  inputSchema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["buy", "wait", "avoid", "mixed"] },
      verdictLine: { type: "string", description: "One short punchy sentence, max ~16 words. No fluff." },
      score: {
        type: "integer",
        description: "Overall buy confidence, an integer 0-100 (100 = perfect buy). Not out of 10 or 5.",
      },
      consensus: {
        type: "string",
        description: "Max 2 short sentences summarizing what the internet collectively thinks. No filler.",
      },
      pros: {
        type: "array",
        items: { type: "string" },
        description:
          "Always a JSON array of strings, even if there is only one item. Max 4 items, each a short phrase (under 12 words), not a full paragraph.",
      },
      complaints: {
        type: "array",
        items: { type: "string" },
        description:
          "Always a JSON array of strings, even if there is only one item. Max 4 items, each a short phrase (under 12 words), not a full paragraph.",
      },
      longTermIssues: {
        type: "array",
        items: { type: "string" },
        description:
          "Always a JSON array of strings, even if there is only one item. Max 4 items, each one short sentence.",
      },
      commonFailures: {
        type: "array",
        items: { type: "string" },
        description:
          "Always a JSON array of strings, even if there is only one item. Max 4 items, each one short sentence.",
      },
      fakeReviewSignal: {
        type: "object",
        description: "Required object - never omit this field.",
        properties: {
          level: { type: "string", enum: ["low", "medium", "high", "unknown"] },
          note: { type: "string", description: "One short sentence, max ~20 words." },
        },
        required: ["level", "note"],
      },
      priceAnalysis: {
        type: "object",
        description: "Required object - never omit this field.",
        properties: {
          summary: { type: "string", description: "One short sentence, max ~16 words." },
          trend: { type: "string", enum: ["rising", "falling", "stable", "unknown"] },
          shouldWaitForSale: { type: "boolean" },
          reason: { type: "string", description: "One short sentence, max ~20 words." },
        },
        required: ["summary", "trend", "shouldWaitForSale", "reason"],
      },
      alternatives: {
        type: "array",
        description:
          "Always a JSON array of objects, even if there is only one alternative. Max 3 items; keep 'why' to one short phrase.",
        items: {
          type: "object",
          properties: { name: { type: "string" }, why: { type: "string" } },
          required: ["name", "why"],
        },
      },
      buyingAdvice: {
        type: "string",
        description: "Required - never omit. Max 2-3 short sentences, directly answering 'should I buy this'.",
      },
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

  const result = await runWorkload<ConsensusReport>({
    workload: "report",
    schema: ConsensusReportSchema,
    tool: REPORT_TOOL,
    messages: [
      {
        role: "user",
        content: `Product: ${product.name} (${product.brand ?? "unknown brand"}, ${product.category}).\n\nProduce the consensus buying report from these sources:\n\n${corpus}`,
      },
    ],
    maxTokens: 4096,
    maxAttempts: 3,
    system:
      "You are a purchase-decision analyst. From scraped web sources (Reddit, retailers, YouTube, blogs, forums, news), extract the INTERNET CONSENSUS, not a list of reviews. Identify recurring themes, filter marketing noise and suspicious reviews, and be honest about uncertainty. Base every claim on the provided sources; do not invent facts. Cite the sources you actually used. Be ruthlessly concise everywhere - short phrases over sentences, short sentences over paragraphs. This is read on a phone screen in under 20 seconds, so cut every word that isn't load-bearing. Every field in the tool schema is required - never omit fakeReviewSignal, priceAnalysis, or buyingAdvice.",
  });
  return result.data;
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

const LONG_TERM_TOOL: ToolSpec = {
  name: "long_term_score",
  description: "Report how owner sentiment shifts over weeks/months/years of real-world use.",
  inputSchema: {
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
  const result = await runWorkload<LongTermScore>({
    workload: "insight_long_term",
    schema: LongTermScoreSchema,
    tool: LONG_TERM_TOOL,
    messages: [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, report how opinions change the longer people own it:\n\n${buildCorpus(pages)}`,
      },
    ],
    maxTokens: 1024,
    maxAttempts: 2,
    system:
      "You analyze long-term ownership sentiment. Focus only on how satisfaction changes over time (early impressions vs. months/years later) - not a general review. If sources don't discuss long-term use, say so honestly in the summary and keep the timeline short. Every field is required.",
  });
  return result.data;
}

const VERSION_HISTORY_TOOL: ToolSpec = {
  name: "version_history",
  description: "Compare this product to its previous version/generation and whether upgrading is worth it.",
  inputSchema: {
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
  const result = await runWorkload<VersionHistory>({
    workload: "insight_version",
    schema: VersionHistorySchema,
    tool: VERSION_HISTORY_TOOL,
    messages: [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, compare it against its previous version/generation:\n\n${buildCorpus(pages)}`,
      },
    ],
    maxTokens: 1024,
    maxAttempts: 2,
    normalize: (raw) => ({ changes: [], previousVersion: null, ...(raw as Record<string, unknown>) }),
    system:
      "You track product version history. If the sources don't clearly identify a previous version, set hasPreviousVersion to false, worthUpgrading to 'not_applicable', and say so plainly in the summary rather than guessing. Never invent a comparison that isn't grounded in the sources. Every field is required.",
  });
  return result.data;
}

const SCAM_DETECTOR_TOOL: ToolSpec = {
  name: "scam_detector",
  description: "Assess fake-review, counterfeit, and suspicious-seller risk for this product.",
  inputSchema: {
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
  const result = await runWorkload<ScamDetector>({
    workload: "insight_scam",
    schema: ScamDetectorSchema,
    tool: SCAM_DETECTOR_TOOL,
    messages: [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, assess fake review, counterfeit, and suspicious-seller risk:\n\n${buildCorpus(pages)}`,
      },
    ],
    maxTokens: 900,
    maxAttempts: 2,
    normalize: (raw) => ({ redFlags: [], fakeReviewEstimatePercent: null, ...(raw as Record<string, unknown>) }),
    system:
      "You are a fraud/authenticity analyst for online purchases. Be evidence-based: if sources show no scam/counterfeit signal, riskLevel should be 'low' and redFlags can be empty - do not manufacture risk. Never invent a percentage; use null when there is no basis. Every field is required.",
  });
  return result.data;
}

const BEST_IN_CATEGORY_TOOL: ToolSpec = {
  name: "best_in_category",
  description: "Rank this product against its direct competitors in the same category.",
  inputSchema: {
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
  const result = await runWorkload<BestInCategory>({
    workload: "insight_best_in_category",
    schema: BestInCategorySchema,
    tool: BEST_IN_CATEGORY_TOOL,
    messages: [
      {
        role: "user",
        content: `${productLine(product)}\n\nFrom these sources, rank it against direct competitors in the ${product.category} category:\n\n${buildCorpus(pages)}`,
      },
    ],
    maxTokens: 1024,
    maxAttempts: 2,
    normalize: (raw) => ({ competitors: [], ...(raw as Record<string, unknown>) }),
    system:
      "You rank products against category competitors using only what the sources actually compare it to. Do not invent competitor names that aren't grounded in the sources. Every field is required.",
  });
  return result.data;
}
