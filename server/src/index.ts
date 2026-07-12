import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { decodeJwt } from "jose";
import { config } from "./config.js";
import { authPlugin } from "./auth/plugin.js";
import { identifyRoute } from "./routes/identify.js";
import { identifyUrlRoute } from "./routes/identifyUrl.js";
import { researchRoute } from "./routes/research.js";
import { buyLinkRoute } from "./routes/buyLink.js";
import { insightsRoute } from "./routes/insights.js";
import { productImageRoute } from "./routes/productImage.js";
import { meRoute } from "./routes/me.js";
import { compareRoute } from "./routes/compare.js";
import { dealsRoute } from "./routes/deals.js";

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
await app.register(identifyRoute);
await app.register(identifyUrlRoute);
await app.register(researchRoute);
await app.register(buyLinkRoute);
await app.register(insightsRoute);
await app.register(productImageRoute);
await app.register(meRoute);
await app.register(compareRoute);
await app.register(dealsRoute);

app.get("/health", async () => ({
  ok: true,
  auth: config.authEnabled,
  db: config.dbEnabled,
}));

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Consensus server on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
