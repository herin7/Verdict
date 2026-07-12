import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

export const config = {
  anakinApiKey: required("ANAKIN_API_KEY"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
  port: Number(process.env.PORT) || 8787,
  anakinBaseUrl: "https://api.anakin.io/v1",
  // Optional fallback provider. When set, used if Anakin search/scrape fails.
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY?.trim() || "",
  firecrawlBaseUrl: "https://api.firecrawl.dev/v2",
};
