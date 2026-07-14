import { config } from "../config.js";
import { capture } from "../analytics/posthog.js";
import { tryCreatePriceStockMonitor, firecrawlDeleteMonitor, firecrawlEnabled } from "../firecrawl.js";
import { compareProduct } from "../services/compare.js";
import { calculateDeals } from "../deals/calculator.js";
import { getPaymentProfile } from "../repositories/paymentProfiles.js";
import { researchProduct } from "../services/research.js";
import { normalizeCountry } from "../marketplaces/registry.js";
import type { ProductIdentity } from "../schema.js";
import type { PaymentMethodId } from "../deals/offers.js";
import {
  appendMissionEventByMonitor,
  getMissionForUser,
  insertMission,
  listMissionsForUser,
  updateMission,
  type MissionRow,
} from "../repositories/missions.js";
import type {
  CreateMissionSchema,
  MissionConstraints,
  MissionEvent,
  MissionProposal,
} from "./types.js";
import type { z } from "zod";

type CreateInput = z.infer<typeof CreateMissionSchema>;

function event(type: string, meta?: Record<string, unknown>): MissionEvent {
  return { at: Date.now(), type, meta };
}

function toProduct(p: NonNullable<CreateInput["product"]>): ProductIdentity {
  return {
    name: p.name,
    brand: p.brand ?? null,
    category: p.category ?? "general",
    model: p.model ?? null,
    confidence: p.confidence ?? 1,
    searchTerm: p.searchTerm ?? p.name,
  };
}

export function missionsAvailable(): boolean {
  return config.missionsEnabled;
}

export function serializeMission(row: MissionRow) {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    status: row.status,
    country: row.country,
    constraints: row.constraints,
    product: row.product,
    proposal: row.proposal,
    monitorId: row.monitorId,
    events: row.events,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function createMission(userId: string, input: CreateInput) {
  const country = normalizeCountry(input.country);
  const constraints: MissionConstraints = input.constraints ?? {};
  const product = input.product ? toProduct(input.product) : null;
  const runNow = input.runNow !== false;

  const row = await insertMission({
    userId,
    title: input.title,
    goal: input.goal,
    country,
    constraints,
    product,
    status: runNow ? "researching" : "draft",
    events: [event("mission_created", { hasProduct: Boolean(product), runNow })],
  });

  capture("mission_created", userId, {
    country,
    has_product: Boolean(product),
    run_now: runNow,
    auto_monitor: Boolean(constraints.autoMonitor),
  });

  if (!runNow) return serializeMission(row);
  return runMissionAgent(userId, row.id);
}

export async function listMissions(userId: string) {
  const rows = await listMissionsForUser(userId);
  return rows.map(serializeMission);
}

export async function getMission(userId: string, id: string) {
  const row = await getMissionForUser(id, userId);
  return row ? serializeMission(row) : null;
}

/**
 * Agent research pass: compare + deals (+ optional consensus report).
 * Always ends in awaiting_approval — never auto-purchases.
 */
export async function runMissionAgent(userId: string, missionId: string) {
  const existing = await getMissionForUser(missionId, userId);
  if (!existing) return null;

  const baseEvents = [...((existing.events as MissionEvent[]) ?? []), event("agent_started")];
  await updateMission(missionId, userId, {
    status: "researching",
    events: baseEvents,
  });

  const product = existing.product as ProductIdentity | null;
  const constraints = (existing.constraints ?? {}) as MissionConstraints;
  const country = normalizeCountry(existing.country);

  let offersCount = 0;
  let dealsCount = 0;
  let buyLinks: MissionProposal["buyLinks"] = [];
  let verdict: MissionProposal["verdict"] = null;
  let maxPriceOk: boolean | null = null;
  let action: MissionProposal["action"] = "wait";

  try {
    if (product) {
      const compare = await compareProduct(product, { country });
      offersCount = compare.offers.length;
      buyLinks = compare.offers.slice(0, 8).map((o) => ({
        retailer: o.retailerId || o.retailer,
        url: o.url,
        price: o.priceRaw ?? (o.price != null ? String(o.price) : null),
      }));

      if (country === "IN") {
        const methods = (await getPaymentProfile(userId).catch(() => [])) as PaymentMethodId[];
        const deals = calculateDeals(compare.offers, methods);
        dealsCount = deals.length;
      }

      if (constraints.maxPrice != null) {
        const prices = compare.offers
          .map((o) => o.price)
          .filter((n): n is number => n != null);
        const best = prices.length ? Math.min(...prices) : null;
        maxPriceOk = best != null ? best <= constraints.maxPrice : null;
      }

      try {
        const researched = await researchProduct(product, { userId });
        verdict = researched.report?.verdict ?? null;
      } catch {
        // compare/deals alone are enough for a proposal
      }

      if (verdict === "buy" && maxPriceOk !== false) action = "buy";
      else if (constraints.autoMonitor || constraints.watchUrls?.length) action = "monitor";
      else if (verdict === "avoid") action = "skip";
      else action = "wait";
    } else {
      action = constraints.autoMonitor ? "monitor" : "wait";
    }
  } catch (err) {
    const failed = await updateMission(missionId, userId, {
      status: "draft",
      events: [...baseEvents, event("agent_failed", { error: (err as Error).message?.slice(0, 120) })],
    });
    capture("mission_agent_failed", userId, { has_product: Boolean(product) });
    return failed ? serializeMission(failed) : null;
  }

  const proposal: MissionProposal = {
    summary: product
      ? `Found ${offersCount} offers` +
        (dealsCount ? `, ${dealsCount} personalized deals` : "") +
        (verdict ? `. Consensus: ${verdict}` : "") +
        ". Approve to proceed — no purchase happens without you."
      : "No product attached yet. Approve to start monitoring watch URLs, or reject to edit.",
    action,
    requiresApproval: true,
    buyLinks,
    dealsCount,
    offersCount,
    verdict,
    maxPriceOk,
    createdAt: Date.now(),
  };

  const updated = await updateMission(missionId, userId, {
    status: "awaiting_approval",
    proposal,
    events: [
      ...baseEvents,
      event("proposal_ready", {
        action,
        offers_count: offersCount,
        deals_count: dealsCount,
        has_verdict: Boolean(verdict),
      }),
    ],
  });

  capture("mission_proposal_ready", userId, {
    action,
    offers_count: offersCount,
    deals_count: dealsCount,
    has_verdict: Boolean(verdict),
  });

  return updated ? serializeMission(updated) : null;
}

/** Human approval — optionally attaches Firecrawl price monitor. Never purchases. */
export async function approveMission(userId: string, missionId: string) {
  const existing = await getMissionForUser(missionId, userId);
  if (!existing) return null;
  if (existing.status !== "awaiting_approval") {
    throw Object.assign(new Error("Mission is not awaiting approval"), { status: 409 });
  }

  const constraints = (existing.constraints ?? {}) as MissionConstraints;
  const proposal = existing.proposal as MissionProposal | null;
  const urls = [
    ...(constraints.watchUrls ?? []),
    ...((proposal?.buyLinks ?? []).map((b) => b.url).filter(Boolean) as string[]),
  ].slice(0, 10);

  let monitorId: string | null = existing.monitorId;
  const wantMonitor =
    Boolean(constraints.autoMonitor) ||
    proposal?.action === "monitor" ||
    (constraints.watchUrls?.length ?? 0) > 0;

  if (wantMonitor && urls.length > 0 && firecrawlEnabled()) {
    const webhookUrl =
      config.publicBaseUrl && config.firecrawlWebhookSecret
        ? `${config.publicBaseUrl.replace(/\/$/, "")}/webhooks/firecrawl`
        : undefined;
    const monitor = await tryCreatePriceStockMonitor({
      name: `mission:${missionId.slice(0, 8)}`,
      urls,
      goal: existing.goal,
      webhookUrl,
      webhookHeaders: webhookUrl
        ? { "x-verdict-webhook-secret": config.firecrawlWebhookSecret }
        : undefined,
      metadata: { missionId, userId: "redacted" },
    }).catch(() => null);
    if (monitor?.id) monitorId = monitor.id;
  }

  const nextStatus = monitorId ? "monitoring" : proposal?.action === "buy" ? "approved" : "approved";

  const updated = await updateMission(missionId, userId, {
    status: nextStatus,
    monitorId,
    events: [
      ...((existing.events as MissionEvent[]) ?? []),
      event("proposal_approved", { monitor_attached: Boolean(monitorId) }),
    ],
  });

  capture("mission_approved", userId, {
    monitor_attached: Boolean(monitorId),
    action: proposal?.action ?? null,
  });

  return updated ? serializeMission(updated) : null;
}

export async function rejectMission(userId: string, missionId: string) {
  const existing = await getMissionForUser(missionId, userId);
  if (!existing) return null;
  if (existing.status !== "awaiting_approval") {
    throw Object.assign(new Error("Mission is not awaiting approval"), { status: 409 });
  }

  const updated = await updateMission(missionId, userId, {
    status: "rejected",
    events: [...((existing.events as MissionEvent[]) ?? []), event("proposal_rejected")],
  });

  capture("mission_rejected", userId, {});
  return updated ? serializeMission(updated) : null;
}

export async function cancelMission(userId: string, missionId: string) {
  const existing = await getMissionForUser(missionId, userId);
  if (!existing) return null;

  if (existing.monitorId && firecrawlEnabled()) {
    await firecrawlDeleteMonitor(existing.monitorId).catch(() => undefined);
  }

  const updated = await updateMission(missionId, userId, {
    status: "cancelled",
    monitorId: null,
    events: [...((existing.events as MissionEvent[]) ?? []), event("mission_cancelled")],
  });

  capture("mission_cancelled", userId, { had_monitor: Boolean(existing.monitorId) });
  return updated ? serializeMission(updated) : null;
}

/** Firecrawl webhook fan-in — non-PII event only. */
export async function handleFirecrawlMonitorEvent(payload: {
  type?: string;
  data?: Array<{ monitorId?: string; status?: string; isMeaningful?: boolean }>;
}) {
  const type = payload.type ?? "unknown";
  const pages = Array.isArray(payload.data) ? payload.data : [];
  for (const page of pages) {
    if (!page.monitorId) continue;
    await appendMissionEventByMonitor(page.monitorId, {
      at: Date.now(),
      type: `firecrawl_${type.replace(/\./g, "_")}`,
      meta: {
        status: page.status ?? null,
        meaningful: page.isMeaningful ?? null,
      },
    });
    capture("mission_monitor_event", "server", {
      event_type: type,
      status: page.status ?? null,
      meaningful: page.isMeaningful ?? null,
    });
  }
}
