import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config.js";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

function createDb() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = postgres(config.databaseUrl, {
    // Small pool: a Lambda instance handles one request at a time.
    max: config.isLambda ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Named prepared statements: without them postgres.js spends an extra round trip describing
    // every parameterized query.
    prepare: true,
    // Skips a type-lookup query on connect; the schema has no Postgres array columns.
    fetch_types: false,
  });
  return drizzle(client, { schema });
}

let _db: Db | null = null;

/** Lazy singleton - only connects when the database is actually used. */
export function getDb(): Db {
  if (!_db) _db = createDb();
  return _db;
}

export function dbAvailable(): boolean {
  return config.dbEnabled;
}

const TRANSIENT_ERR = /econnreset|etimedout|connection terminated|connect_timeout|network/i;

/** Retries transient connection errors a couple of times with a short backoff. */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !TRANSIENT_ERR.test(String((err as Error)?.message ?? err))) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
}
