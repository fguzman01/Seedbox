import { count, desc, eq, getTableColumns } from "drizzle-orm";
import { getDb } from "./db/client";
import { pains, signals } from "./db/schema";

export async function getSignalStats() {
  const db = getDb();
  const [[totals], [pending], [painTotals]] = await Promise.all([
    db.select({ total: count() }).from(signals),
    db.select({ pending: count() }).from(signals).where(eq(signals.status, "pending")),
    db.select({ pains: count() }).from(pains),
  ]);
  return { total: totals.total, pending: pending.pending, pains: painTotals.pains };
}

export async function getRecentSignals(limit = 20) {
  return getDb().select().from(signals).orderBy(desc(signals.publishedAt)).limit(limit);
}

export async function getRecentPains(limit = 20) {
  return getDb()
    .select({ ...getTableColumns(pains), url: signals.url, source: signals.source })
    .from(pains)
    .innerJoin(signals, eq(pains.signalId, signals.id))
    .orderBy(desc(signals.publishedAt), pains.id)
    .limit(limit);
}
