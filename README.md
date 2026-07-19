# Verdict

Verdict helps you decide whether a product is worth buying.

Open a product in a shopping app, scan it with the camera, or share a product link. Verdict identifies the item, researches real sources, compares prices, and returns one practical report with pros, complaints, risks, price advice, and alternatives.

The app is built for honest results. It does not invent prices, treat MRP as the deal price, or show a marketplace when the product was not found there.

## What is inside

```text
Android app or shared link
  -> identify product
  -> read current listing price
  -> research sources in parallel
  -> compare marketplace offers
  -> generate a structured buying report
```

The repository has two main parts:

- `app/` contains the Expo and React Native app.
- `server/` contains the Fastify API, research pipeline, price normalization, database access, and AI gateway.

Android also includes two local Expo modules:

- `verdict-accessibility` reads product text from supported shopping apps.
- `verdict-overlay` shows the floating bubble and native draggable result panel.

## Product identification

Verdict accepts three entry points:

1. Camera or image scan through `POST /identify`
2. Product URL through `POST /identify-url`
3. Android screen text through `POST /identify-screen`

Screen identification extracts useful marketplace IDs such as Amazon ASIN and Flipkart FSN when they are visible. It also captures the live price shown to the user. This live price is the strongest source for the current listing.

## Research pipeline

Research starts with source-specific searches for reviews, forums, videos, news, retailers, and price information. Useful pages are scraped and converted into clean source material. If a page blocks scraping or times out, Verdict keeps any trustworthy search evidence instead of failing the whole report.

The report is validated against a Zod schema before it reaches the app. Missing soft fields receive safe defaults such as `unknown`. Required product identity and evidence still remain strict.

## Price and offer pipeline

Price comparison uses several layers:

1. Current on-device listing price
2. Direct Amazon.in or Flipkart product page by ASIN, FSN, item ID, or URL
3. Public JSON-LD and explicit payable-price fields
4. Marketplace search results with validated price evidence
5. Direct parsing of matching search result pages
6. Firecrawl extraction for remaining gaps

Every price carries source context through normalization. Only current or sale prices are payable. MRP, EMI amounts, coupons, ratings, and review counts are rejected as deal prices.

Other rules:

- Sale price wins over MRP.
- Out-of-stock products remain visible when a verified price exists.
- Missing products and unpriced marketplace shells are omitted.
- Available offers sort before out-of-stock offers.
- Grocery pack sizes must match. A 250 ml item does not compare with a 750 ml item.
- Location-sensitive results do not use the normal global cache.

The manual live smoke script is at `server/scripts/live-price-smoke.ts`. It is never run by CI.

## Quick commerce

Quick-commerce prices depend on the delivery location and dark store.

Verdict trusts the price read from the shopping app currently open on the user's device. Anonymous Blinkit, Zepto, BigBasket, Instamart, Milkbasket, and Flipkart Minutes pages are not treated as current cross-store offers unless the delivery location can be verified.

The user can save an Indian delivery pincode in the profile. Marketplace scraping only uses pincode actions where the selectors were verified. Unknown or unverified location flows are skipped rather than guessed.

## AI gateway

All AI workloads pass through `server/src/ai/gateway.ts`.

The default provider is AWS Bedrock Mantle with `zai.glm-5`. Anthropic is not part of the default chain.

Required configuration:

```env
BEDROCK_REGION=ap-south-1
BEDROCK_MANTLE_API_KEY=your_key
```

`AI_POLICY` can override the provider chain per workload. `BEDROCK_MODEL_MAP` can override model IDs. GLM does not support image input, so `identify_image` needs a vision-capable Bedrock model if camera identification is enabled.

## Database

Verdict uses Postgres through Drizzle and the Neon serverless driver.

Migrations cover:

- Core users, products, reports, and offers
- Compare and deal guardrails
- Shopping missions and Firecrawl monitors
- Report currency
- User delivery pincode

Apply them with:

```bash
cd server
npm run db:migrate
```

## Shopping missions

Missions can research products, compare offers, and propose an action. The user must approve every action. Verdict never purchases automatically.

Missions require `DATABASE_URL`. Firecrawl monitors are optional and need `FIRECRAWL_API_KEY`, `PUBLIC_BASE_URL`, and `FIRECRAWL_WEBHOOK_SECRET`.

Set `MISSIONS_ENABLED=false` to disable missions.

## Main API routes

- `POST /identify`
- `POST /identify-url`
- `POST /identify-screen`
- `POST /research`
- `POST /compare`
- `POST /compare/start`
- `GET /compare/poll/:jobId`
- `POST /deals`
- `GET|POST /missions`
- `POST /missions/:id/run|approve|reject|cancel`
- `GET|PUT /me/*`
- `POST /webhooks/firecrawl`
- `GET /health`

Protected routes use Supabase JWT authentication. Request validation, abuse guards, structured logs, and provider metrics live on the server.

## Local setup

### Server

```bash
cd server
copy .env.example .env
npm install
npm run db:migrate
npm run dev
```

Fill `DATABASE_URL`, Supabase settings, Bedrock settings, and any optional Firecrawl or PostHog values in `.env`.

### Android app

```bash
cd app
copy .env.example .env
npm install
npx expo prebuild --platform android
npx expo run:android
```

For a physical phone, point `EXPO_PUBLIC_API_URL` at the computer's LAN address:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:8787
```

The Android emulator uses `10.0.2.2` to reach the host.

Expo Go is not enough for the overlay, accessibility service, share target, or native launcher icon. Use a development build.

## Android permissions

Verdict needs:

- Camera
- Display over other apps
- Accessibility service
- Notifications
- Approximate location for location-aware pricing

Accessibility reading is limited to supported shopping apps. Personal apps are not read. iOS does not support Android-style floating overlays.

## Tests

```bash
cd server
npm test
npm run typecheck

cd ../app
npx tsc --noEmit
```

Focused server scripts are also available for compare, pricing evidence, direct fetchers, screen text, AI gateway, and pack matching.

## Optional observability

PostHog is disabled when its key is absent. Server logs use pino and include request IDs, routes, status codes, latency, provider calls, and outcomes.

Keep analytics properties coarse. Never send raw screen text, product images, prompts, tokens, or secrets.
