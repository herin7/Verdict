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

- `server/` - Fastify + TypeScript backend. Holds the API keys, orchestrates the pipeline. Endpoints: `POST /identify`, `POST /research`, `GET /health`.
  - `src/anakin.ts` - Anakin client: `search()` (sync), `scrapeBatch()` (async submit + poll), `scrape()` (inline single URL).
  - `src/claude.ts` - Claude vision `identifyProduct()` and structured `synthesizeReport()`.
  - `src/pipeline.ts` - orchestrates query generation -> Anakin search -> ranking -> Anakin scrape -> Claude synthesis.
- `app/` - Expo (React Native, TS) app. `ScanScreen` (camera + identify + confirm) and `ReportScreen`.

## Run

Backend:

```bash
cd server
cp .env.example .env   # fill ANAKIN_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev
```

App:

```bash
cd app
npm install
npm start
```

On a physical device set `EXPO_PUBLIC_API_URL` to your machine's LAN IP, e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.50:8787`. The Android emulator uses `10.0.2.2` automatically.

## Credit cost per scan

~8 searches (3 credits each) + up to 8 scrapes (1 credit each) = ~32 credits. Free Anakin tier includes 500 (~15 scans).

## Timing

Real-world latency depends on Anakin scrape speed for the specific sources picked (typical completion 3-15s per Anakin's docs) plus Claude synthesis. The pipeline budgets ~9s for search, ~15s for the scrape batch, and degrades gracefully (falls back to search snippets) rather than blocking indefinitely.
