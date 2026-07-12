# Verdict

Point your phone camera at any product and get a single AI research report on what the internet actually thinks - verdict, pros, complaints, long-term issues, fake-review signal, price advice, and alternatives. "Perplexity for purchase decisions."

**Anakin (AnakinScraper) is the research core of this project.** Every fact in the report is grounded in Anakin's web search + scraping - it is not a thin wrapper, it is the engine that finds and reads the internet. Claude only fills the two gaps Anakin has no endpoint for: turning a camera photo into a product identity, and reasoning across scraped sources into one consensus.

## How it works

```
Camera photo
  -> Claude vision                 ->  product identity
  -> Anakin Search API (parallel, source-scoped):
       reddit / amazon / flipkart / youtube / blogs+forums / news / official site / price history
  -> Anakin URL Scraper (batch job, submit + poll -> markdown per source)
  -> Claude synthesis               ->  structured ConsensusReport
```

Every scan runs 8 parallel Anakin `Search` calls (one per source type) then an Anakin `URL Scraper` batch job against the best ~8 citations found. Anakin's URL Scraper is asynchronous - the server submits the batch and polls `GET /v1/url-scraper/{id}` (2s interval, per Anakin's own guidance) until the scrape completes or a timeout budget is hit, then falls back to the search snippet for any source that didn't finish in time.

## Structure

- `server/` - Fastify + TypeScript backend. Holds the API keys, orchestrates the pipeline.
  - Endpoints: `POST /identify`, `POST /identify-url`, `POST /research`, `POST /compare`, `POST /deals`, `GET/PUT /me/*`, `GET /health`
  - Anakin-first provider orchestrator with Firecrawl gap-fill
  - Compare Everywhere + Personalized Deal Engine (deterministic, no LLM)
  - Pre-flight validation + abuse prevention (IP ban after repeated invalids)
- `app/` - Expo (React Native, TS) app with camera scan, paste-link, payment profile, compare/deals UI
  - Android floating overlay (custom native module) + share-intent (requires EAS/dev-client build)

## Run

Backend:

```bash
cd server
cp .env.example .env   # fill ANAKIN_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev
# optional: apply drizzle/0001_guardrails_compare_deals.sql on Neon
```

App (Expo Go - camera + paste link + deals UI):

```bash
cd app
npm install
npm start
```

App (Android floating overlay / share-target - needs custom dev client):

```bash
cd app
npx expo prebuild --platform android
npx expo run:android
# or: eas build --profile development --platform android
```

On a physical device set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.50:8787`. The Android emulator uses `10.0.2.2` automatically.

### Overlay detection priority (Android)

1. Share Intent from shopping app (zero extra permission)
2. Bubble tap -> one-shot MediaProjection screenshot -> Claude vision identify
3. Optional AccessibilityService text read (off by default, explicit disclosure)

iOS floating overlay is not supported by Apple; deferred.

## Credit cost per scan

~8 searches (3 credits each) + up to 8 scrapes (1 credit each) = ~32 credits. Free Anakin tier includes 500 (~15 scans).

## Timing

Real-world latency depends on Anakin scrape speed for the specific sources picked (typical completion 3-15s per Anakin's docs) plus Claude synthesis. The pipeline budgets ~9s for search, ~15s for the scrape batch, and degrades gracefully (falls back to search snippets) rather than blocking indefinitely.
