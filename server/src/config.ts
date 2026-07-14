import "dotenv/config";
import type { Workload } from "./ai/types.js";

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

export type AiProviderName = "anthropic" | "bedrock";
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

export const config = {
  anakinApiKey: required("ANAKIN_API_KEY"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  anthropicModel: optional("ANTHROPIC_MODEL", "claude-sonnet-5"),
  port: Number(process.env.PORT) || 8787,
  anakinBaseUrl: "https://api.anakin.io/v1",
  firecrawlApiKey: optional("FIRECRAWL_API_KEY"),
  firecrawlBaseUrl: "https://api.firecrawl.dev/v2",

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

  /** AWS region for Bedrock Converse calls. Unset = Bedrock disabled, only Anthropic runs. */
  bedrockRegion: optional("BEDROCK_REGION"),
  bedrockEnabled: Boolean(process.env.BEDROCK_REGION?.trim()),
  /** Workload -> Bedrock modelId, e.g. {"identify_screen":"..."}. Workloads missing here can't run on Bedrock. */
  bedrockModelMap: optionalJson<BedrockModelMap>("BEDROCK_MODEL_MAP", {}),
  /** Workload -> ordered provider chain, e.g. {"identify_screen":["bedrock","anthropic"]}. Missing workloads fall back to anthropic-only. */
  aiPolicy: { ...DEFAULT_AI_POLICY, ...optionalJson<AiPolicy>("AI_POLICY", {}) } as AiPolicy,

  /** PostHog server-side analytics. Unset = fully disabled, zero behavior change. */
  posthogApiKey: optional("POSTHOG_API_KEY"),
  posthogHost: optional("POSTHOG_HOST", "https://us.i.posthog.com"),
  posthogEnabled: Boolean(process.env.POSTHOG_API_KEY?.trim()),
};
