import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifyAccessToken, type AuthUser } from "./verify.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function extractBearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!config.authEnabled) {
    // Dev soft-mode: anonymous user so routes still work without Supabase.
    req.user = { id: "dev-anonymous" };
    return;
  }

  const token = extractBearer(req);
  if (!token) {
    return reply.code(401).send({ error: "Missing Authorization bearer token" });
  }

  try {
    req.user = await verifyAccessToken(token);
  } catch (err) {
    req.log.warn({ err }, "auth verify failed");
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user", undefined);
}
