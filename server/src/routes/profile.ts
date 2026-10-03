import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { getProfile, saveProfile } from "../profile/repository.js";
import { BuyerProfileSchema } from "../profile/schema.js";

/** The buyer profile every verdict is personalised against. */
export async function profileRoute(app: FastifyInstance) {
  app.get("/profile", { preHandler: requireAuth }, async (req) => ({ profile: await getProfile(req.user!.id) }));

  /** Whole-profile replace: onboarding, a retake, or a new calibration answer. */
  app.put("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = BuyerProfileSchema.safeParse((req.body as { profile?: unknown } | undefined)?.profile);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid profile" });
    await saveProfile(req.user!.id, parsed.data);
    return { profile: parsed.data };
  });
}
