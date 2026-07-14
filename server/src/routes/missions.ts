import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { rejectIfBanned } from "../guard/preHandler.js";
import { config } from "../config.js";
import { CreateMissionSchema } from "../missions/types.js";
import {
  approveMission,
  cancelMission,
  createMission,
  getMission,
  listMissions,
  missionsAvailable,
  rejectMission,
  runMissionAgent,
} from "../missions/service.js";

function missionsGuard(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  if (!missionsAvailable()) {
    return reply.code(503).send({
      error: "Shopping Missions require DATABASE_URL (and MISSIONS_ENABLED not false)",
      code: "missions_disabled",
    });
  }
  return null;
}

export async function missionsRoute(app: FastifyInstance) {
  app.get("/missions/status", { preHandler: requireAuth }, async () => ({
    enabled: missionsAvailable(),
    firecrawlMonitors: Boolean(config.firecrawlApiKey),
    webhookConfigured: Boolean(config.publicBaseUrl && config.firecrawlWebhookSecret),
  }));

  app.get("/missions", { preHandler: requireAuth }, async (req, reply) => {
    const blocked = missionsGuard(reply);
    if (blocked) return blocked;
    const items = await listMissions(req.user!.id);
    return { items, enabled: true };
  });

  app.post("/missions", { preHandler: [rejectIfBanned, requireAuth] }, async (req, reply) => {
    const blocked = missionsGuard(reply);
    if (blocked) return blocked;
    const parsed = CreateMissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "title and goal are required" });
    }
    try {
      const mission = await createMission(req.user!.id, parsed.data);
      return reply.code(201).send({ mission });
    } catch (err) {
      req.log.error(err);
      return reply.code(502).send({ error: (err as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/missions/:id",
    { preHandler: requireAuth },
    async (req, reply) => {
      const blocked = missionsGuard(reply);
      if (blocked) return blocked;
      const mission = await getMission(req.user!.id, req.params.id);
      if (!mission) return reply.code(404).send({ error: "Mission not found" });
      return { mission };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/missions/:id/run",
    { preHandler: [rejectIfBanned, requireAuth] },
    async (req, reply) => {
      const blocked = missionsGuard(reply);
      if (blocked) return blocked;
      try {
        const mission = await runMissionAgent(req.user!.id, req.params.id);
        if (!mission) return reply.code(404).send({ error: "Mission not found" });
        return { mission };
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: (err as Error).message });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/missions/:id/approve",
    { preHandler: requireAuth },
    async (req, reply) => {
      const blocked = missionsGuard(reply);
      if (blocked) return blocked;
      try {
        const mission = await approveMission(req.user!.id, req.params.id);
        if (!mission) return reply.code(404).send({ error: "Mission not found" });
        return { mission };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502;
        return reply.code(status).send({ error: (err as Error).message });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/missions/:id/reject",
    { preHandler: requireAuth },
    async (req, reply) => {
      const blocked = missionsGuard(reply);
      if (blocked) return blocked;
      try {
        const mission = await rejectMission(req.user!.id, req.params.id);
        if (!mission) return reply.code(404).send({ error: "Mission not found" });
        return { mission };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 502;
        return reply.code(status).send({ error: (err as Error).message });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/missions/:id/cancel",
    { preHandler: requireAuth },
    async (req, reply) => {
      const blocked = missionsGuard(reply);
      if (blocked) return blocked;
      const mission = await cancelMission(req.user!.id, req.params.id);
      if (!mission) return reply.code(404).send({ error: "Mission not found" });
      return { mission };
    }
  );
}
