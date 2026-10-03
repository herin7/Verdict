import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { decodeJwt } from "jose";
import { sql } from "drizzle-orm";
import { config } from "./config.js";
import { shutdownPosthog } from "./analytics/posthog.js";
import { authPlugin } from "./auth/plugin.js";
import { dbAvailable, getDb, withDbRetry } from "./db/client.js";
import { insightsRoute } from "./routes/insights.js";
import { profileRoute } from "./routes/profile.js";
import { sharesRoute } from "./routes/shares.js";

/** Builds the HTTP application without binding a port, so it is integration-testable. */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });
  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
  });
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute", keyGenerator: rateLimitKey });
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
  app.addHook("onClose", async () => shutdownPosthog());

  await registerFeatures(app);
  registerHealthEndpoint(app);
  return app;
}

async function registerFeatures(app: FastifyInstance): Promise<void> {
  await app.register(sharesRoute);
  await app.register(insightsRoute);
  await app.register(profileRoute);
}

function registerHealthEndpoint(app: FastifyInstance): void {
  app.get("/health", async (_req, reply) => {
    let dbOk: boolean | "skipped" = "skipped";
    if (dbAvailable()) {
      try {
        await withDbRetry(async () => getDb().execute(sql`select 1`));
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }
    const ok = dbOk !== false;
    if (!ok) reply.code(503);
    return {
      ok,
      auth: config.authEnabled,
      db: config.dbEnabled,
      dbReachable: dbOk,
      firecrawl: Boolean(config.firecrawlApiKey),
      providers: {
        bedrockMantle: config.bedrockMantleEnabled ? ("configured" as const) : ("disabled" as const),
        anthropic: config.anthropicApiKey ? ("configured" as const) : ("disabled" as const),
        firecrawl: config.firecrawlApiKey ? ("configured" as const) : ("disabled" as const),
        posthog: config.posthogEnabled ? ("configured" as const) : ("disabled" as const),
      },
    };
  });
}

/** Auth still verifies tokens; this uses an unverified subject only for rate-limit fairness. */
function rateLimitKey(req: { headers: { authorization?: string }; ip: string }): string {
  const token = req.headers.authorization?.toLowerCase().startsWith("bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (token) {
    try {
      return decodeJwt(token).sub || req.ip;
    } catch {
      // Invalid tokens are rejected by auth and rate limited by IP here.
    }
  }
  return req.ip;
}
