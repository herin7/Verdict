/**
 * Shared between bedrockProvider.ts (Converse API, IAM/SigV4 auth) and
 * bedrockMantleProvider.ts (Chat Completions API, bearer-key auth) - both
 * hit the same underlying Bedrock models, so pricing and per-model output
 * ceilings live here once instead of drifting between two copies.
 */

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Approximate US on-demand Bedrock pricing (per docs/pricing page, mid-2026).
 * ESTIMATED - re-verify at https://aws.amazon.com/bedrock/pricing/ before
 * relying on this for real budget decisions; Bedrock prices vary by region
 * and change over time.
 */
const PRICE_TABLE: Record<string, ModelPricing> = {
  "moonshotai.kimi-k2.5": { inputPer1M: 0.6, outputPer1M: 3.0 },
  "moonshot.kimi-k2-thinking": { inputPer1M: 0.6, outputPer1M: 2.5 },
  "zai.glm-4.7": { inputPer1M: 0.6, outputPer1M: 2.2 },
  "zai.glm-4.7-flash": { inputPer1M: 0.07, outputPer1M: 0.4 },
  "zai.glm-5": { inputPer1M: 0.9, outputPer1M: 3.3 },
  "deepseek.v3.2": { inputPer1M: 0.62, outputPer1M: 1.85 },
  "deepseek.v3.1": { inputPer1M: 0.58, outputPer1M: 1.68 },
  "qwen.qwen3-coder-next": { inputPer1M: 0.5, outputPer1M: 1.2 },
  "amazon.nova-micro-v1:0": { inputPer1M: 0.035, outputPer1M: 0.14 },
  "amazon.nova-lite-v1:0": { inputPer1M: 0.06, outputPer1M: 0.24 },
  "amazon.nova-pro-v1:0": { inputPer1M: 0.8, outputPer1M: 3.2 },
  "amazon.nova-premier-v1:0": { inputPer1M: 2.5, outputPer1M: 12.5 },
  "meta.llama3-1-8b-instruct-v1:0": { inputPer1M: 0.22, outputPer1M: 0.22 },
  "meta.llama3-1-70b-instruct-v1:0": { inputPer1M: 0.99, outputPer1M: 0.99 },
  "meta.llama3-1-405b-instruct-v1:0": { inputPer1M: 5.32, outputPer1M: 16.0 },
  "meta.llama4-scout-17b-instruct-v1:0": { inputPer1M: 0.17, outputPer1M: 0.17 },
};

/** Rough OSS-model-average fallback for any modelId not in PRICE_TABLE - always an ESTIMATE. */
const DEFAULT_PRICE: ModelPricing = { inputPer1M: 0.7, outputPer1M: 2.5 };

export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICE_TABLE[modelId] ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * pricing.inputPer1M + (outputTokens / 1_000_000) * pricing.outputPer1M;
}

/**
 * Per-model hard ceiling on requested max output tokens. Only models with a
 * ceiling BELOW what this app's call sites request need an entry - e.g. GLM
 * 4.7's Bedrock model card lists "Max output tokens: 4K", which
 * synthesizeReport's 4096-token request can exceed once you account for the
 * tool-call JSON wrapper, and Bedrock rejects that as a validation error
 * rather than silently truncating. GLM 5's model card lists 128K max output -
 * comfortably above anything requested here - so it deliberately has no
 * entry (no ceiling needed, `clampMaxTokens` returns the request unchanged).
 */
const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "zai.glm-4.7": 4000,
  "zai.glm-4.7-flash": 4000,
};

export function clampMaxTokens(modelId: string, requested: number): number {
  const ceiling = MODEL_MAX_OUTPUT_TOKENS[modelId];
  return ceiling ? Math.min(requested, ceiling) : requested;
}
