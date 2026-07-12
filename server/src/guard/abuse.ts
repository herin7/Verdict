import { createHash } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { dbAvailable, getDb } from "../db/client.js";
import { ipBans, violations } from "../db/schema.js";

const BAN_HOURS = 24;
const VIOLATION_THRESHOLD = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1h rolling window for counting

interface MemViolation {
  at: number;
  reason: string;
}

const memViolations = new Map<string, MemViolation[]>();
const memBans = new Map<string, number>(); // fingerprint -> until ms

function uaHash(ua: string | undefined): string {
  const raw = (ua ?? "unknown").slice(0, 120);
  return createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

/** IP + coarse UA hash - enough for fairness, not PII-heavy. */
export function requestFingerprint(req: FastifyRequest): string {
  const ip = req.ip || "0.0.0.0";
  return `${ip}:${uaHash(req.headers["user-agent"])}`;
}

export function requestIp(req: FastifyRequest): string {
  return req.ip || "0.0.0.0";
}

function pruneMem(fp: string) {
  const now = Date.now();
  const list = (memViolations.get(fp) ?? []).filter((v) => now - v.at < WINDOW_MS);
  if (list.length) memViolations.set(fp, list);
  else memViolations.delete(fp);
  const until = memBans.get(fp);
  if (until && until <= now) memBans.delete(fp);
}

export async function isBanned(req: FastifyRequest): Promise<boolean> {
  const fp = requestFingerprint(req);
  const ip = requestIp(req);
  pruneMem(fp);

  const memUntil = memBans.get(fp) ?? memBans.get(ip);
  if (memUntil && memUntil > Date.now()) return true;

  if (!dbAvailable()) return false;
  try {
    const db = getDb();
    const now = new Date();
    const rows = await db
      .select()
      .from(ipBans)
      .where(and(eq(ipBans.ip, ip), gt(ipBans.until, now)))
      .limit(1);
    if (rows.length > 0) {
      memBans.set(ip, rows[0].until.getTime());
      return true;
    }
  } catch {
    // soft-fail open on DB errors - rate-limit still covers abuse
  }
  return false;
}

export async function recordViolation(
  req: FastifyRequest,
  reason: string
): Promise<{ banned: boolean; count: number }> {
  const fp = requestFingerprint(req);
  const ip = requestIp(req);
  const now = Date.now();

  pruneMem(fp);
  const list = memViolations.get(fp) ?? [];
  list.push({ at: now, reason });
  memViolations.set(fp, list);
  const count = list.length;

  if (dbAvailable()) {
    try {
      const db = getDb();
      await db.insert(violations).values({ fingerprint: fp, reason, ip });
    } catch {
      // ignore persist failures
    }
  }

  if (count >= VIOLATION_THRESHOLD) {
    await banFingerprint(fp, ip);
    return { banned: true, count };
  }
  return { banned: false, count };
}

async function banFingerprint(fp: string, ip: string) {
  const until = Date.now() + BAN_HOURS * 60 * 60 * 1000;
  memBans.set(fp, until);
  memBans.set(ip, until);

  if (!dbAvailable()) return;
  try {
    const db = getDb();
    await db
      .insert(ipBans)
      .values({ ip, until: new Date(until), reason: "repeated_violations" })
      .onConflictDoUpdate({
        target: ipBans.ip,
        set: { until: new Date(until), reason: "repeated_violations" },
      });
  } catch {
    // mem ban still holds
  }
}
