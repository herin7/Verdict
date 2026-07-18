import { config } from "../config.js";
import { capture } from "../analytics/posthog.js";
import { logger } from "../logging/logger.js";
import { anthropicProvider } from "./providers/anthropicProvider.js";
import { bedrockProvider } from "./providers/bedrockProvider.js";
import { bedrockMantleProvider } from "./providers/bedrockMantleProvider.js";
import type { LLMCallMeta, LLMProvider, LLMResult, LLMToolCallRequest, Workload } from "./types.js";

const PROVIDERS: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,
  bedrock: bedrockProvider,
  "bedrock-mantle": bedrockMantleProvider,
};

/**
 * Per-call telemetry hook. Called for every provider attempt (success or
 * failure), keyed the same way for LLM calls and (via orchestrator.ts)
 * research-provider calls - kind distinguishes the two in both the log line
 * and the PostHog event.
 */
export interface ProviderCallMetric {
  kind: "llm" | "research";
  workload: string;
  provider: string;
  model?: string;
  latencyMs: number;
  ok: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  attempts?: number;
  error?: string;
}

/**
 * No requestId/userId plumbed through the LLMProvider/ResearchProvider call
 * chain yet, so every event is keyed by this generic distinctId. Threading
 * real user context through would touch every call site in claude.ts and
 * orchestrator.ts - left as a known follow-up rather than done here.
 */
const DEFAULT_DISTINCT_ID = "server";

export function recordProviderCall(metric: ProviderCallMetric): void {
  logger.info(
    {
      kind: metric.kind,
      workload: metric.workload,
      provider: metric.provider,
      model: metric.model,
      latencyMs: metric.latencyMs,
      ok: metric.ok,
      inputTokens: metric.inputTokens,
      outputTokens: metric.outputTokens,
      costUsd: metric.costUsd,
      attempts: metric.attempts,
      error: metric.error,
    },
    "provider_call"
  );
  capture("ai_provider_call", DEFAULT_DISTINCT_ID, { ...metric });
}

function chainFor(workload: Workload): LLMProvider[] {
  const names = config.aiPolicy[workload] ?? ["anthropic"];
  return names.map((n) => PROVIDERS[n]).filter((p): p is LLMProvider => Boolean(p));
}

function metaToMetric(workload: Workload, meta: LLMCallMeta, latencyMs: number): ProviderCallMetric {
  return {
    kind: "llm",
    workload,
    provider: meta.provider,
    model: meta.model,
    latencyMs,
    ok: true,
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    costUsd: meta.costUsd,
    attempts: meta.attempts,
  };
}

/**
 * Resolves the provider chain for `req.workload` from config.aiPolicy and tries
 * each provider in order, skipping ones that don't support the workload. First
 * successful call wins; if every provider is unsupported or fails, throws an
 * aggregate error describing every attempt.
 */
export async function runWorkload<T>(req: LLMToolCallRequest<T>): Promise<LLMResult<T>> {
  return runWorkloadWithProviders(req, chainFor(req.workload));
}

/**
 * Same resolution/fallback/telemetry logic as `runWorkload`, but takes an
 * explicit provider list instead of resolving one from config.aiPolicy. Split
 * out so tests can exercise the real chain/fallback/error-aggregation logic
 * against fake providers, with no config or network dependency.
 */
export async function runWorkloadWithProviders<T>(
  req: LLMToolCallRequest<T>,
  chain: LLMProvider[]
): Promise<LLMResult<T>> {
  const failures: string[] = [];

  for (const provider of chain) {
    if (!provider.supports(req.workload)) {
      failures.push(`${provider.name}: does not support workload "${req.workload}"`);
      continue;
    }

    const start = Date.now();
    try {
      const result = await provider.callTool(req);
      recordProviderCall(metaToMetric(req.workload, result.meta, Date.now() - start));
      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      recordProviderCall({
        kind: "llm",
        workload: req.workload,
        provider: provider.name,
        latencyMs,
        ok: false,
        error: message,
      });
      failures.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(
    `All providers failed for workload "${req.workload}":\n${failures.map((f) => `- ${f}`).join("\n")}`
  );
}
