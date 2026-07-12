import type { FastifyReply, FastifyRequest } from "fastify";
import { isBanned } from "./abuse.js";

/** Block banned IPs/fingerprints before any paid path. */
export async function rejectIfBanned(req: FastifyRequest, reply: FastifyReply) {
  if (await isBanned(req)) {
    return reply.code(403).send({
      error: "Temporarily banned for repeated invalid submissions",
      code: "banned",
    });
  }
}
