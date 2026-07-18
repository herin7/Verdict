import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { decodeJwt } from "jose";
import { config } from "./config.js";
import { shutdownPosthog } from "./analytics/posthog.js";
import { authPlugin } from "./auth/plugin.js";
import { dbAvailable, getDb, withDbRetry } from "./db/client.js";
import { sql } from "drizzle-orm";
import { identifyRoute } from "./routes/identify.js";
import { identifyUrlRoute } from "./routes/identifyUrl.js";
import { identifyScreenRoute } from "./routes/identifyScreen.js";
import { researchRoute } from "./routes/research.js";
import { buyLinkRoute } from "./routes/buyLink.js";
import { insightsRoute } from "./routes/insights.js";
import { productImageRoute } from "./routes/productImage.js";
import { meRoute } from "./routes/me.js";
import { compareRoute } from "./routes/compare.js";
import { dealsRoute } from "./routes/deals.js";
import { searchRoute } from "./routes/search.js";
import { missionsRoute } from "./routes/missions.js";
import { firecrawlWebhookRoute } from "./routes/firecrawlWebhook.js";

const app = Fastify({
  logger: true,
  bodyLimit: 15 * 1024 * 1024,
});

/**
 * Rate-limit runs its onRequest hook before any route's requireAuth preHandler,
 * so req.user isn't populated yet here. Peek at the bearer token's sub claim
 * without verifying it - good enough for fairness bucketing, real auth still
 * happens in requireAuth afterwards.
 */
function rateLimitKey(req: { headers: { authorization?: string }; ip: string }): string {
  const header = req.headers.authorization;
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const sub = decodeJwt(token).sub;
      if (sub) return sub;
    } catch {
      // fall through to IP
    }
  }
  return req.ip;
}

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: rateLimitKey,
});
await app.register(authPlugin);

app.addHook("onRequest", async (req) => {
  req.log.info({ requestId: req.id, method: req.method, url: req.url }, "request_start");
});

app.addHook("onResponse", async (req, reply) => {
  req.log.info(
    {
      requestId: req.id,
      method: req.method,
      route: req.routeOptions.url ?? req.url,
      statusCode: reply.statusCode,
      latencyMs: reply.elapsedTime,
      userId: req.user?.id,
      device: req.headers["x-device"],
      appVersion: req.headers["x-app-version"],
      networkType: req.headers["x-network-type"],
    },
    "request_end"
  );
});

app.addHook("onClose", async () => {
  await shutdownPosthog();
});

await app.register(identifyRoute);
await app.register(identifyUrlRoute);
await app.register(identifyScreenRoute);
await app.register(researchRoute);
await app.register(buyLinkRoute);
await app.register(insightsRoute);
await app.register(productImageRoute);
await app.register(meRoute);
await app.register(compareRoute);
await app.register(dealsRoute);
await app.register(searchRoute);
await app.register(missionsRoute);
await app.register(firecrawlWebhookRoute);

app.get("/health", async (_req, reply) => {
  let dbOk: boolean | "skipped" = "skipped";
  if (dbAvailable()) {
    try {
      await withDbRetry(async () => {
        await getDb().execute(sql`select 1`);
      });
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  const ok = dbOk !== false;
  const body = {
    ok,
    auth: config.authEnabled,
    db: config.dbEnabled,
    dbReachable: dbOk,
    missions: config.missionsEnabled,
    firecrawl: Boolean(config.firecrawlApiKey),
    providers: {
      anthropic: "configured" as const,
      firecrawl: Boolean(config.firecrawlApiKey) ? ("configured" as const) : ("disabled" as const),
      posthog: config.posthogEnabled ? ("configured" as const) : ("disabled" as const),
    },
  };
  if (!ok) reply.code(503);
  return body;
});

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Consensus server on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
