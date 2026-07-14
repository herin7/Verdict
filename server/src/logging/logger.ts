import pino from "pino";

/**
 * Standalone pino logger for code paths outside a Fastify request (ai gateway,
 * research/provider orchestration, background work). Route handlers should
 * prefer req.log, which is already a pino child bound to that request's id.
 *
 * Never log full prompts, scraped page bodies, images, or secrets here - only
 * the metadata fields below.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

/** Common structured fields for provider/request/route events. All optional - callers fill in what they have. */
export interface LogFields {
  requestId?: string;
  sessionId?: string;
  userId?: string;
  provider?: string;
  workload?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  cache?: "hit" | "miss";
  costUsd?: number;
  ok?: boolean;
  error?: string;
  attempts?: number;
  retries?: number;
  device?: string;
  appVersion?: string;
  networkType?: string;
  [key: string]: unknown;
}
