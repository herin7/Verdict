import { synthesizeReport } from "./claude.js";
import { scrapeWithFallback, searchMany, selectUrls, type SourceQuery } from "./webResearch.js";
import type { Country } from "./marketplaces/registry.js";
import type { ConsensusReport, ProductIdentity, ReportSource } from "./schema.js";

export interface ResearchResult {
  report: ConsensusReport;
}

export interface EvidencePage extends ReportSource {
  markdown: string;
}

const SEARCH_TIMEOUT_MS = 8000;
const SCRAPE_ONE_TIMEOUT_MS = 8000;
const MAX_URLS_TO_SCRAPE = 7;

/**
 * One query per kind of evidence a buying decision needs. Each costs search
 * credits, so the set stays lean while spanning owners, experts and specs.
 */
function buildQueries(term: string): SourceQuery[] {
  return [
    { type: "reddit", prompt: `site:reddit.com ${term} long term review problems worth it` },
    { type: "retail", prompt: `${term} customer reviews rating complaints` },
    { type: "youtube", prompt: `site:youtube.com ${term} review after months` },
    { type: "forum", prompt: `${term} common problems reliability owners forum` },
    { type: "review", prompt: `${term} expert review verdict pros cons` },
    { type: "specs", prompt: `${term} official specifications` },
  ];
}

/** Progress hook so the share pipeline can show what research is doing. */
export type ResearchStep = "searching" | "reading_sources" | "writing";

export async function runResearch(
  product: ProductIdentity,
  country: Country = "IN",
  onStep: (step: ResearchStep) => void | Promise<void> = () => {}
): Promise<ResearchResult> {
  const term = product.searchTerm || product.name;

  // A single failing search must not discard the others - searchMany catches
  // per query so partial results still produce a report.
  await onStep("searching");
  const grouped = await searchMany(buildQueries(term), { limit: 5, timeoutMs: SEARCH_TIMEOUT_MS });
  const picked = selectUrls(grouped, MAX_URLS_TO_SCRAPE);

  // Nothing to ground the report on: fail loudly instead of letting the model guess.
  if (picked.length === 0) {
    throw new Error(`We couldn't find enough reviews of "${term}" to judge it.`);
  }

  await onStep("reading_sources");
  const byUrl = await scrapeWithFallback(
    picked.map((p) => p.url),
    { oneTimeoutMs: SCRAPE_ONE_TIMEOUT_MS }
  );

  // Fall back to the search snippet so every source has some grounding.
  const pages: EvidencePage[] = picked.map((p) => ({
    url: p.url,
    title: p.title || p.url,
    type: p.type,
    markdown: byUrl.get(p.url)?.markdown ?? p.title,
  }));

  await onStep("writing");
  return { report: await synthesizeReport(product, pages, country) };
}
