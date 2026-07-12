import { and, eq, gt } from "drizzle-orm";
import { getDb, withDbRetry } from "../db/client.js";
import { reports } from "../db/schema.js";
import { config } from "../config.js";
import type { ConsensusReport } from "../schema.js";

export async function getFreshReport(productId: string) {
  const db = getDb();
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(reports)
      .where(and(eq(reports.productId, productId), gt(reports.expiresAt, new Date())))
      .limit(1)
  );
  return rows[0] ?? null;
}

export async function upsertReport(productId: string, report: ConsensusReport, model?: string) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + config.reportTtlDays * 24 * 60 * 60 * 1000);
  const values = {
    productId,
    report,
    sources: report.sources ?? [],
    model: model ?? config.anthropicModel,
    expiresAt,
    createdAt: new Date(),
  };

  await withDbRetry(() =>
    db
      .insert(reports)
      .values(values)
      .onConflictDoUpdate({
        target: reports.productId,
        set: {
          report: values.report,
          sources: values.sources,
          model: values.model,
          expiresAt: values.expiresAt,
          createdAt: values.createdAt,
        },
      })
  );
}
