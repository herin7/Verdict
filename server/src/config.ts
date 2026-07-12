import "dotenv/config";

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
};
