import {
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category").notNull(),
    model: text("model"),
    searchTerm: text("search_term").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("products_fingerprint_uidx").on(t.fingerprint)]
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    report: jsonb("report").notNull(),
    sources: jsonb("sources").notNull().default([]),
    model: text("model"),
    /** Currency ("INR"/"USD") and country ("IN"/"US") the report was generated
     *  for - a cached report whose currency doesn't match the requesting
     *  user's country is treated as a cache miss (see services/research.ts),
     *  so a report generated for a US user is never silently served to an
     *  IN user (and vice versa) with the wrong currency baked into its text. */
    currency: text("currency"),
    country: text("country"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("reports_product_uidx").on(t.productId)]
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    insight: jsonb("insight").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("insights_product_type_uidx").on(t.productId, t.type)]
);

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("scans_user_idx").on(t.userId),
    index("scans_user_created_idx").on(t.userId, t.createdAt),
  ]
);

export const savedReports = pgTable(
  "saved_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("saved_reports_user_product_uidx").on(t.userId, t.productId),
    index("saved_reports_user_idx").on(t.userId),
  ]
);

export const violations = pgTable(
  "violations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    ip: text("ip"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("violations_fp_idx").on(t.fingerprint), index("violations_ip_idx").on(t.ip)]
);

export const ipBans = pgTable(
  "ip_bans",
  {
    ip: text("ip").primaryKey(),
    until: timestamp("until", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ip_bans_until_idx").on(t.until)]
);

/**
 * One row per thing a user shared to Verdict. This row *is* the job: its
 * status moves queued → identifying → researching → ready (or needs_input /
 * failed), and the app's inbox is just these rows.
 */
export const shares = pgTable(
  "shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    /** Generated on the phone; makes POST /shares safe to retry. */
    clientId: text("client_id").notNull(),
    kind: text("kind").notNull(), // image | url | text
    /** sha256 of the shared bytes/text, to collapse repeat shares of the same thing. */
    contentHash: text("content_hash").notNull(),
    inputText: text("input_text"),
    inputUrl: text("input_url"),
    imageKey: text("image_key"),
    status: text("status").notNull().default("queued"),
    /** Human-readable progress step shown in the app while working. */
    stage: text("stage"),
    extractedText: text("extracted_text"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    product: jsonb("product"),
    /** This user's verdict: the shared report weighed against their buyer profile. Null without a profile. */
    personal: jsonb("personal"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    /** Milliseconds spent per stage, for latency profiling. */
    timings: jsonb("timings").notNull().default({}),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("shares_user_client_uidx").on(t.userId, t.clientId),
    index("shares_user_updated_idx").on(t.userId, t.updatedAt),
    index("shares_user_hash_idx").on(t.userId, t.contentHash),
  ]
);

/** Onboarding answers (plus later calibration), one row per user. See profile/schema.ts. */
export const buyerProfiles = pgTable("buyer_profiles", {
  userId: text("user_id").primaryKey(),
  profile: jsonb("profile").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Expo push tokens, one row per installed app. */
export const devices = pgTable("devices", {
  expoToken: text("expo_token").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Who is currently researching a product. Two shares of the same product
 * at the same time produce one research run; the second waits for the first.
 */
export const researchRuns = pgTable("research_runs", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
});
