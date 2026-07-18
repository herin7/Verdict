import { z } from "zod";
import { ProductIdentitySchema } from "../schema.js";

export const MissionStatusSchema = z.enum([
  "draft",
  "researching",
  "awaiting_approval",
  "approved",
  "rejected",
  "monitoring",
  "completed",
  "cancelled",
]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const MissionConstraintsSchema = z.object({
  maxPrice: z.number().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  marketplaces: z.array(z.string()).max(12).optional(),
  watchUrls: z.array(z.string().url()).max(20).optional(),
  autoMonitor: z.boolean().optional(),
});
export type MissionConstraints = z.infer<typeof MissionConstraintsSchema>;

export const MissionProposalSchema = z.object({
  summary: z.string(),
  action: z.enum(["buy", "wait", "monitor", "skip"]),
  /** Human must approve before any purchase link is treated as an action to take. */
  requiresApproval: z.literal(true),
  buyLinks: z
    .array(
      z.object({
        retailer: z.string(),
        url: z.string(),
        price: z.string().nullable().optional(),
      })
    )
    .default([]),
  dealsCount: z.number().int().nonnegative().default(0),
  offersCount: z.number().int().nonnegative().default(0),
  verdict: z.enum(["buy", "wait", "avoid", "mixed"]).nullable().optional(),
  maxPriceOk: z.boolean().nullable().optional(),
  createdAt: z.number(),
});
export type MissionProposal = z.infer<typeof MissionProposalSchema>;

export const MissionEventSchema = z.object({
  at: z.number(),
  type: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type MissionEvent = z.infer<typeof MissionEventSchema>;

export const CreateMissionSchema = z.object({
  title: z.string().min(1).max(120),
  goal: z.string().min(1).max(500),
  country: z.enum(["IN", "US"]).optional(),
  product: ProductIdentitySchema.partial({
    brand: true,
    model: true,
    confidence: true,
    searchTerm: true,
  })
    .extend({ name: z.string().min(1) })
    .optional(),
  constraints: MissionConstraintsSchema.optional(),
  /** If true, agent runs immediately after create. Default true. */
  runNow: z.boolean().optional(),
});
