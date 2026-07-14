import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { handleFirecrawlMonitorEvent } from "../missions/service.js";

/**
 * Firecrawl monitor webhook receiver.
 * Soft-disabled unless FIRECRAWL_WEBHOOK_SECRET is set.
 * Auth: header x-verdict-webhook-secret must match.
 */
export async function firecrawlWebhookRoute(app: FastifyInstance) {
  app.post("/webhooks/firecrawl", async (req, reply) => {
    if (!config.firecrawlWebhookSecret) {
      return reply.code(503).send({ error: "Webhook not configured", code: "webhook_disabled" });
    }
    const secret = String(req.headers["x-verdict-webhook-secret"] ?? "");
    if (secret !== config.firecrawlWebhookSecret) {
      return reply.code(401).send({ error: "Invalid webhook secret" });
    }

    const body = (req.body ?? {}) as {
      type?: string;
      data?: Array<{ monitorId?: string; status?: string; isMeaningful?: boolean }>;
    };

    try {
      await handleFirecrawlMonitorEvent(body);
      req.log.info(
        {
          requestId: req.id,
          type: body.type ?? null,
          pageCount: Array.isArray(body.data) ? body.data.length : 0,
        },
        "firecrawl_webhook"
      );
      return { ok: true };
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
