import dotenv from "dotenv";
import type { Workload } from "./ai/types.js";

// dotenv 17 prints a promotional banner to the console on load unless quieted.
dotenv.config({ quiet: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function optionalJson<T>(name: string, fallback: T): T {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON in env var ${name}`);
  }
}

export type AiProviderName = "anthropic" | "bedrock" | "bedrock-mantle";
export type AiPolicy = Partial<Record<Workload, AiProviderName[]>>;
export type BedrockModelMap = Partial<Record<Workload, string>>;

const ALL_WORKLOADS: Workload[] = [
  "identify_image",
  "identify_screen",
  "identify_url",
  "report",
  "insight_long_term",
  "insight_version",
  "insight_scam",
  "insight_best_in_category",
];

/** Today's actual behavior: every workload goes straight to Anthropic. */
const DEFAULT_AI_POLICY: AiPolicy = Object.fromEntries(
  ALL_WORKLOADS.map((w) => [w, ["anthropic"]])
) as AiPolicy;

/**
 * Text-only workloads GLM 4.7 is verified safe for (report + insights - the
 * ones Phase 1's currency-pinning work already covers). Deliberately excludes
 * identify_image (GLM has no vision input at all - confirmed on its Bedrock
 * model card) and identify_screen/identify_url (text-based, but not yet
 * exercised by this canary - keep the blast radius to what's been tested).
 */
const GLM_CANARY_WORKLOADS: Workload[] = [
  "report",
  "insight_long_term",
  "insight_version",
  "insight_scam",
  "insight_best_in_category",
];

/** zai.glm-5 - confirmed model ID from its Bedrock model card (Converse +
 *  Invoke + Chat Completions/Mantle, text-only, 200K context, 128K max
 *  output - same id works on both the Converse and Mantle endpoints). */
const GLM_MODEL_ID = "zai.glm-5";

/**
 * Canary switch: default OFF (per the locked decision to validate GLM
 * quality/latency on real report/insight traffic before wider rollout).
 * Setting GLM_CANARY_ENABLED=true routes report + insight_* to
 * ["bedrock-mantle","anthropic"] (GLM primary via Bedrock Mantle, Anthropic
 * fallback - runWorkload in ai/gateway.ts already tries providers in order
 * and falls through on any failure/unsupported workload, so Anthropic
 * transparently covers GLM outages/throttling with zero extra code here).
 * Mantle (OpenAI-Chat-Completions-compatible, bearer-key auth) is AWS's own
 * recommended endpoint over the SigV4 Converse API where both are supported.
 * Requires BEDROCK_REGION and BEDROCK_MANTLE_API_KEY to also be set, and
 * zai.glm-5 model access enabled in that region's Bedrock console -
 * ap-south-1 (Mumbai) is in-region for this model and the natural choice for
 * an India-first app.
 */
const glmCanaryEnabled = ["1", "true", "on"].includes(
  (process.env.GLM_CANARY_ENABLED ?? "").trim().toLowerCase()
);

function glmCanaryPolicyDefaults(): AiPolicy {
  return Object.fromEntries(GLM_CANARY_WORKLOADS.map((w) => [w, ["bedrock-mantle", "anthropic"]])) as AiPolicy;
}

function glmCanaryModelMapDefaults(): BedrockModelMap {
  return Object.fromEntries(GLM_CANARY_WORKLOADS.map((w) => [w, GLM_MODEL_ID])) as BedrockModelMap;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-sonnet-5"),
  port: Number(process.env.PORT) || 8787,
  // Firecrawl is the sole research provider (search/scrape/extract) -
  // Anakin support was fully removed (it was hardcoded primary and had gone
  // permanently out of credits with no top-up path).
  firecrawlApiKey: optional("FIRECRAWL_API_KEY"),
  firecrawlBaseUrl: "https://api.firecrawl.dev/v2",
  /** Public base URL of this server (used to register Firecrawl monitor webhooks). Unset = no auto webhook URL. */
  publicBaseUrl: optional("PUBLIC_BASE_URL"),
  /** Shared secret for POST /webhooks/firecrawl. Unset = webhook route rejects all calls. */
  firecrawlWebhookSecret: optional("FIRECRAWL_WEBHOOK_SECRET"),

  databaseUrl: optional("DATABASE_URL"),
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseJwtIssuer: optional("SUPABASE_JWT_ISSUER"),
  /** Legacy HS256 "JWT Secret" from Supabase dashboard (Settings > API) - only needed
   *  if the project has NOT been migrated to asymmetric JWT signing keys. */
  supabaseJwtSecret: optional("SUPABASE_JWT_SECRET"),

  reportTtlDays: Number(process.env.REPORT_TTL_DAYS) || 7,
  insightTtlDays: Number(process.env.INSIGHT_TTL_DAYS) || 7,
  buyLinkTtlHours: Number(process.env.BUY_LINK_TTL_HOURS) || 24,
  offerTtlHours: Number(process.env.OFFER_TTL_HOURS) || 6,

  /** Soft-auth mode when Supabase env not set - for local pipeline work without identity. */
  authEnabled: Boolean(process.env.SUPABASE_JWT_ISSUER?.trim()),
  /** Soft-db mode when Neon not set - cache skipped, pipeline still runs. */
  dbEnabled: Boolean(process.env.DATABASE_URL?.trim()),
  /**
   * Shopping Missions require DB persistence. Soft-off when DATABASE_URL unset,
   * or when MISSIONS_ENABLED=false/0 explicitly.
   */
  missionsEnabled:
    Boolean(process.env.DATABASE_URL?.trim()) &&
    !["0", "false", "off"].includes((process.env.MISSIONS_ENABLED ?? "true").trim().toLowerCase()),

  /** AWS region for Bedrock Converse calls. Unset = Bedrock disabled, only Anthropic runs. */
  bedrockRegion: optional("BEDROCK_REGION"),
  bedrockEnabled: Boolean(process.env.BEDROCK_REGION?.trim()),
  /** Workload -> Bedrock modelId, e.g. {"identify_screen":"..."}. Shared by both the Converse
   *  (bedrock) and Mantle (bedrock-mantle) providers - a given model id means the same thing on
   *  either endpoint, so one map covers both. Workloads missing here can't run on either. */
  bedrockModelMap: {
    ...(glmCanaryEnabled ? glmCanaryModelMapDefaults() : {}),
    ...optionalJson<BedrockModelMap>("BEDROCK_MODEL_MAP", {}),
  } as BedrockModelMap,

  /**
   * Bedrock Mantle - OpenAI-Chat-Completions-compatible endpoint, bearer-key
   * auth (a "long-term API key" generated in the Bedrock console), no AWS
   * SDK/SigV4/IAM credentials involved. Distinct from bedrockEnabled/
   * bedrockRegion above, which gate the Converse API path. Reuses
   * BEDROCK_REGION for the region since Mantle is region-scoped the same way
   * Converse is; requires BEDROCK_MANTLE_API_KEY on top of that to enable.
   */
  bedrockMantleApiKey: optional("BEDROCK_MANTLE_API_KEY"),
  bedrockMantleEnabled:
    Boolean(process.env.BEDROCK_MANTLE_API_KEY?.trim()) && Boolean(process.env.BEDROCK_REGION?.trim()),
  bedrockMantleBaseUrl: `https://bedrock-mantle.${optional("BEDROCK_REGION", "ap-south-1")}.api.aws/v1`,
  /** Workload -> ordered provider chain, e.g. {"identify_screen":["bedrock","anthropic"]}. Missing workloads fall back to anthropic-only. */
  aiPolicy: {
    ...DEFAULT_AI_POLICY,
    ...(glmCanaryEnabled ? glmCanaryPolicyDefaults() : {}),
    ...optionalJson<AiPolicy>("AI_POLICY", {}),
  } as AiPolicy,

  /** PostHog server-side analytics. Unset = fully disabled, zero behavior change. */
  posthogApiKey: optional("POSTHOG_API_KEY"),
  posthogHost: optional("POSTHOG_HOST", "https://us.i.posthog.com"),
  posthogEnabled: Boolean(process.env.POSTHOG_API_KEY?.trim()),

  /** Wall-clock timeout for Firecrawl HTTP (AbortSignal). */
  providerHttpTimeoutMs: Number(process.env.PROVIDER_HTTP_TIMEOUT_MS) || 10_000,
  /** Extra attempts after the first for 429/5xx/network/timeout on provider HTTP. */
  providerHttpRetries: Number(process.env.PROVIDER_HTTP_RETRIES) || 2,
  /** Anthropic SDK request timeout (ms). */
  anthropicTimeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS) || 90_000,
};
