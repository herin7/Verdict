import {
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

export const buyLinks = pgTable(
  "buy_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    links: jsonb("links").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("buy_links_product_uidx").on(t.productId)]
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

export const marketplaceOffers = pgTable(
  "marketplace_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    offers: jsonb("offers").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("marketplace_offers_product_uidx").on(t.productId)]
);

export const paymentProfiles = pgTable(
  "payment_profiles",
  {
    userId: text("user_id").primaryKey(),
    methods: jsonb("methods").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

/** Autonomous shopping missions - agent proposes, human approves. */
export const shoppingMissions = pgTable(
  "shopping_missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    goal: text("goal").notNull(),
    status: text("status").notNull().default("draft"),
    country: text("country").notNull().default("IN"),
    constraints: jsonb("constraints").notNull().default({}),
    product: jsonb("product"),
    proposal: jsonb("proposal"),
    monitorId: text("monitor_id"),
    events: jsonb("events").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("shopping_missions_user_idx").on(t.userId),
    index("shopping_missions_user_status_idx").on(t.userId, t.status),
    index("shopping_missions_monitor_idx").on(t.monitorId),
  ]
);
