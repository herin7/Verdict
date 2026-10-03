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

const nodeEnv = optional("NODE_ENV", "development");

function configuredSupabaseValue(name: "SUPABASE_URL" | "SUPABASE_JWT_ISSUER") {
  const value = optional(name);
  const isExampleValue = value.includes("your-project.supabase.co");

  if (isExampleValue && nodeEnv === "production") {
    throw new Error(`${name} still contains the example Supabase hostname`);
  }

  // A copied .env.example must keep local development in soft-auth mode.
  return isExampleValue ? "" : value;
}

const supabaseUrl = configuredSupabaseValue("SUPABASE_URL");
const supabaseJwtIssuer = configuredSupabaseValue("SUPABASE_JWT_ISSUER");
const corsOrigins = optional("CORS_ORIGINS", "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (nodeEnv === "production" && corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGINS must list explicit origins in production");
}

export type AiProviderName = "anthropic" | "bedrock" | "bedrock-mantle";
export type AiPolicy = Partial<Record<Workload, AiProviderName[]>>;
export type BedrockModelMap = Partial<Record<Workload, string>>;

const ALL_WORKLOADS: Workload[] = [
  "identify_image",
  "identify_text",
  "identify_url",
  "report",
  "insight_long_term",
  "insight_version",
  "insight_scam",
  "insight_best_in_category",
  "personalize",
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
  nodeEnv,
  logLevel: optional("LOG_LEVEL", nodeEnv === "production" ? "info" : "debug"),
  corsOrigins,
  /** Optional - Anthropic left off the default provider chain. Only used if AI_POLICY explicitly lists "anthropic". */
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-sonnet-5"),
  port: Number(process.env.PORT) || 8787,
  // Firecrawl is the sole research provider (search/scrape/extract) -
  // Anakin support was fully removed (it was hardcoded primary and had gone
  // permanently out of credits with no top-up path).
  firecrawlApiKey: optional("FIRECRAWL_API_KEY"),
  firecrawlBaseUrl: "https://api.firecrawl.dev/v2",

  databaseUrl: optional("DATABASE_URL"),
  /** True inside AWS Lambda (set by the runtime). */
  isLambda: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME),
  awsRegion: process.env.AWS_REGION?.trim() || "ap-south-1",
  /** S3 bucket for shared screenshots/images. */
  sharesBucket: optional("SHARES_BUCKET"),
  /** Name of the worker Lambda the API invokes asynchronously. Unset = run in-process (local dev). */
  workerFunctionName: optional("WORKER_FUNCTION_NAME"),
  supabaseUrl,
  supabaseJwtIssuer,
  /** Legacy HS256 "JWT Secret" from Supabase dashboard (Settings > API) - only needed
   *  if the project has NOT been migrated to asymmetric JWT signing keys. */
  supabaseJwtSecret: optional("SUPABASE_JWT_SECRET"),

  reportTtlDays: Number(process.env.REPORT_TTL_DAYS) || 7,
  insightTtlDays: Number(process.env.INSIGHT_TTL_DAYS) || 7,

  /** Soft-auth mode when Supabase env not set - for local pipeline work without identity. */
  authEnabled: Boolean(supabaseJwtIssuer),
  /** Soft-db mode when Neon not set - cache skipped, pipeline still runs. */
  dbEnabled: Boolean(process.env.DATABASE_URL?.trim()),

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
