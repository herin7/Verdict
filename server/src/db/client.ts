import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { config } from "../config.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

function createDb() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(config.databaseUrl);
  return drizzle(sql, { schema });
}

let _db: Db | null = null;

/** Lazy singleton - only connects when db is actually used. */
export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

export function dbAvailable(): boolean {
  return config.dbEnabled;
}

const TRANSIENT_ERR = /fetch failed|socketerror|econnreset|etimedout|other side closed|network/i;

/**
 * Neon's HTTP driver occasionally drops the connection on flaky networks
 * (see neondatabase/serverless#146). Retry transient failures a couple
 * times with a short backoff before giving up.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = String((err as { message?: string; cause?: { message?: string } })?.message ?? err);
      const causeMessage = String((err as { cause?: { message?: string } })?.cause?.message ?? "");
      const isTransient = TRANSIENT_ERR.test(message) || TRANSIENT_ERR.test(causeMessage);
      if (!isTransient || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}
