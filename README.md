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
  - Endpoints: `POST /identify`, `POST /identify-url`, `POST /research`, `POST /compare`, `POST /deals`, `GET|POST /missions*`, `POST /webhooks/firecrawl`, `GET/PUT /me/*`, `GET /health`
  - Anakin-first provider orchestrator with Firecrawl gap-fill + optional Firecrawl price/stock monitors
  - Shopping Missions (agent proposes, human approves - never auto-purchase)
  - Compare Everywhere + Personalized Deal Engine (deterministic, no LLM)
  - Pre-flight validation + abuse prevention (IP ban after repeated invalids)
- `app/` - Expo (React Native, TS) app with camera scan, paste-link, payment profile, compare/deals UI, missions
  - Android floating overlay (custom native module) + share-intent (requires EAS/dev-client build)

## AI provider architecture

All LLM calls (`server/src/claude.ts`) go through one gateway (`server/src/ai/gateway.ts`) instead of talking to Anthropic directly. Each workload (`identify_image`, `report`, `insight_*`, etc.) resolves an ordered provider chain and tries each until one succeeds.

- `AI_POLICY` (JSON env, e.g. `{"identify_screen":["bedrock","anthropic"]}`) sets the per-workload chain. Unset today = every workload is `["anthropic"]` only - zero behavior change.
- `BEDROCK_REGION` enables the Bedrock provider (unset = Bedrock disabled entirely, chain falls through to Anthropic).
- `BEDROCK_MODEL_MAP` (JSON env, e.g. `{"identify_screen":"amazon.nova-lite-v1:0"}`) maps workload -> Bedrock model id. A workload with no entry can't run on Bedrock even if listed in `AI_POLICY`.

Anthropic is always the default and last-resort fallback; Bedrock is opt-in per workload. To try Bedrock on one workload: set `BEDROCK_REGION`, add that workload to `BEDROCK_MODEL_MAP`, then add `["bedrock","anthropic"]` for it in `AI_POLICY`. Rollback is deleting/editing that env var, no code change.

## Observability & Analytics

Product analytics (PostHog) and structured logging (pino) are both opt-in and fully disabled by default - unset env vars means zero behavior change.

- Server: `POSTHOG_API_KEY` + `POSTHOG_HOST` (default `https://us.i.posthog.com`). Unset key = client never initializes, `capture()` calls no-op.
- App: `EXPO_PUBLIC_POSTHOG_API_KEY` + `EXPO_PUBLIC_POSTHOG_HOST`. Unset key = `posthog` is `null`, `track()` calls no-op. No `PostHogProvider`/autocapture - events are only sent from explicit `track()` calls.
- Every request logs `request_start`/`request_end` (pino, `server/src/logging/logger.ts`) keyed by `requestId`, with route, status, and `latencyMs`.
- Event naming convention: `domain_action` in snake_case (e.g. `scan_started`, `report_saved`, `ai_provider_call`, `mission_created`). Only send category/count/boolean/enum-level properties - never raw product titles, scraped/screen text, prompts, images, tokens, or secrets.

## Reliability knobs

Optional env (defaults are fine for local/dev):

- `PROVIDER_HTTP_TIMEOUT_MS` (default 20000) - AbortSignal wall-clock on Anakin/Firecrawl HTTP
- `PROVIDER_HTTP_RETRIES` (default 2) - extra attempts on 429/5xx/network/timeout
- `ANTHROPIC_TIMEOUT_MS` (default 90000) - Anthropic SDK request timeout

`GET /health` reports config flags plus `dbReachable` (live `SELECT 1` when `DATABASE_URL` set). Returns 503 if DB is configured but unreachable. Firecrawl/missions/PostHog stay soft-off when their keys/flags are unset.

## Shopping Missions & Firecrawl monitors

Missions let the agent research compare/deals and propose an action; you approve or reject. No purchase runs without approval.

- Requires `DATABASE_URL` (apply `server/drizzle/0002_missions_firecrawl.sql`). Set `MISSIONS_ENABLED=false` to force-off.
- Optional price/stock monitoring uses Firecrawl `/monitor` when `FIRECRAWL_API_KEY` is set. Register webhooks with `PUBLIC_BASE_URL` + `FIRECRAWL_WEBHOOK_SECRET` (header `x-verdict-webhook-secret`).
- App: Dashboard -> Shopping Missions. Server: `GET /missions`, `POST /missions`, `POST /missions/:id/run|approve|reject|cancel`.

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

1. Accessibility reading (watchlist-gated shopping apps only) - auto-shows bubble, no casting
2. Bubble tap -> identify from on-screen text via `/identify-screen` (no MediaProjection)
3. Share Intent from shopping app (zero extra permission)

Personal apps are never read. Requires Accessibility + Display-over-apps permissions.

iOS floating overlay is not supported by Apple; deferred.

## Credit cost per scan

~8 searches (3 credits each) + up to 8 scrapes (1 credit each) = ~32 credits. Free Anakin tier includes 500 (~15 scans).

## Timing

Real-world latency depends on Anakin scrape speed for the specific sources picked (typical completion 3-15s per Anakin's docs) plus Claude synthesis. The pipeline budgets ~9s for search, ~15s for the scrape batch, and degrades gracefully (falls back to search snippets) rather than blocking indefinitely.
