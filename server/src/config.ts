import dotenv from "dotenv";
import type { Workload } from "./ai/types.js";

// dotenv 17 prints a promotional banner to the console on load unless quieted.
dotenv.config({ quiet: true });

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

/** zai.glm-5 - Bedrock model card id (Converse + Mantle Chat Completions).
 *  Text-only, 200K context, 128K max output. identify_image is vision - GLM
 *  has none; that workload will fail at the model until a vision id is set
 *  in BEDROCK_MODEL_MAP. */
const GLM_MODEL_ID = "zai.glm-5";

/** Default: every workload hits Bedrock Mantle GLM only - never Anthropic. */
const DEFAULT_AI_POLICY: AiPolicy = Object.fromEntries(
  ALL_WORKLOADS.map((w) => [w, ["bedrock-mantle"]])
) as AiPolicy;

const DEFAULT_BEDROCK_MODEL_MAP: BedrockModelMap = Object.fromEntries(
  ALL_WORKLOADS.map((w) => [w, GLM_MODEL_ID])
) as BedrockModelMap;

export const config = {
  /** Optional - Anthropic left off the default provider chain. Only used if AI_POLICY explicitly lists "anthropic". */
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
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

  /** AWS region for Bedrock Converse/Mantle. Unset = Bedrock providers disabled. */
  bedrockRegion: optional("BEDROCK_REGION"),
  bedrockEnabled: Boolean(process.env.BEDROCK_REGION?.trim()),
  /** Workload -> Bedrock modelId. Shared by Converse (bedrock) and Mantle (bedrock-mantle).
   *  Defaults all workloads to zai.glm-5; override per workload via BEDROCK_MODEL_MAP. */
  bedrockModelMap: {
    ...DEFAULT_BEDROCK_MODEL_MAP,
    ...optionalJson<BedrockModelMap>("BEDROCK_MODEL_MAP", {}),
  } as BedrockModelMap,

  /**
   * Bedrock Mantle - OpenAI-Chat-Completions-compatible endpoint, bearer-key
   * auth (long-term API key from Bedrock console). Default LLM path for all
   * workloads. Reuses BEDROCK_REGION; needs BEDROCK_MANTLE_API_KEY to enable.
   */
  bedrockMantleApiKey: optional("BEDROCK_MANTLE_API_KEY"),
  bedrockMantleEnabled:
    Boolean(process.env.BEDROCK_MANTLE_API_KEY?.trim()) && Boolean(process.env.BEDROCK_REGION?.trim()),
  bedrockMantleBaseUrl: `https://bedrock-mantle.${optional("BEDROCK_REGION", "ap-south-1")}.api.aws/v1`,
  /** Workload -> ordered provider chain. Default: bedrock-mantle only (no Anthropic). */
  aiPolicy: {
    ...DEFAULT_AI_POLICY,
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
