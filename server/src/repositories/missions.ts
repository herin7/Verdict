import { and, desc, eq } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { shoppingMissions } from "../db/schema.js";
import type { MissionConstraints, MissionEvent, MissionProposal, MissionStatus } from "../missions/types.js";
import type { ProductIdentity } from "../schema.js";

export type MissionRow = typeof shoppingMissions.$inferSelect;

export async function insertMission(input: {
  userId: string;
  title: string;
  goal: string;
  country: string;
  constraints: MissionConstraints;
  product: ProductIdentity | null;
  status: MissionStatus;
  events: MissionEvent[];
}): Promise<MissionRow> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .insert(shoppingMissions)
      .values({
        userId: input.userId,
        title: input.title,
        goal: input.goal,
        country: input.country,
        constraints: input.constraints,
        product: input.product,
        status: input.status,
        events: input.events,
      })
      .returning()
  );
  if (!rows[0]) throw new Error("Failed to create mission");
  return rows[0];
}

export async function listMissionsForUser(userId: string, limit = 50): Promise<MissionRow[]> {
  const db = getDb();
  return withDbRetry(() =>
    db
      .select()
      .from(shoppingMissions)
      .where(eq(shoppingMissions.userId, userId))
      .orderBy(desc(shoppingMissions.updatedAt))
      .limit(limit)
  );
}

export async function getMissionForUser(id: string, userId: string): Promise<MissionRow | null> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(shoppingMissions)
      .where(and(eq(shoppingMissions.id, id), eq(shoppingMissions.userId, userId)))
      .limit(1)
  );
  return rows[0] ?? null;
}

export async function getMissionByMonitorId(monitorId: string): Promise<MissionRow | null> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db.select().from(shoppingMissions).where(eq(shoppingMissions.monitorId, monitorId)).limit(1)
  );
  return rows[0] ?? null;
}

export async function updateMission(
  id: string,
  userId: string,
  patch: Partial<{
    status: MissionStatus;
    product: ProductIdentity | null;
    proposal: MissionProposal | null;
    monitorId: string | null;
    events: MissionEvent[];
  }>
): Promise<MissionRow | null> {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .update(shoppingMissions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(shoppingMissions.id, id), eq(shoppingMissions.userId, userId)))
      .returning()
  );
  return rows[0] ?? null;
}

export async function appendMissionEventByMonitor(
  monitorId: string,
  event: MissionEvent
): Promise<MissionRow | null> {
  const existing = await getMissionByMonitorId(monitorId);
  if (!existing) return null;
  const prev = Array.isArray(existing.events) ? (existing.events as MissionEvent[]) : [];
  const events = [...prev, event].slice(-100);
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .update(shoppingMissions)
      .set({ events, updatedAt: new Date() })
      .where(eq(shoppingMissions.id, existing.id))
      .returning()
  );
  return rows[0] ?? null;
}
